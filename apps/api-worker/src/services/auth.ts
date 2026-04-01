import { sessionUserSchema } from "@cf-mail/shared";
import { and, eq, isNull } from "drizzle-orm";
import type { MiddlewareHandler } from "hono";
import { z } from "zod";

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
import type { AppBindings, AuthUser } from "../types";
import { ensureBootstrapAdmin } from "./bootstrap";

const SESSION_COOKIE = "cf_mail_session";
const SESSION_TTL_SECONDS = 60 * 60 * 24 * 7;

const authUserSchema = sessionUserSchema;

const mapUserRow = (row: {
  id: string;
  email: string;
  name: string;
  role: string;
}): AuthUser => authUserSchema.parse(row);

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

const getUserById = async (env: WorkerEnv, userId: string) => {
  const db = getDb(env);
  const rows = await db
    .select()
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  return rows[0] ? mapUserRow(rows[0]) : null;
};

export const issueSessionCookie = async (
  config: RuntimeConfig,
  user: AuthUser,
) => {
  const now = Math.floor(Date.now() / 1000);
  const payload: SessionPayload = {
    sub: user.id,
    email: user.email,
    name: user.name,
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

export const authenticateApiKey = async (
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
      email: users.email,
      name: users.name,
      role: users.role,
      apiKeyId: apiKeys.id,
    })
    .from(apiKeys)
    .innerJoin(users, eq(apiKeys.userId, users.id))
    .where(and(eq(apiKeys.keyHash, keyHash), isNull(apiKeys.revokedAt)))
    .limit(1);
  const row = rows[0];
  if (!row) return null;
  await db
    .update(apiKeys)
    .set({ lastUsedAt: nowIso() })
    .where(eq(apiKeys.id, row.apiKeyId));
  return mapUserRow({
    id: row.userId,
    email: row.email,
    name: row.name,
    role: row.role,
  });
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
  if (record.userId !== user.id && user.role !== "admin")
    throw new ApiError(403, "Forbidden");
  await db
    .update(apiKeys)
    .set({ revokedAt: nowIso() })
    .where(eq(apiKeys.id, keyId));
};

export const createUser = async (
  env: WorkerEnv,
  input: { email: string; name: string; role: string },
) => {
  const db = getDb(env);
  const existing = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, input.email))
    .limit(1);
  if (existing[0]) throw new ApiError(409, "User already exists");

  const now = nowIso();
  const id = randomId("usr");
  const role = z.enum(["admin", "member"]).parse(input.role);
  await db.insert(users).values({
    id,
    email: input.email,
    name: input.name,
    role,
    createdAt: now,
    updatedAt: now,
  });
  const initialKey = await createApiKeyForUser(env, id, "Initial API Key", [
    "mailboxes:write",
    "messages:read",
  ]);
  return {
    user: {
      id,
      email: input.email,
      name: input.name,
      role,
      createdAt: now,
      updatedAt: now,
    },
    initialKey,
  };
};

export const listUsers = async (env: WorkerEnv) => {
  const db = getDb(env);
  const rows = await db.select().from(users).orderBy(users.createdAt);
  return rows.map((row) => ({
    id: row.id,
    email: row.email,
    name: row.name,
    role: z.enum(["admin", "member"]).parse(row.role),
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  }));
};

export const resolveAuthUser = async (
  env: WorkerEnv,
  config: RuntimeConfig,
  request: Request,
) => {
  const bearer = parseAuthorizationHeader(
    request.headers.get("authorization") ?? undefined,
  );
  if (bearer) return authenticateApiKey(env, config, bearer);

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
}): MiddlewareHandler<AppBindings> => {
  return async (c, next) => {
    const config = c.get("runtimeConfig");
    const user = await resolveAuthUser(c.env, config, c.req.raw);
    if (!user && !options?.optional)
      throw new ApiError(401, "Authentication required");
    if (user) c.set("authUser", user);
    if (options?.admin && user?.role !== "admin")
      throw new ApiError(403, "Admin access required");
    await next();
  };
};
