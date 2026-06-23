import { sessionUserSchema } from "@kaisoumail/shared";
import { and, eq, isNull } from "drizzle-orm";
import type { MiddlewareHandler } from "hono";

import { getDb } from "../db/client";
import { apiKeys, users } from "../db/schema";
import type { RuntimeConfig, WorkerEnv } from "../env";
import {
  nowIso,
  randomId,
  randomSecret,
  type SessionPayload,
  sha256Hex,
  signSession,
  verifySession,
} from "../lib/crypto";
import { ApiError } from "../lib/errors";
import type { AppBindings, AuthContext, AuthUser } from "../types";
import { ensureBootstrapAdmin } from "./bootstrap";

const SESSION_COOKIE = "kaisoumail_session";
const SESSION_TTL_SECONDS = 60 * 60 * 24 * 7;

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

const authUserSchema = sessionUserSchema;
const resolveUsername = (user: AuthUser) =>
  user.username ?? user.email ?? user.id;
const resolveNickname = (user: AuthUser) =>
  user.nickname ?? user.name ?? resolveUsername(user);

type UserRow = {
  id: string;
  username: string;
  nickname: string;
  role: string;
  deletedAt: string | null;
};

const mapUserRow = (row: UserRow): AuthUser =>
  authUserSchema.parse({
    id: row.id,
    username: row.username,
    nickname: row.nickname,
    role: row.role,
  });

export const serializeSessionCookie = (token: string, secure: boolean) => {
  const parts = [
    `${SESSION_COOKIE}=${encodeURIComponent(token)}`,
    "HttpOnly",
    "Path=/",
    "SameSite=Lax",
    `Max-Age=${SESSION_TTL_SECONDS}`,
  ];
  if (secure) parts.push("Secure");
  return parts.join("; ");
};

export const serializeExpiredSessionCookie = (secure: boolean) => {
  const parts = [
    `${SESSION_COOKIE}=`,
    "HttpOnly",
    "Path=/",
    "SameSite=Lax",
    "Max-Age=0",
  ];
  if (secure) parts.push("Secure");
  return parts.join("; ");
};

export const issueSessionCookie = async (
  config: RuntimeConfig,
  user: AuthUser,
) => {
  const now = Math.floor(Date.now() / 1000);
  const payload: SessionPayload = {
    sub: user.id,
    username: resolveUsername(user),
    nickname: resolveNickname(user),
    role: user.role,
    iat: now,
    exp: now + SESSION_TTL_SECONDS,
  };
  return signSession(payload, config.SESSION_SECRET);
};

const parseAuthorizationHeader = (header: string | undefined) => {
  if (!header) return null;
  const [scheme, value] = header.split(" ");
  if (scheme?.toLowerCase() !== "bearer" || !value) return null;
  return value.trim();
};

export const createApiKeyForUser = async (
  env: WorkerEnv,
  userId: string,
  name: string,
  scopes: string[],
) => {
  const db = getDb(env);
  const secret = `cfm_${randomSecret(24)}`;
  const createdAt = nowIso();
  const keyHash = await sha256Hex(secret);
  const prefix = secret.slice(0, 12);
  const id = randomId("key");
  await db.insert(apiKeys).values({
    id,
    userId,
    name,
    prefix,
    keyHash,
    scopes: JSON.stringify(scopes),
    createdAt,
    lastUsedAt: null,
    revokedAt: null,
  });
  return {
    apiKey: secret,
    apiKeyRecord: {
      id,
      name,
      prefix,
      scopes,
      createdAt,
      lastUsedAt: null,
      revokedAt: null,
    },
  };
};

export const listApiKeysForUser = async (env: WorkerEnv, userId: string) => {
  const db = getDb(env);
  const rows = await db
    .select()
    .from(apiKeys)
    .where(eq(apiKeys.userId, userId));

  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    prefix: row.prefix,
    scopes: JSON.parse(row.scopes) as string[],
    createdAt: row.createdAt,
    lastUsedAt: row.lastUsedAt,
    revokedAt: row.revokedAt,
  }));
};

export const revokeApiKeyForUser = async (
  env: WorkerEnv,
  user: AuthUser,
  keyId: string,
) => {
  const db = getDb(env);
  const rows = await db
    .select()
    .from(apiKeys)
    .where(eq(apiKeys.id, keyId))
    .limit(1);

  const record = rows[0];
  if (!record) throw new ApiError(404, "API key not found");
  if (record.userId !== user.id && user.role !== "admin") {
    throw new ApiError(403, "Forbidden");
  }

  await db
    .update(apiKeys)
    .set({ revokedAt: nowIso() })
    .where(eq(apiKeys.id, keyId));
};

export const revokeAllApiKeysForUser = async (
  env: WorkerEnv,
  userId: string,
) => {
  const db = getDb(env);
  await db
    .update(apiKeys)
    .set({ revokedAt: nowIso() })
    .where(and(eq(apiKeys.userId, userId), isNull(apiKeys.revokedAt)));
};

export const getUserById = async (env: WorkerEnv, userId: string) => {
  const db = getDb(env);
  const rows = await db
    .select({
      id: users.id,
      username: users.username,
      nickname: users.nickname,
      role: users.role,
      deletedAt: users.deletedAt,
    })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  const row = rows[0];
  if (!row || row.deletedAt) return null;
  return mapUserRow({
    id: row.id,
    username: row.username,
    nickname: row.nickname,
    role: row.role,
    deletedAt: row.deletedAt,
  });
};

export const authenticateApiKeyWithContext = async (
  env: WorkerEnv,
  config: RuntimeConfig,
  apiKey: string,
) => {
  const db = getDb(env);
  await ensureBootstrapAdmin(db, config);
  const keyHash = await sha256Hex(apiKey);
  const rows = await db
    .select({
      userId: users.id,
      username: users.username,
      nickname: users.nickname,
      role: users.role,
      deletedAt: users.deletedAt,
      apiKeyId: apiKeys.id,
      apiKeyName: apiKeys.name,
      apiKeyPrefix: apiKeys.prefix,
    })
    .from(apiKeys)
    .innerJoin(users, eq(apiKeys.userId, users.id))
    .where(and(eq(apiKeys.keyHash, keyHash), isNull(apiKeys.revokedAt)))
    .limit(1);

  const row = rows[0];
  if (!row || row.deletedAt) return null;

  await db
    .update(apiKeys)
    .set({ lastUsedAt: nowIso() })
    .where(eq(apiKeys.id, row.apiKeyId));

  return {
    user: mapUserRow({
      id: row.userId,
      username: row.username,
      nickname: row.nickname,
      role: row.role,
      deletedAt: row.deletedAt,
    }),
    authContext: {
      method: "api_key",
      apiKey: {
        id: row.apiKeyId,
        name: row.apiKeyName,
        prefix: row.apiKeyPrefix,
      },
    } satisfies AuthContext,
  };
};

export const authenticateApiKey = async (
  env: WorkerEnv,
  config: RuntimeConfig,
  apiKey: string,
) =>
  authenticateApiKeyWithContext(env, config, apiKey).then(
    (resolved) => resolved?.user ?? null,
  );

export const resolveAuthUser = async (
  env: WorkerEnv,
  config: RuntimeConfig,
  request: Request,
) => {
  const bearer = parseAuthorizationHeader(
    request.headers.get("authorization") ?? undefined,
  );
  if (bearer) {
    const resolved = await authenticateApiKeyWithContext(env, config, bearer);
    return resolved?.user ?? null;
  }

  const cookieHeader = request.headers.get("cookie") ?? "";
  const sessionCookie = parseCookies(cookieHeader)[SESSION_COOKIE];
  if (!sessionCookie) return null;
  const payload = await verifySession(sessionCookie, config.SESSION_SECRET);
  if (!payload) return null;
  return getUserById(env, payload.sub);
};

export const resolveAuthContext = async (
  env: WorkerEnv,
  config: RuntimeConfig,
  request: Request,
) => {
  const bearer = parseAuthorizationHeader(
    request.headers.get("authorization") ?? undefined,
  );
  if (bearer) return authenticateApiKeyWithContext(env, config, bearer);

  const cookieHeader = request.headers.get("cookie") ?? "";
  const sessionCookie = parseCookies(cookieHeader)[SESSION_COOKIE];
  if (!sessionCookie) return null;
  const payload = await verifySession(sessionCookie, config.SESSION_SECRET);
  if (!payload) return null;
  const user = await getUserById(env, payload.sub);
  if (!user) return null;
  return {
    user,
    authContext: {
      method: "web",
      apiKey: null,
    } satisfies AuthContext,
  };
};

export const resolveSessionUser = async (
  env: WorkerEnv,
  config: RuntimeConfig,
  request: Request,
) => {
  const cookieHeader = request.headers.get("cookie") ?? "";
  const sessionCookie = parseCookies(cookieHeader)[SESSION_COOKIE];
  if (!sessionCookie) return null;
  const payload = await verifySession(sessionCookie, config.SESSION_SECRET);
  if (!payload) return null;
  return getUserById(env, payload.sub);
};

export const requireAuth = (options?: {
  admin?: boolean;
  optional?: boolean;
  sessionOnly?: boolean;
}): MiddlewareHandler<AppBindings> => {
  return async (c, next) => {
    const config = c.get("runtimeConfig");
    const resolved = options?.sessionOnly
      ? await resolveSessionUser(c.env, config, c.req.raw).then((user) =>
          user
            ? {
                user,
                authContext: {
                  method: "web",
                  apiKey: null,
                } satisfies AuthContext,
              }
            : null,
        )
      : await resolveAuthContext(c.env, config, c.req.raw);
    const user = resolved?.user ?? null;

    if (!user && !options?.optional) {
      throw new ApiError(401, "Authentication required");
    }
    if (resolved) {
      c.set("authUser", resolved.user);
      c.set("authContext", resolved.authContext);
    }
    if (options?.admin && user?.role !== "admin") {
      throw new ApiError(403, "Admin access required");
    }
    await next();
  };
};
