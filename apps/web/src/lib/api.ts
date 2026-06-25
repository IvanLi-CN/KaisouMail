import {
  accountResponseSchema,
  adminTransferApiKeyReauthRequestSchema,
  adminTransferPasskeyReauthRequestSchema,
  adminTransferVerificationResponseSchema,
  apiErrorSchema,
  apiMetaResponseSchema,
  authProvidersResponseSchema,
  bindDomainRequestSchema,
  completeExternalRegistrationRequestSchema,
  completePasskeyRegistrationRequestSchema,
  createAdminTransferIntentResponseSchema,
  createApiKeyResponseSchema,
  createDomainRequestSchema,
  createInviteRequestSchema,
  createInviteResponseSchema,
  createMailboxRequestSchema,
  domainCutoverTaskAcceptedResponseSchema,
  domainCutoverTaskResponseSchema,
  domainSchema,
  ensureMailboxRequestSchema,
  listApiKeysResponseSchema,
  listDomainCatalogResponseSchema,
  listDomainsResponseSchema,
  listExternalAccountsResponseSchema,
  listInvitesResponseSchema,
  listMailboxesResponseSchema,
  listMessagesResponseSchema,
  listPasskeysResponseSchema,
  listUsersResponseSchema,
  type mailboxListScopes,
  mailboxSchema,
  type mailboxStatuses,
  messageDetailResponseSchema,
  passkeyInviteRegistrationOptionsRequestSchema,
  passkeySchema,
  pendingRegistrationQuerySchema,
  pendingRegistrationResponseSchema,
  registrationSettingsResponseSchema,
  resetMailboxTtlRequestSchema,
  sessionResponseSchema,
  startPasskeyRegistrationRequestSchema,
  startProviderRegistrationRequestSchema,
  startProviderRegistrationResponseSchema,
  updateAccountRequestSchema,
  updateMailboxTagsRequestSchema,
  updateRegistrationSettingsRequestSchema,
  versionResponseSchema,
} from "@kaisoumail/shared";
import type {
  AuthenticationResponseJSON,
  PublicKeyCredentialCreationOptionsJSON,
  PublicKeyCredentialRequestOptionsJSON,
  RegistrationResponseJSON,
} from "@simplewebauthn/browser";

import { demoApi } from "@/lib/demo-store";

const SAME_ORIGIN_API_BASE = "";

const trimTrailingSlash = (value: string) => value.replace(/\/+$/, "");

const normalizeOrigin = (value: string | null | undefined) => {
  const trimmedValue = value?.trim();
  if (!trimmedValue) {
    return null;
  }

  try {
    return new URL(trimmedValue).origin;
  } catch {
    return null;
  }
};

export const resolveApiBase = ({
  configuredBaseUrl = import.meta.env.VITE_API_BASE_URL,
  currentLocation = typeof window !== "undefined" ? window.location : undefined,
  preferSameOrigin = currentLocation !== undefined,
}: {
  configuredBaseUrl?: string;
  currentLocation?: Pick<Location, "hostname">;
  preferSameOrigin?: boolean;
} = {}) => {
  if (preferSameOrigin && currentLocation) {
    return SAME_ORIGIN_API_BASE;
  }

  const configuredBase = configuredBaseUrl?.trim();
  return configuredBase ? trimTrailingSlash(configuredBase) : "";
};

export const resolveApiOrigin = ({
  configuredBaseUrl = import.meta.env.VITE_API_BASE_URL,
  currentLocation = typeof window !== "undefined" ? window.location : undefined,
}: {
  configuredBaseUrl?: string;
  currentLocation?: Pick<Location, "hostname" | "origin">;
} = {}) => {
  const apiBase = resolveApiBase({ configuredBaseUrl, currentLocation });
  if (!apiBase) {
    return normalizeOrigin(currentLocation?.origin);
  }

  try {
    return new URL(apiBase, currentLocation?.origin).origin;
  } catch {
    return null;
  }
};

const API_BASE = resolveApiBase();
const DEMO_MODE = import.meta.env.VITE_DEMO_MODE === "true";
type MailboxListScope = (typeof mailboxListScopes)[number];
type MailboxStatus = (typeof mailboxStatuses)[number];

const toCanonicalMailDomainPayload = <
  T extends {
    mailDomain?: string;
    rootDomain?: string;
  },
>(
  payload: T,
) => {
  const { rootDomain: _deprecatedRootDomain, ...rest } = payload;
  return rest as Omit<T, "rootDomain">;
};

export class ApiClientError extends Error {
  constructor(
    message: string,
    public readonly details: unknown = null,
    public readonly status: number | null = null,
    public readonly retryAfterSeconds: number | null = null,
  ) {
    super(message);
  }
}

const appendScopeParam = (
  params: URLSearchParams,
  scope?: MailboxListScope,
) => {
  if (scope && scope !== "default") {
    params.set("scope", scope);
  }
};

const sleep = (ms: number) =>
  new Promise<void>((resolve) => {
    setTimeout(resolve, ms);
  });

const requestJson = async <T>(
  path: string,
  init: RequestInit,
  parser: (value: unknown) => T,
) => {
  const headers = new Headers(init.headers ?? undefined);
  if (init.body && !headers.has("content-type")) {
    headers.set("content-type", "application/json");
  }

  const response = await fetch(`${API_BASE}${path}`, {
    credentials: "include",
    ...init,
    headers,
  });
  if (response.status === 204) return parser({});
  const payload = await response.json();
  if (!response.ok) {
    const parsedError = apiErrorSchema.safeParse(payload);
    if (parsedError.success) {
      const retryAfterHeader = response.headers.get("retry-after");
      const retryAfterSeconds =
        retryAfterHeader && /^\d+$/.test(retryAfterHeader)
          ? Number(retryAfterHeader)
          : null;
      throw new ApiClientError(
        parsedError.data.error,
        parsedError.data.details ?? null,
        response.status,
        retryAfterSeconds,
      );
    }
    throw new ApiClientError(
      "Request failed",
      null,
      response.status,
      response.headers.get("retry-after") &&
        /^\d+$/.test(response.headers.get("retry-after") ?? "")
        ? Number(response.headers.get("retry-after"))
        : null,
    );
  }
  return parser(payload);
};

const getDomainCutoverTask = async (taskId: string) =>
  requestJson(
    `/api/domain-cutover-tasks/${taskId}`,
    { method: "GET" },
    (value) => domainCutoverTaskResponseSchema.parse(value).task,
  );

const waitForDomainCutoverTask = async (taskId: string) => {
  for (let attempt = 0; attempt < 300; attempt += 1) {
    const task = await getDomainCutoverTask(taskId);
    if (task.status === "completed") {
      return task;
    }
    if (task.status === "failed") {
      throw new ApiClientError(
        task.error ?? "Domain cutover failed",
        { task },
        409,
      );
    }
    await sleep(attempt < 10 ? 500 : 1_000);
  }

  throw new ApiClientError("Domain cutover timed out", { taskId }, 504);
};

export const apiClient = {
  async getSession() {
    if (DEMO_MODE) return demoApi.getSession();
    return requestJson("/api/auth/session", { method: "GET" }, (value) =>
      sessionResponseSchema.parse(value),
    );
  },
  async login(apiKey: string) {
    if (DEMO_MODE) return demoApi.login(apiKey);
    return requestJson(
      "/api/auth/session",
      { method: "POST", body: JSON.stringify({ apiKey }) },
      (value) => sessionResponseSchema.parse(value),
    );
  },
  async createPasskeyAuthenticationOptions() {
    return requestJson(
      "/api/auth/passkey/options",
      { method: "POST" },
      (value) => value as PublicKeyCredentialRequestOptionsJSON,
    );
  },
  async verifyPasskeyAuthentication(response: AuthenticationResponseJSON) {
    return requestJson(
      "/api/auth/passkey/verify",
      { method: "POST", body: JSON.stringify({ response }) },
      (value) => sessionResponseSchema.parse(value),
    );
  },
  async createAdminTransferIntent(userId: string) {
    if (DEMO_MODE) return demoApi.createAdminTransferIntent(userId);
    return requestJson(
      `/api/admin/users/${userId}/transfer-admin/intent`,
      { method: "POST" },
      (value) => createAdminTransferIntentResponseSchema.parse(value),
    );
  },
  async createAdminTransferPasskeyOptions(userId: string, intentToken: string) {
    const payload = adminTransferPasskeyReauthRequestSchema.parse({
      intentToken,
    });
    return requestJson(
      `/api/admin/users/${userId}/transfer-admin/verify/passkey/options`,
      { method: "POST", body: JSON.stringify(payload) },
      (value) => value as PublicKeyCredentialRequestOptionsJSON,
    );
  },
  async verifyAdminTransferPasskey(
    userId: string,
    input: {
      intentToken: string;
      response: AuthenticationResponseJSON;
    },
  ) {
    if (DEMO_MODE) return demoApi.verifyAdminTransferPasskey(userId, input);
    return requestJson(
      `/api/admin/users/${userId}/transfer-admin/verify/passkey`,
      { method: "POST", body: JSON.stringify(input) },
      (value) => adminTransferVerificationResponseSchema.parse(value),
    );
  },
  async verifyAdminTransferApiKey(
    userId: string,
    input: {
      intentToken: string;
      apiKey: string;
    },
  ) {
    const payload = adminTransferApiKeyReauthRequestSchema.parse(input);
    if (DEMO_MODE) return demoApi.verifyAdminTransferApiKey(userId, payload);
    return requestJson(
      `/api/admin/users/${userId}/transfer-admin/verify/api-key`,
      { method: "POST", body: JSON.stringify(payload) },
      (value) => adminTransferVerificationResponseSchema.parse(value),
    );
  },
  async listAuthProviders() {
    if (DEMO_MODE) return demoApi.listAuthProviders();
    const payload = await requestJson(
      "/api/auth/providers",
      { method: "GET" },
      (value) => authProvidersResponseSchema.parse(value),
    );
    return payload.providers;
  },
  getProviderStartUrl(
    provider: "github" | "linuxdo",
    options?: {
      intent?: "login" | "register" | "bind" | "admin-transfer";
      inviteCode?: string;
      returnTo?: string;
      intentToken?: string;
    },
  ) {
    if (DEMO_MODE) {
      return demoApi.getProviderStartUrl(provider, {
        intent: options?.intent,
        inviteCode: options?.inviteCode,
      });
    }
    const params = new URLSearchParams();
    if (options?.intent) params.set("intent", options.intent);
    if (options?.inviteCode) params.set("inviteCode", options.inviteCode);
    if (options?.returnTo) params.set("returnTo", options.returnTo);
    if (options?.intentToken) params.set("intentToken", options.intentToken);
    return `${API_BASE}/api/auth/${provider}/start${
      params.size ? `?${params.toString()}` : ""
    }`;
  },
  async startProviderRegistration(
    provider: "github" | "linuxdo",
    input?: {
      inviteCode?: string;
      returnTo?: string;
    },
  ) {
    const payload = startProviderRegistrationRequestSchema.parse(input ?? {});
    if (DEMO_MODE) {
      return demoApi.startProviderRegistration(provider, payload);
    }
    return requestJson(
      `/api/auth/${provider}/register/start`,
      { method: "POST", body: JSON.stringify(payload) },
      (value) => startProviderRegistrationResponseSchema.parse(value),
    );
  },
  async startPasskeyRegistration(input?: { inviteCode?: string }) {
    const payload = startPasskeyRegistrationRequestSchema.parse(input ?? {});
    if (DEMO_MODE) return demoApi.startPasskeyRegistration(payload);
    return requestJson(
      "/api/auth/passkey/register/start",
      { method: "POST", body: JSON.stringify(payload) },
      (value) => pendingRegistrationResponseSchema.parse(value),
    );
  },
  async getPendingRegistration(token: string) {
    const query = pendingRegistrationQuerySchema.parse({ token });
    if (DEMO_MODE) return demoApi.getPendingRegistration(query.token);
    const params = new URLSearchParams(query);
    return requestJson(
      `/api/auth/registration/pending?${params.toString()}`,
      { method: "GET" },
      (value) => pendingRegistrationResponseSchema.parse(value),
    );
  },
  async completeExternalRegistration(input: {
    token: string;
    nickname: string;
    inviteCode?: string;
  }) {
    const payload = completeExternalRegistrationRequestSchema.parse(input);
    if (DEMO_MODE) return demoApi.completeExternalRegistration(payload);
    return requestJson(
      "/api/auth/registration/external/complete",
      { method: "POST", body: JSON.stringify(payload) },
      (value) => sessionResponseSchema.parse(value),
    );
  },
  async getAccount() {
    if (DEMO_MODE) return demoApi.getAccount();
    return requestJson("/api/account", { method: "GET" }, (value) =>
      accountResponseSchema.parse(value),
    );
  },
  async updateAccount(input: { nickname: string }) {
    const payload = updateAccountRequestSchema.parse(input);
    if (DEMO_MODE) return demoApi.updateAccount(payload);
    return requestJson(
      "/api/account",
      { method: "PATCH", body: JSON.stringify(payload) },
      (value) => accountResponseSchema.parse(value),
    );
  },
  async deleteAccount() {
    if (DEMO_MODE) return demoApi.deleteAccount();
    const response = await fetch(`${API_BASE}/api/account`, {
      method: "DELETE",
      credentials: "include",
    });
    if (!response.ok && response.status !== 204) {
      throw new Error("Account deletion failed");
    }
  },
  async listExternalAccounts() {
    if (DEMO_MODE) return demoApi.listExternalAccounts();
    const payload = await requestJson(
      "/api/account/external-accounts",
      { method: "GET" },
      (value) => listExternalAccountsResponseSchema.parse(value),
    );
    return payload.externalAccounts;
  },
  async unlinkExternalAccount(id: string) {
    if (DEMO_MODE) return demoApi.unlinkExternalAccount(id);
    const response = await fetch(
      `${API_BASE}/api/account/external-accounts/${id}`,
      {
        method: "DELETE",
        credentials: "include",
      },
    );
    if (!response.ok && response.status !== 204) {
      throw new Error("External account unlink failed");
    }
  },
  async logout() {
    if (DEMO_MODE) return demoApi.logout();
    const response = await fetch(`${API_BASE}/api/auth/session`, {
      method: "DELETE",
      credentials: "include",
    });
    if (!response.ok && response.status !== 204)
      throw new Error("Logout failed");
  },
  async getVersion() {
    if (DEMO_MODE) return demoApi.getVersion();
    return requestJson("/api/version", { method: "GET" }, (value) =>
      versionResponseSchema.parse(value),
    );
  },
  async getMeta() {
    if (DEMO_MODE) return demoApi.getMeta();
    return requestJson("/api/meta", { method: "GET" }, (value) =>
      apiMetaResponseSchema.parse(value),
    );
  },
  async listMailboxes(options?: {
    scope?: MailboxListScope;
    status?: MailboxStatus | MailboxStatus[];
    tags?: string[];
  }) {
    if (DEMO_MODE) return demoApi.listMailboxes(options);
    const params = new URLSearchParams();
    appendScopeParam(params, options?.scope);
    if (options?.status) {
      const statuses = Array.isArray(options.status)
        ? options.status
        : [options.status];
      for (const status of statuses) params.append("status", status);
    }
    for (const tag of options?.tags ?? []) params.append("tag", tag);
    const payload = await requestJson(
      `/api/mailboxes${params.size > 0 ? `?${params.toString()}` : ""}`,
      { method: "GET" },
      (value) => listMailboxesResponseSchema.parse(value),
    );
    return payload.mailboxes;
  },
  async getMailbox(id: string) {
    if (DEMO_MODE) return demoApi.getMailbox(id);
    return requestJson(`/api/mailboxes/${id}`, { method: "GET" }, (value) =>
      mailboxSchema.parse(value),
    );
  },
  async createMailbox(input: {
    localPart?: string;
    subdomain?: string;
    mailDomain?: string;
    rootDomain?: string;
    expiresInMinutes?: number | null;
    tags?: string[];
  }) {
    const payload = toCanonicalMailDomainPayload(
      createMailboxRequestSchema.parse(input),
    );
    if (DEMO_MODE) return demoApi.createMailbox(payload);
    return requestJson(
      "/api/mailboxes",
      { method: "POST", body: JSON.stringify(payload) },
      (value) => mailboxSchema.parse(value),
    );
  },
  async ensureMailbox(
    input:
      | { address: string; expiresInMinutes?: number | null }
      | {
          localPart: string;
          subdomain: string;
          mailDomain?: string;
          rootDomain?: string;
          expiresInMinutes?: number | null;
          tags?: string[];
        },
  ) {
    const parsedPayload = ensureMailboxRequestSchema.parse(input);
    const payload =
      "address" in parsedPayload
        ? parsedPayload
        : toCanonicalMailDomainPayload(parsedPayload);
    if (DEMO_MODE) return demoApi.ensureMailbox(payload);
    return requestJson(
      "/api/mailboxes/ensure",
      { method: "POST", body: JSON.stringify(payload) },
      (value) => mailboxSchema.parse(value),
    );
  },
  async resolveMailbox(address: string) {
    if (DEMO_MODE) return demoApi.resolveMailbox(address);
    const params = new URLSearchParams({ address });
    return requestJson(
      `/api/mailboxes/resolve?${params.toString()}`,
      { method: "GET" },
      (value) => mailboxSchema.parse(value),
    );
  },
  async destroyMailbox(id: string) {
    if (DEMO_MODE) return demoApi.destroyMailbox(id);
    return requestJson(`/api/mailboxes/${id}`, { method: "DELETE" }, (value) =>
      mailboxSchema.parse(value),
    );
  },
  async resetMailboxTtl(
    id: string,
    input: { expiresInMinutes: number | null },
  ) {
    const payload = resetMailboxTtlRequestSchema.parse(input);
    if (DEMO_MODE) return demoApi.resetMailboxTtl(id, payload);
    return requestJson(
      `/api/mailboxes/${id}/ttl`,
      { method: "PATCH", body: JSON.stringify(payload) },
      (value) => mailboxSchema.parse(value),
    );
  },
  async updateMailboxTags(id: string, input: { tags: string[] }) {
    const payload = updateMailboxTagsRequestSchema.parse(input);
    if (DEMO_MODE) return demoApi.updateMailboxTags(id, payload);
    return requestJson(
      `/api/mailboxes/${id}/tags`,
      { method: "PATCH", body: JSON.stringify(payload) },
      (value) => mailboxSchema.parse(value),
    );
  },
  async listMessages(
    mailboxes: string[] = [],
    filters?: { after?: string; since?: string },
    options?: {
      mailboxIds?: string[];
      mailboxStatuses?: MailboxStatus[];
      scope?: MailboxListScope;
    },
  ) {
    if (DEMO_MODE) return demoApi.listMessages(mailboxes, filters, options);
    const params = new URLSearchParams();
    for (const mailbox of mailboxes) params.append("mailbox", mailbox);
    for (const mailboxId of options?.mailboxIds ?? []) {
      params.append("mailboxId", mailboxId);
    }
    for (const mailboxStatus of options?.mailboxStatuses ?? []) {
      params.append("mailboxStatus", mailboxStatus);
    }
    if (filters?.after) params.set("after", filters.after);
    if (filters?.since) params.set("since", filters.since);
    appendScopeParam(params, options?.scope);
    const payload = await requestJson(
      `/api/messages${params.size > 0 ? `?${params.toString()}` : ""}`,
      { method: "GET" },
      (value) => listMessagesResponseSchema.parse(value),
    );
    return payload.messages;
  },
  async getMessage(id: string) {
    if (DEMO_MODE) return demoApi.getMessage(id);
    const payload = await requestJson(
      `/api/messages/${id}`,
      { method: "GET" },
      (value) => messageDetailResponseSchema.parse(value),
    );
    return payload.message;
  },
  getRawMessageUrl(id: string) {
    return `${API_BASE}/api/messages/${id}/raw`;
  },
  async listApiKeys() {
    if (DEMO_MODE) return demoApi.listApiKeys();
    const payload = await requestJson(
      "/api/api-keys",
      { method: "GET" },
      (value) => listApiKeysResponseSchema.parse(value),
    );
    return payload.apiKeys;
  },
  async listPasskeys() {
    if (DEMO_MODE) return demoApi.listPasskeys();
    const payload = await requestJson(
      "/api/passkeys",
      { method: "GET" },
      (value) => listPasskeysResponseSchema.parse(value),
    );
    return payload.passkeys;
  },
  async createPasskeyRegistrationOptions(name: string) {
    return requestJson(
      "/api/passkeys/registration/options",
      { method: "POST", body: JSON.stringify({ name }) },
      (value) => value as PublicKeyCredentialCreationOptionsJSON,
    );
  },
  async verifyPasskeyRegistration(response: RegistrationResponseJSON) {
    return requestJson(
      "/api/passkeys/registration/verify",
      { method: "POST", body: JSON.stringify({ response }) },
      (value) => passkeySchema.parse(value),
    );
  },
  async createPasskeyInviteRegistrationOptions(input: {
    inviteCode: string;
    nickname: string;
    passkeyName: string;
  }) {
    const payload = passkeyInviteRegistrationOptionsRequestSchema.parse(input);
    if (DEMO_MODE)
      return demoApi.createPasskeyInviteRegistrationOptions(payload);
    return requestJson(
      "/api/auth/passkey/register/options",
      { method: "POST", body: JSON.stringify(payload) },
      (value) => value as PublicKeyCredentialCreationOptionsJSON,
    );
  },
  async verifyPasskeyInviteRegistration(response: RegistrationResponseJSON) {
    if (DEMO_MODE) return demoApi.verifyPasskeyInviteRegistration();
    return requestJson(
      "/api/auth/passkey/register/verify",
      { method: "POST", body: JSON.stringify({ response }) },
      (value) => sessionResponseSchema.parse(value),
    );
  },
  async createPasskeyRegistrationCompletionOptions(input: {
    token: string;
    inviteCode?: string;
    nickname: string;
    passkeyName: string;
  }) {
    const payload = completePasskeyRegistrationRequestSchema.parse(input);
    if (DEMO_MODE) {
      return demoApi.createPasskeyRegistrationCompletionOptions(payload);
    }
    return requestJson(
      "/api/auth/registration/passkey/options",
      { method: "POST", body: JSON.stringify(payload) },
      (value) => value as PublicKeyCredentialCreationOptionsJSON,
    );
  },
  async verifyPasskeyRegistrationCompletion(
    response: RegistrationResponseJSON,
  ) {
    if (DEMO_MODE) return demoApi.verifyPasskeyRegistrationCompletion();
    return requestJson(
      "/api/auth/registration/passkey/verify",
      { method: "POST", body: JSON.stringify({ response }) },
      (value) => sessionResponseSchema.parse(value),
    );
  },
  async revokePasskey(id: string) {
    if (DEMO_MODE) return demoApi.revokePasskey(id);
    const response = await fetch(`${API_BASE}/api/passkeys/${id}`, {
      method: "DELETE",
      credentials: "include",
    });
    if (!response.ok && response.status !== 204) {
      throw new Error("Passkey revoke failed");
    }
  },
  async loginWithPasskeyDemo() {
    return demoApi.loginWithPasskey();
  },
  async registerPasskeyDemo(name: string) {
    return demoApi.registerPasskey(name);
  },
  async createApiKey(input: { name: string; scopes: string[] }) {
    if (DEMO_MODE) return demoApi.createApiKey(input);
    return requestJson(
      "/api/api-keys",
      { method: "POST", body: JSON.stringify(input) },
      (value) => createApiKeyResponseSchema.parse(value),
    );
  },
  async revokeApiKey(id: string) {
    if (DEMO_MODE) return demoApi.revokeApiKey(id);
    const response = await fetch(`${API_BASE}/api/api-keys/${id}/revoke`, {
      method: "POST",
      credentials: "include",
    });
    if (!response.ok && response.status !== 204)
      throw new Error("Failed to revoke API key");
  },
  async listUsers(input: { page: number; pageSize: number }) {
    const params = new URLSearchParams({
      page: String(input.page),
      pageSize: String(input.pageSize),
    });
    if (DEMO_MODE) return demoApi.listUsers(input);
    const payload = await requestJson(
      `/api/users?${params.toString()}`,
      { method: "GET" },
      (value) => listUsersResponseSchema.parse(value),
    );
    return payload;
  },
  async listInvites(input: { page: number; pageSize: number }) {
    const params = new URLSearchParams({
      page: String(input.page),
      pageSize: String(input.pageSize),
    });
    if (DEMO_MODE) return demoApi.listInvites(input);
    const payload = await requestJson(
      `/api/admin/invites?${params.toString()}`,
      { method: "GET" },
      (value) => listInvitesResponseSchema.parse(value),
    );
    return payload;
  },
  async createInvite(input: { note?: string; count: number }) {
    const payload = createInviteRequestSchema.parse(input);
    if (DEMO_MODE) return demoApi.createInvite(payload);
    return requestJson(
      "/api/admin/invites",
      { method: "POST", body: JSON.stringify(payload) },
      (value) => createInviteResponseSchema.parse(value),
    );
  },
  async deleteInvite(id: string) {
    if (DEMO_MODE) return demoApi.deleteInvite(id);
    const response = await fetch(`${API_BASE}/api/admin/invites/${id}`, {
      method: "DELETE",
      credentials: "include",
    });
    if (!response.ok && response.status !== 204) {
      throw new Error("Invite deletion failed");
    }
  },
  async getRegistrationSettings() {
    if (DEMO_MODE) return demoApi.getRegistrationSettings();
    return requestJson(
      "/api/admin/registration-settings",
      { method: "GET" },
      (value) => registrationSettingsResponseSchema.parse(value),
    );
  },
  async updateRegistrationSettings(input: {
    githubMode: "off" | "invite-only" | "open";
    githubDailyLimit: number;
    githubClientId: string;
    githubClientSecret: string;
    githubOauthScopes: string;
    linuxdoMode: "off" | "invite-only" | "open";
    linuxdoDailyLimit: number;
    linuxdoClientId: string;
    linuxdoClientSecret: string;
    linuxdoOauthBaseUrl: string;
    passkeyMode: "off" | "invite-only";
    deletedUserMailboxRetentionDays: number;
  }) {
    const payload = updateRegistrationSettingsRequestSchema.parse(input);
    if (DEMO_MODE) return demoApi.updateRegistrationSettings(payload);
    return requestJson(
      "/api/admin/registration-settings",
      { method: "PUT", body: JSON.stringify(payload) },
      (value) => registrationSettingsResponseSchema.parse(value),
    );
  },
  async transferAdmin(userId: string, verificationToken: string) {
    if (DEMO_MODE) return demoApi.transferAdmin(userId, verificationToken);
    const payload = { verificationToken };
    const response = await fetch(
      `${API_BASE}/api/admin/users/${userId}/transfer-admin`,
      {
        method: "POST",
        credentials: "include",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify(payload),
      },
    );
    if (!response.ok && response.status !== 204) {
      throw new Error("Admin transfer failed");
    }
  },
  async listDomains() {
    if (DEMO_MODE) return demoApi.listDomains();
    const payload = await requestJson(
      "/api/domains",
      { method: "GET" },
      (value) => listDomainsResponseSchema.parse(value),
    );
    return payload.domains;
  },
  async listDomainCatalog() {
    if (DEMO_MODE) return demoApi.listDomainCatalog();
    return requestJson("/api/domains/catalog", { method: "GET" }, (value) =>
      listDomainCatalogResponseSchema.parse(value),
    );
  },
  async createDomain(input: {
    mailDomain: string;
    zoneId: string;
    rootDomain?: string;
  }) {
    const parsedPayload = createDomainRequestSchema.parse(input);
    const payload = {
      mailDomain: parsedPayload.mailDomain,
      zoneId: parsedPayload.zoneId,
    };
    if (DEMO_MODE) return demoApi.createDomain(payload);
    return requestJson(
      "/api/domains",
      { method: "POST", body: JSON.stringify(payload) },
      (value) => domainSchema.parse(value),
    );
  },
  async bindDomain(input: { mailDomain: string; rootDomain?: string }) {
    const parsedPayload = bindDomainRequestSchema.parse(input);
    const payload = {
      mailDomain: parsedPayload.mailDomain,
    };
    if (DEMO_MODE) return demoApi.bindDomain(payload);
    return requestJson(
      "/api/domains/bind",
      { method: "POST", body: JSON.stringify(payload) },
      (value) => domainSchema.parse(value),
    );
  },
  async disableDomain(id: string) {
    if (DEMO_MODE) return demoApi.disableDomain(id);
    return requestJson(
      `/api/domains/${id}/disable`,
      { method: "POST" },
      (value) => domainSchema.parse(value),
    );
  },
  async enableDomainCatchAll(id: string) {
    if (DEMO_MODE) return demoApi.enableDomainCatchAll(id);
    const accepted = await requestJson(
      `/api/domains/${id}/catch-all/enable`,
      { method: "POST" },
      (value) => domainCutoverTaskAcceptedResponseSchema.parse(value),
    );
    await waitForDomainCutoverTask(accepted.taskId);
    const domains = await apiClient.listDomains();
    const domain = domains.find((candidate) => candidate.id === id);
    if (!domain) {
      throw new ApiClientError("Mailbox domain not found after cutover", {
        domainId: id,
        taskId: accepted.taskId,
      });
    }
    return domain;
  },
  async disableDomainCatchAll(id: string) {
    if (DEMO_MODE) return demoApi.disableDomainCatchAll(id);
    const accepted = await requestJson(
      `/api/domains/${id}/catch-all/disable`,
      { method: "POST" },
      (value) => domainCutoverTaskAcceptedResponseSchema.parse(value),
    );
    await waitForDomainCutoverTask(accepted.taskId);
    const domains = await apiClient.listDomains();
    const domain = domains.find((candidate) => candidate.id === id);
    if (!domain) {
      throw new ApiClientError("Mailbox domain not found after cutover", {
        domainId: id,
        taskId: accepted.taskId,
      });
    }
    return domain;
  },
  async retryDomain(id: string) {
    if (DEMO_MODE) return demoApi.retryDomain(id);
    return requestJson(
      `/api/domains/${id}/retry`,
      { method: "POST" },
      (value) => domainSchema.parse(value),
    );
  },
  async deleteDomain(id: string) {
    if (DEMO_MODE) return demoApi.deleteDomain(id);
    const response = await fetch(`${API_BASE}/api/domains/${id}/delete`, {
      method: "POST",
      credentials: "include",
    });
    if (response.status === 204) return;
    const payload = await response.json();
    const parsedError = apiErrorSchema.safeParse(payload);
    if (parsedError.success) {
      throw new ApiClientError(
        parsedError.data.error,
        parsedError.data.details ?? null,
      );
    }
    throw new ApiClientError("Failed to delete domain");
  },
};
