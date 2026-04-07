import { passkeySchema, sessionUserSchema } from "@kaisoumail/shared";
import {
  type AuthenticationResponseJSON,
  generateAuthenticationOptions,
  generateRegistrationOptions,
  type PublicKeyCredentialCreationOptionsJSON,
  type PublicKeyCredentialRequestOptionsJSON,
  type RegistrationResponseJSON,
  verifyAuthenticationResponse,
  verifyRegistrationResponse,
} from "@simplewebauthn/server";
import { and, eq, isNull } from "drizzle-orm";
import type { z } from "zod";

import { getDb } from "../db/client";
import { passkeys, users } from "../db/schema";
import type { RuntimeConfig, WorkerEnv } from "../env";
import {
  fromBase64Url,
  nowIso,
  randomId,
  signPayload,
  toBase64Url,
  verifyPayload,
} from "../lib/crypto";
import { ApiError } from "../lib/errors";
import type { AuthUser } from "../types";

const encoder = new TextEncoder();

const PASSKEY_REGISTRATION_COOKIE = "kaisoumail_passkey_registration";
const PASSKEY_AUTHENTICATION_COOKIE = "kaisoumail_passkey_authentication";
const PASSKEY_CHALLENGE_TTL_SECONDS = 60 * 5;
const PASSKEY_RP_NAME = "KaisouMail";

type PasskeyRecord = z.infer<typeof passkeySchema>;

type PasskeyChallengePayload = {
  challenge: string;
  exp: number;
  iat: number;
  kind: "authentication" | "registration";
  name?: string;
  userId?: string;
};

const parseCookies = (cookieHeader: string) =>
  Object.fromEntries(
    cookieHeader
      .split(";")
      .map((part) => part.trim())
      .filter(Boolean)
      .map((entry) => {
        const separator = entry.indexOf("=");
        if (separator === -1) return [entry, ""];
        return [
          entry.slice(0, separator),
          decodeURIComponent(entry.slice(separator + 1)),
        ];
      }),
  );

const serializeCookie = (
  name: string,
  value: string,
  maxAge: number,
  secure: boolean,
) => {
  const parts = [
    `${name}=${encodeURIComponent(value)}`,
    "HttpOnly",
    "Path=/",
    "SameSite=Lax",
    `Max-Age=${maxAge}`,
  ];
  if (secure) parts.push("Secure");
  return parts.join("; ");
};

const serializeExpiredCookie = (name: string, secure: boolean) => {
  const parts = [`${name}=`, "HttpOnly", "Path=/", "SameSite=Lax", "Max-Age=0"];
  if (secure) parts.push("Secure");
  return parts.join("; ");
};

const pickExpectedValue = (values: string[]) =>
  values.length === 1 ? values[0] : values;

const resolvePasskeyRuntimeConfig = (config: RuntimeConfig) => {
  const configuredOrigins =
    config.WEB_APP_ORIGINS && config.WEB_APP_ORIGINS.length > 0
      ? config.WEB_APP_ORIGINS
      : config.WEB_APP_ORIGIN
        ? [config.WEB_APP_ORIGIN]
        : [];

  if (configuredOrigins.length === 0) {
    throw new ApiError(503, "Passkey auth is not configured");
  }

  const origins = [
    ...new Set(configuredOrigins.map((origin) => new URL(origin).origin)),
  ];
  const rpIDs = [...new Set(origins.map((origin) => new URL(origin).hostname))];

  return {
    expectedOrigin: pickExpectedValue(origins),
    expectedRPID: pickExpectedValue(rpIDs),
    origins,
    rpIDs,
    rpName: PASSKEY_RP_NAME,
    secure: config.APP_ENV === "production",
  };
};

const resolvePasskeyRequestConfig = (
  config: RuntimeConfig,
  request: Request,
) => {
  const runtime = resolvePasskeyRuntimeConfig(config);
  const requestOriginHeader = request.headers.get("origin")?.trim();

  if (!requestOriginHeader) {
    if (runtime.origins.length === 1 && runtime.rpIDs.length === 1) {
      return {
        ...runtime,
        rpID: runtime.rpIDs[0],
      };
    }

    throw new ApiError(400, "Passkey origin is not allowed");
  }

  let requestOrigin: string;
  try {
    requestOrigin = new URL(requestOriginHeader).origin;
  } catch {
    throw new ApiError(400, "Passkey origin is not allowed");
  }

  if (!runtime.origins.includes(requestOrigin)) {
    throw new ApiError(400, "Passkey origin is not allowed");
  }

  return {
    ...runtime,
    rpID: new URL(requestOrigin).hostname,
  };
};

const toApiErrorDetails = (error: unknown) =>
  error instanceof Error ? error.message : null;

const issueChallengeCookie = async (
  config: RuntimeConfig,
  name: string,
  payload: Omit<PasskeyChallengePayload, "iat" | "exp">,
) => {
  const now = Math.floor(Date.now() / 1000);
  const token = await signPayload(
    {
      ...payload,
      iat: now,
      exp: now + PASSKEY_CHALLENGE_TTL_SECONDS,
    },
    config.SESSION_SECRET,
  );

  return serializeCookie(
    name,
    token,
    PASSKEY_CHALLENGE_TTL_SECONDS,
    config.APP_ENV === "production",
  );
};

const resolveChallengePayload = async (
  request: Request,
  config: RuntimeConfig,
  cookieName: string,
  expectedKind: PasskeyChallengePayload["kind"],
) => {
  const cookieHeader = request.headers.get("cookie") ?? "";
  const token = parseCookies(cookieHeader)[cookieName];
  if (!token) {
    throw new ApiError(400, "Passkey challenge is missing or expired");
  }

  const payload = await verifyPayload<PasskeyChallengePayload>(
    token,
    config.SESSION_SECRET,
  );
  if (!payload || payload.kind !== expectedKind) {
    throw new ApiError(400, "Passkey challenge is missing or expired");
  }

  return payload;
};

const mapPasskeyRow = (row: {
  backedUp: boolean;
  createdAt: string;
  credentialId: string;
  deviceType: string;
  id: string;
  lastUsedAt: string | null;
  name: string;
  revokedAt: string | null;
  transportsJson: string;
}): PasskeyRecord =>
  passkeySchema.parse({
    id: row.id,
    name: row.name,
    credentialId: row.credentialId,
    deviceType: row.deviceType,
    backedUp: row.backedUp,
    transports: JSON.parse(row.transportsJson) as string[],
    createdAt: row.createdAt,
    lastUsedAt: row.lastUsedAt,
    revokedAt: row.revokedAt,
  });

const mapUserRow = (row: {
  email: string;
  id: string;
  name: string;
  role: string;
}): AuthUser =>
  sessionUserSchema.parse({
    id: row.id,
    email: row.email,
    name: row.name,
    role: row.role,
  });

export const serializeExpiredPasskeyAuthenticationCookie = (secure: boolean) =>
  serializeExpiredCookie(PASSKEY_AUTHENTICATION_COOKIE, secure);

export const serializeExpiredPasskeyRegistrationCookie = (secure: boolean) =>
  serializeExpiredCookie(PASSKEY_REGISTRATION_COOKIE, secure);

export const listPasskeysForUser = async (env: WorkerEnv, userId: string) => {
  const db = getDb(env);
  const rows = await db
    .select()
    .from(passkeys)
    .where(eq(passkeys.userId, userId));

  return rows
    .map(mapPasskeyRow)
    .sort((left, right) => right.createdAt.localeCompare(left.createdAt));
};

export const createPasskeyRegistrationOptionsForUser = async (
  env: WorkerEnv,
  config: RuntimeConfig,
  request: Request,
  user: AuthUser,
  name: string,
): Promise<{
  cookie: string;
  options: PublicKeyCredentialCreationOptionsJSON;
}> => {
  const db = getDb(env);
  const { rpID, rpName } = resolvePasskeyRequestConfig(config, request);
  const rows = await db
    .select({
      credentialId: passkeys.credentialId,
      revokedAt: passkeys.revokedAt,
      transportsJson: passkeys.transportsJson,
    })
    .from(passkeys)
    .where(eq(passkeys.userId, user.id));

  const options = await generateRegistrationOptions({
    rpName,
    rpID,
    userName: user.email,
    userDisplayName: user.name,
    userID: encoder.encode(user.id),
    attestationType: "none",
    excludeCredentials: rows
      .filter((row) => !row.revokedAt)
      .map((row) => ({
        id: row.credentialId,
        transports: JSON.parse(row.transportsJson) as (
          | "ble"
          | "cable"
          | "hybrid"
          | "internal"
          | "nfc"
          | "smart-card"
          | "usb"
        )[],
      })),
    authenticatorSelection: {
      residentKey: "required",
      userVerification: "required",
    },
  });

  return {
    options,
    cookie: await issueChallengeCookie(config, PASSKEY_REGISTRATION_COOKIE, {
      kind: "registration",
      challenge: options.challenge,
      name,
      userId: user.id,
    }),
  };
};

export const verifyPasskeyRegistrationForUser = async (
  env: WorkerEnv,
  config: RuntimeConfig,
  request: Request,
  user: AuthUser,
  response: RegistrationResponseJSON,
): Promise<{
  clearCookie: string;
  passkey: PasskeyRecord;
}> => {
  const challenge = await resolveChallengePayload(
    request,
    config,
    PASSKEY_REGISTRATION_COOKIE,
    "registration",
  );
  if (challenge.userId !== user.id || !challenge.name) {
    throw new ApiError(400, "Passkey challenge is missing or expired");
  }

  const { expectedOrigin, expectedRPID, secure } =
    resolvePasskeyRuntimeConfig(config);
  const verification = await (async () => {
    try {
      return await verifyRegistrationResponse({
        response,
        expectedChallenge: challenge.challenge,
        expectedOrigin,
        expectedRPID,
        requireUserVerification: true,
      });
    } catch (error) {
      if (error instanceof ApiError) {
        throw error;
      }
      throw new ApiError(
        400,
        "Passkey registration failed",
        toApiErrorDetails(error),
      );
    }
  })();
  if (!verification.verified || !verification.registrationInfo) {
    throw new ApiError(400, "Passkey registration failed");
  }

  const db = getDb(env);
  const existing = await db
    .select({
      id: passkeys.id,
      revokedAt: passkeys.revokedAt,
      userId: passkeys.userId,
    })
    .from(passkeys)
    .where(
      eq(passkeys.credentialId, verification.registrationInfo.credential.id),
    )
    .limit(1);
  const existingRecord = existing[0];
  if (
    existingRecord &&
    (!existingRecord.revokedAt || existingRecord.userId !== user.id)
  ) {
    throw new ApiError(409, "Passkey already registered");
  }

  const createdAt = nowIso();
  const transports = response.response.transports ?? [];
  const baseRecord = {
    userId: user.id,
    name: challenge.name,
    credentialId: verification.registrationInfo.credential.id,
    publicKeyB64u: toBase64Url(
      verification.registrationInfo.credential.publicKey,
    ),
    counter: verification.registrationInfo.credential.counter,
    deviceType: verification.registrationInfo.credentialDeviceType,
    backedUp: verification.registrationInfo.credentialBackedUp,
    transportsJson: JSON.stringify(transports),
    createdAt,
    lastUsedAt: null,
    revokedAt: null,
  } as const;

  const record = {
    id: existingRecord?.id ?? randomId("psk"),
    ...baseRecord,
  } as const;

  if (existingRecord) {
    await db
      .update(passkeys)
      .set(baseRecord)
      .where(eq(passkeys.id, existingRecord.id));
  } else {
    await db.insert(passkeys).values(record);
  }

  return {
    passkey: mapPasskeyRow(record),
    clearCookie: serializeExpiredPasskeyRegistrationCookie(secure),
  };
};

export const createPasskeyAuthenticationOptions = async (
  config: RuntimeConfig,
  request: Request,
): Promise<{
  cookie: string;
  options: PublicKeyCredentialRequestOptionsJSON;
}> => {
  const { rpID } = resolvePasskeyRequestConfig(config, request);
  const options = await generateAuthenticationOptions({
    rpID,
    userVerification: "required",
  });

  return {
    options,
    cookie: await issueChallengeCookie(config, PASSKEY_AUTHENTICATION_COOKIE, {
      kind: "authentication",
      challenge: options.challenge,
    }),
  };
};

export const verifyPasskeyAuthentication = async (
  env: WorkerEnv,
  config: RuntimeConfig,
  request: Request,
  response: AuthenticationResponseJSON,
): Promise<{
  clearCookie: string;
  user: AuthUser;
}> => {
  const challenge = await resolveChallengePayload(
    request,
    config,
    PASSKEY_AUTHENTICATION_COOKIE,
    "authentication",
  );
  const { expectedOrigin, expectedRPID, secure } =
    resolvePasskeyRuntimeConfig(config);
  const db = getDb(env);

  const rows = await db
    .select({
      userId: passkeys.userId,
      passkeyId: passkeys.id,
      credentialId: passkeys.credentialId,
      publicKeyB64u: passkeys.publicKeyB64u,
      counter: passkeys.counter,
      transportsJson: passkeys.transportsJson,
      email: users.email,
      name: users.name,
      role: users.role,
    })
    .from(passkeys)
    .innerJoin(users, eq(passkeys.userId, users.id))
    .where(
      and(eq(passkeys.credentialId, response.id), isNull(passkeys.revokedAt)),
    )
    .limit(1);

  const row = rows[0];
  if (!row) {
    throw new ApiError(401, "Invalid passkey");
  }

  const verification = await (async () => {
    try {
      return await verifyAuthenticationResponse({
        response,
        expectedChallenge: challenge.challenge,
        expectedOrigin,
        expectedRPID,
        credential: {
          id: row.credentialId,
          publicKey: fromBase64Url(row.publicKeyB64u),
          counter: row.counter,
          transports: JSON.parse(row.transportsJson) as (
            | "ble"
            | "cable"
            | "hybrid"
            | "internal"
            | "nfc"
            | "smart-card"
            | "usb"
          )[],
        },
      });
    } catch (error) {
      if (error instanceof ApiError) {
        throw error;
      }
      throw new ApiError(401, "Invalid passkey", toApiErrorDetails(error));
    }
  })();

  if (!verification.verified) {
    throw new ApiError(401, "Invalid passkey");
  }

  await db
    .update(passkeys)
    .set({
      counter: verification.authenticationInfo.newCounter,
      deviceType: verification.authenticationInfo.credentialDeviceType,
      backedUp: verification.authenticationInfo.credentialBackedUp,
      lastUsedAt: nowIso(),
    })
    .where(eq(passkeys.id, row.passkeyId));

  return {
    user: mapUserRow({
      id: row.userId,
      email: row.email,
      name: row.name,
      role: row.role,
    }),
    clearCookie: serializeExpiredPasskeyAuthenticationCookie(secure),
  };
};

export const revokePasskeyForUser = async (
  env: WorkerEnv,
  user: AuthUser,
  passkeyId: string,
) => {
  const db = getDb(env);
  const rows = await db
    .select()
    .from(passkeys)
    .where(eq(passkeys.id, passkeyId))
    .limit(1);

  const record = rows[0];
  if (!record) {
    throw new ApiError(404, "Passkey not found");
  }
  if (record.userId !== user.id) {
    throw new ApiError(403, "Forbidden");
  }

  await db
    .update(passkeys)
    .set({ revokedAt: nowIso() })
    .where(eq(passkeys.id, passkeyId));
};
