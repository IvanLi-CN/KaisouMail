import type { RuntimeConfig, WorkerEnv } from "../env";
import { signPayload, verifyPayload } from "../lib/crypto";
import { ApiError } from "../lib/errors";
import type { AuthUser } from "../types";
import {
  bindExternalAccount,
  consumeInviteForAuthenticatedUser,
  findUserByExternalAccount,
  getRegistrationSettings,
  markExternalAccountUsed,
  registerViaExternalProvider,
  resolveExternalRegistrationRequirement,
  resolveStoredOauthConfig,
  verifyAdminTransferReauthSubject,
} from "./identity";

type Provider = "github" | "linuxdo";
type Intent = "login" | "bind" | "admin-transfer";

type OAuthStatePayload = {
  provider: Provider;
  intent: Intent;
  returnTo: string;
  inviteCode: string | null;
  userId: string | null;
  adminTransferIntentToken: string | null;
  iat: number;
  exp: number;
};

type ProviderProfile = {
  provider: Provider;
  providerUserId: string;
  providerUsername: string | null;
  providerNickname: string | null;
  avatarUrl: string | null;
  profileUrl: string | null;
};

export type PendingRegistrationPayload = {
  method: Provider | "passkey";
  sourceIntent: "login" | "register";
  redirectTo: string;
  inviteCode: string | null;
  profile?: ProviderProfile;
  iat: number;
  exp: number;
};

export type PendingAdminTransferPayload = {
  method: Provider;
  actorUserId: string;
  targetUserId: string;
  verificationToken: string;
  iat: number;
  exp: number;
};

const STATE_TTL_SECONDS = 60 * 10;
const PENDING_REGISTRATION_TTL_SECONDS = 60 * 15;
const PENDING_ADMIN_TRANSFER_TTL_SECONDS = 60 * 10;

const ensureProvider = (value: string): Provider => {
  if (value === "github" || value === "linuxdo") return value;
  throw new ApiError(404, "Provider not found");
};

const resolveBaseOrigin = (request: Request) => {
  const forwardedProto = request.headers.get("x-forwarded-proto");
  const forwardedHost = request.headers.get("x-forwarded-host");
  if (forwardedProto && forwardedHost) {
    return `${forwardedProto}://${forwardedHost}`;
  }
  return new URL(request.url).origin;
};

const resolveSafeReturnTo = (
  value: string | null | undefined,
  fallback: string,
) => (value?.startsWith("/") ? value : fallback);

const redirectWithError = (path: string, message: string) => {
  const url = new URL(path, "https://redirect.local");
  url.searchParams.set("error", message);
  return url.pathname + url.search;
};

const resolveSourceIntent = (returnTo: string): "login" | "register" =>
  returnTo === "/login" ? "login" : "register";

const redirectToRegisterStep = (token: string, returnTo: string) => {
  const url = new URL("/register/complete", "https://redirect.local");
  url.searchParams.set("token", token);
  if (returnTo.startsWith("/") && !["/login", "/register"].includes(returnTo)) {
    url.searchParams.set("returnTo", returnTo);
  }
  return url.pathname + url.search;
};

const redirectToAdminTransfer = (
  path: string,
  payload: {
    verificationToken: string;
    method: Provider;
    targetUserId: string;
  },
) => {
  const url = new URL(path, "https://redirect.local");
  url.searchParams.set("transferVerification", payload.verificationToken);
  url.searchParams.set("transferMethod", payload.method);
  url.searchParams.set("transferTarget", payload.targetUserId);
  return url.pathname + url.search;
};

const getProviderConfig = async (
  env: WorkerEnv,
  config: RuntimeConfig,
  provider: Provider,
) => {
  const settings = await getRegistrationSettings(env);
  const oauth = resolveStoredOauthConfig(settings, config);
  if (provider === "github") {
    if (!oauth.githubClientId || !oauth.githubClientSecret) {
      throw new ApiError(503, "GitHub auth is not configured");
    }
    return {
      authorizeUrl: "https://github.com/login/oauth/authorize",
      tokenUrl: "https://github.com/login/oauth/access_token",
      userUrl: "https://api.github.com/user",
      clientId: oauth.githubClientId,
      clientSecret: oauth.githubClientSecret,
      scopes: oauth.githubOauthScopes.split(/[,\s]+/).filter(Boolean),
    };
  }

  if (!oauth.linuxdoClientId || !oauth.linuxdoClientSecret) {
    throw new ApiError(503, "LinuxDO auth is not configured");
  }

  const base = oauth.linuxdoOauthBaseUrl;
  return {
    authorizeUrl: `${base}/oauth2/authorize`,
    tokenUrl: `${base}/oauth2/token`,
    userUrl: `${base}/api/user`,
    clientId: oauth.linuxdoClientId,
    clientSecret: oauth.linuxdoClientSecret,
    scopes: ["read"],
  };
};

const signState = async (
  config: RuntimeConfig,
  payload: Omit<OAuthStatePayload, "iat" | "exp">,
) => {
  const now = Math.floor(Date.now() / 1000);
  return signPayload(
    {
      ...payload,
      iat: now,
      exp: now + STATE_TTL_SECONDS,
    },
    config.SESSION_SECRET,
  );
};

const verifyState = async (config: RuntimeConfig, state: string) => {
  const payload = await verifyPayload<OAuthStatePayload>(
    state,
    config.SESSION_SECRET,
  );
  if (!payload) {
    throw new ApiError(400, "Invalid OAuth state");
  }
  return payload;
};

export const buildProviderStartUrl = async (
  config: RuntimeConfig,
  request: Request,
  env: WorkerEnv,
  providerValue: string,
  options: {
    intent: Intent;
    inviteCode?: string | null;
    returnTo?: string | null;
    currentUser?: AuthUser | null;
    adminTransferIntentToken?: string | null;
  },
) => {
  const provider = ensureProvider(providerValue);
  const providerConfig = await getProviderConfig(env, config, provider);
  const baseOrigin = resolveBaseOrigin(request);
  const callbackUrl = `${baseOrigin}/api/auth/${provider}/callback`;
  const state = await signState(config, {
    provider,
    intent: options.intent,
    inviteCode: options.inviteCode?.trim() || null,
    returnTo: resolveSafeReturnTo(
      options.returnTo,
      options.intent === "bind"
        ? "/api-keys"
        : options.intent === "admin-transfer"
          ? "/users"
          : "/login",
    ),
    userId: options.currentUser?.id ?? null,
    adminTransferIntentToken: options.adminTransferIntentToken?.trim() || null,
  });

  const url = new URL(providerConfig.authorizeUrl);
  url.searchParams.set("client_id", providerConfig.clientId);
  url.searchParams.set("redirect_uri", callbackUrl);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("state", state);
  url.searchParams.set("scope", providerConfig.scopes.join(" "));
  return url.toString();
};

export const issuePendingRegistrationToken = async (
  config: RuntimeConfig,
  payload: Omit<PendingRegistrationPayload, "iat" | "exp">,
) => {
  const now = Math.floor(Date.now() / 1000);
  return signPayload(
    {
      ...payload,
      iat: now,
      exp: now + PENDING_REGISTRATION_TTL_SECONDS,
    },
    config.SESSION_SECRET,
  );
};

export const issuePendingAdminTransferToken = async (
  config: RuntimeConfig,
  payload: Omit<PendingAdminTransferPayload, "iat" | "exp">,
) => {
  const now = Math.floor(Date.now() / 1000);
  return signPayload(
    {
      ...payload,
      iat: now,
      exp: now + PENDING_ADMIN_TRANSFER_TTL_SECONDS,
    },
    config.SESSION_SECRET,
  );
};

export const resolvePendingAdminTransfer = async (
  config: RuntimeConfig,
  token: string,
) => {
  const payload = await verifyPayload<PendingAdminTransferPayload>(
    token,
    config.SESSION_SECRET,
  );
  if (!payload) {
    throw new ApiError(400, "Admin transfer verification expired");
  }
  return payload;
};

export const resolvePendingRegistration = async (
  env: WorkerEnv,
  config: RuntimeConfig,
  token: string,
) => {
  const payload = await verifyPayload<PendingRegistrationPayload>(
    token,
    config.SESSION_SECRET,
  );
  if (!payload) {
    throw new ApiError(400, "Registration state expired");
  }

  if (payload.method === "passkey") {
    return {
      token,
      method: payload.method,
      sourceIntent: payload.sourceIntent,
      redirectTo: payload.redirectTo,
      inviteRequired: true,
      invitePrevalidated: Boolean(payload.inviteCode),
      canComplete: true,
      suggestedNickname: null,
      error: null,
    } as const;
  }

  const requirement = await resolveExternalRegistrationRequirement(
    env,
    payload.method,
    payload.inviteCode,
  );
  return {
    token,
    method: payload.method,
    sourceIntent: payload.sourceIntent,
    redirectTo: payload.redirectTo,
    inviteRequired: requirement.inviteRequired,
    invitePrevalidated: requirement.invitePrevalidated,
    canComplete: true,
    suggestedNickname:
      payload.profile?.providerNickname?.trim() ||
      payload.profile?.providerUsername?.trim() ||
      null,
    error: null,
  } as const;
};

export const completePendingExternalRegistration = async (
  env: WorkerEnv,
  config: RuntimeConfig,
  input: {
    token: string;
    nickname: string;
    inviteCode?: string | null;
  },
) => {
  const payload = await verifyPayload<PendingRegistrationPayload>(
    input.token,
    config.SESSION_SECRET,
  );
  if (!payload || payload.method === "passkey" || !payload.profile) {
    throw new ApiError(400, "Registration state expired");
  }

  return registerViaExternalProvider(env, payload.method, payload.profile, {
    inviteCode: input.inviteCode ?? payload.inviteCode,
    nickname: input.nickname,
  });
};

const exchangeCodeForToken = async (
  env: WorkerEnv,
  config: RuntimeConfig,
  request: Request,
  provider: Provider,
  code: string,
) => {
  const providerConfig = await getProviderConfig(env, config, provider);
  const callbackUrl = `${resolveBaseOrigin(request)}/api/auth/${provider}/callback`;
  const response = await fetch(providerConfig.tokenUrl, {
    method: "POST",
    headers: {
      accept: "application/json",
      "content-type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      client_id: providerConfig.clientId,
      client_secret: providerConfig.clientSecret,
      code,
      redirect_uri: callbackUrl,
      grant_type: "authorization_code",
    }),
  });
  if (!response.ok) {
    throw new ApiError(502, "OAuth token exchange failed");
  }
  const payload = (await response.json()) as { access_token?: string };
  if (!payload.access_token) {
    throw new ApiError(502, "OAuth token exchange failed");
  }
  return payload.access_token;
};

const fetchProviderProfile = async (
  env: WorkerEnv,
  config: RuntimeConfig,
  request: Request,
  provider: Provider,
  code: string,
): Promise<ProviderProfile> => {
  const providerConfig = await getProviderConfig(env, config, provider);
  const accessToken = await exchangeCodeForToken(
    env,
    config,
    request,
    provider,
    code,
  );
  const response = await fetch(providerConfig.userUrl, {
    headers: {
      authorization: `Bearer ${accessToken}`,
      accept: "application/json",
      "user-agent": "KaisouMail",
    },
  });
  if (!response.ok) {
    throw new ApiError(502, "OAuth profile fetch failed");
  }
  const payload = (await response.json()) as Record<string, unknown>;
  if (provider === "github") {
    const id = payload.id;
    if (typeof id !== "number" && typeof id !== "string") {
      throw new ApiError(502, "OAuth profile is invalid");
    }
    return {
      provider,
      providerUserId: String(id),
      providerUsername:
        typeof payload.login === "string" ? payload.login : null,
      providerNickname: typeof payload.name === "string" ? payload.name : null,
      avatarUrl:
        typeof payload.avatar_url === "string" ? payload.avatar_url : null,
      profileUrl:
        typeof payload.html_url === "string" ? payload.html_url : null,
    };
  }

  const id = payload.id;
  if (typeof id !== "number" && typeof id !== "string") {
    throw new ApiError(502, "OAuth profile is invalid");
  }
  return {
    provider,
    providerUserId: String(id),
    providerUsername:
      typeof payload.username === "string" ? payload.username : null,
    providerNickname: typeof payload.name === "string" ? payload.name : null,
    avatarUrl:
      typeof payload.avatar_template === "string" &&
      payload.avatar_template.startsWith("http")
        ? payload.avatar_template
        : null,
    profileUrl: null,
  };
};

export const completeProviderCallback = async (
  env: WorkerEnv,
  config: RuntimeConfig,
  request: Request,
  providerValue: string,
  query: URLSearchParams,
) => {
  const provider = ensureProvider(providerValue);
  const error = query.get("error");
  const stateToken = query.get("state");
  const code = query.get("code");
  if (!stateToken) throw new ApiError(400, "Missing OAuth state");
  const state = await verifyState(config, stateToken);
  if (state.provider !== provider) {
    throw new ApiError(400, "OAuth state does not match provider");
  }
  if (error) {
    return {
      redirectTo: redirectWithError(state.returnTo, error),
      user: null,
    };
  }
  if (!code) throw new ApiError(400, "Missing OAuth code");

  const profile = await fetchProviderProfile(
    env,
    config,
    request,
    provider,
    code,
  );
  if (state.intent === "bind") {
    if (!state.userId) {
      throw new ApiError(401, "Authentication required");
    }
    const externalAccount = await bindExternalAccount(
      env,
      state.userId,
      profile,
    );
    return {
      redirectTo: state.returnTo,
      user: null,
      externalAccount,
    };
  }

  if (state.intent === "admin-transfer") {
    if (!state.userId || !state.adminTransferIntentToken) {
      throw new ApiError(401, "Authentication required");
    }
    const existing = await findUserByExternalAccount(
      env,
      provider,
      profile.providerUserId,
    );
    if (!existing || existing.deletedAt || existing.id !== state.userId) {
      throw new ApiError(403, "Admin transfer verification failed");
    }
    await markExternalAccountUsed(env, existing.externalAccountId);
    const verification = await verifyAdminTransferReauthSubject(
      env,
      config,
      state.userId,
      {
        intentToken: state.adminTransferIntentToken,
        method: provider,
        authenticatedUserId: existing.id,
      },
    );
    return {
      redirectTo: redirectToAdminTransfer(state.returnTo, {
        verificationToken: verification.verificationToken,
        method: provider,
        targetUserId: verification.targetUserId,
      }),
      user: {
        id: existing.id,
        username: existing.username,
        nickname: existing.nickname,
        role: existing.role === "admin" ? "admin" : "member",
      } satisfies AuthUser,
    };
  }

  const existing = await findUserByExternalAccount(
    env,
    provider,
    profile.providerUserId,
  );
  if (existing && !existing.deletedAt) {
    if (state.inviteCode) {
      await consumeInviteForAuthenticatedUser(
        env,
        existing.id,
        state.inviteCode,
      );
    }
    await markExternalAccountUsed(env, existing.externalAccountId);
    return {
      redirectTo: state.returnTo === "/login" ? "/workspace" : state.returnTo,
      user: {
        id: existing.id,
        username: existing.username,
        nickname: existing.nickname,
        role: existing.role === "admin" ? "admin" : "member",
      } satisfies AuthUser,
    };
  }

  return {
    redirectTo: redirectToRegisterStep(
      await issuePendingRegistrationToken(config, {
        method: provider,
        sourceIntent: resolveSourceIntent(state.returnTo),
        redirectTo: state.returnTo === "/login" ? "/workspace" : state.returnTo,
        inviteCode: state.inviteCode,
        profile,
      }),
      state.returnTo,
    ),
    user: null,
  };
};
