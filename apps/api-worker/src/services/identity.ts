import {
  adminUserSchema,
  externalAccountSchema,
  inviteSchema,
  registrationSettingsSchema,
} from "@kaisoumail/shared";
import { and, count, eq, inArray, isNull, or, sql } from "drizzle-orm";

import { getDb } from "../db/client";
import {
  dailySignupCounters,
  externalAccounts,
  invites,
  mailboxes,
  passkeys,
  registrationSettings,
  users,
} from "../db/schema";
import type { RuntimeConfig, WorkerEnv } from "../env";
import {
  nowIso,
  randomId,
  randomSecret,
  signPayload,
  verifyPayload,
} from "../lib/crypto";
import { ApiError } from "../lib/errors";
import type { AuthUser } from "../types";
import { authenticateApiKey, revokeAllApiKeysForUser } from "./auth";

const resolveDisplayNickname = (user: AuthUser) =>
  user.nickname ?? user.name ?? user.username ?? user.email ?? user.id;

const SETTINGS_ROW_ID = 1;

type ExternalProvider = "github" | "linuxdo";
type RegistrationMode = "off" | "invite-only" | "open";
type PasskeyMode = "off" | "invite-only";
type AdminTransferMethod = "github" | "linuxdo" | "passkey" | "api-key";
type PaginationInput = {
  page: number;
  pageSize: number;
};

type AdminTransferIntentPayload = {
  kind: "admin-transfer-intent";
  actorUserId: string;
  targetUserId: string;
  iat: number;
  exp: number;
};

type AdminTransferVerificationPayload = {
  kind: "admin-transfer-verification";
  actorUserId: string;
  targetUserId: string;
  method: AdminTransferMethod;
  iat: number;
  exp: number;
};

const ADMIN_TRANSFER_INTENT_TTL_SECONDS = 60 * 10;
const ADMIN_TRANSFER_VERIFICATION_TTL_SECONDS = 60 * 5;

export type InviteResolution = {
  inviteRequired: boolean;
  invitePrevalidated: boolean;
  role?: "admin" | "member";
  inviteId?: string | null;
  bootstrap?: boolean;
};

type ExternalAccountRecord = {
  provider: ExternalProvider;
  providerUserId: string;
  providerUsername?: string | null;
  providerNickname?: string | null;
  avatarUrl?: string | null;
  profileUrl?: string | null;
};

type ResolvedRegistrationSettings = ReturnType<typeof mapSettingsRow>;

const mapExternalAccountRow = (row: typeof externalAccounts.$inferSelect) =>
  externalAccountSchema.parse({
    id: row.id,
    provider: row.provider,
    providerUserId: row.providerUserId,
    providerUsername: row.providerUsername,
    providerNickname: row.providerNickname,
    avatarUrl: row.avatarUrl,
    profileUrl: row.profileUrl,
    createdAt: row.createdAt,
    lastUsedAt: row.lastUsedAt,
  });

const mapInviteRow = (row: typeof invites.$inferSelect) =>
  inviteSchema.parse({
    id: row.id,
    code: row.code,
    kind: row.kind,
    role: row.role,
    note: row.note,
    createdByUserId: row.createdByUserId,
    createdAt: row.createdAt,
    usedAt: row.usedAt,
    usedByUserId: row.usedByUserId,
  });

const mapSettingsRow = (row: typeof registrationSettings.$inferSelect) =>
  registrationSettingsSchema.parse({
    githubMode: row.githubMode,
    githubDailyLimit: row.githubDailyLimit,
    githubClientId: row.githubClientId,
    githubClientSecret: row.githubClientSecret,
    githubOauthScopes: row.githubOauthScopes,
    linuxdoMode: row.linuxdoMode,
    linuxdoDailyLimit: row.linuxdoDailyLimit,
    linuxdoClientId: row.linuxdoClientId,
    linuxdoClientSecret: row.linuxdoClientSecret,
    linuxdoOauthBaseUrl: row.linuxdoOauthBaseUrl,
    passkeyMode: row.passkeyMode,
    deletedUserMailboxRetentionDays: row.deletedUserMailboxRetentionDays,
    updatedAt: row.updatedAt,
  });

export const resolveStoredOauthConfig = (
  settings: ResolvedRegistrationSettings,
  config: RuntimeConfig,
) => ({
  githubClientId:
    settings.githubClientId.trim() || (config.GITHUB_CLIENT_ID ?? ""),
  githubClientSecret:
    settings.githubClientSecret.trim() || (config.GITHUB_CLIENT_SECRET ?? ""),
  githubOauthScopes:
    settings.githubOauthScopes.trim() ||
    config.GITHUB_OAUTH_SCOPES?.join(" ") ||
    "read:user",
  linuxdoClientId:
    settings.linuxdoClientId.trim() || (config.LINUXDO_CLIENT_ID ?? ""),
  linuxdoClientSecret:
    settings.linuxdoClientSecret.trim() || (config.LINUXDO_CLIENT_SECRET ?? ""),
  linuxdoOauthBaseUrl:
    settings.linuxdoOauthBaseUrl.trim() ||
    config.LINUXDO_OAUTH_BASE_URL ||
    "https://connect.linux.do",
});

const shanghaiDateKey = (date = new Date()) => {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  return formatter.format(date);
};

const usernameSlug = (value: string) =>
  value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 24);

export const ensureRegistrationSettings = async (env: WorkerEnv) => {
  const db = getDb(env);
  if (
    typeof (db as { select?: unknown }).select !== "function" ||
    typeof (db as { insert?: unknown }).insert !== "function"
  ) {
    return registrationSettingsSchema.parse({
      githubMode: "invite-only",
      githubDailyLimit: 10,
      githubClientId: "",
      githubClientSecret: "",
      githubOauthScopes: "read:user",
      linuxdoMode: "invite-only",
      linuxdoDailyLimit: 10,
      linuxdoClientId: "",
      linuxdoClientSecret: "",
      linuxdoOauthBaseUrl: "https://connect.linux.do",
      passkeyMode: "invite-only",
      deletedUserMailboxRetentionDays: 7,
      updatedAt: nowIso(),
    });
  }
  const rows = await db
    .select()
    .from(registrationSettings)
    .where(eq(registrationSettings.id, SETTINGS_ROW_ID))
    .limit(1);
  const existing = rows[0];
  if (existing) return mapSettingsRow(existing);

  const record = {
    id: SETTINGS_ROW_ID,
    githubMode: "invite-only",
    githubDailyLimit: 10,
    githubClientId: "",
    githubClientSecret: "",
    githubOauthScopes: "read:user",
    linuxdoMode: "invite-only",
    linuxdoDailyLimit: 10,
    linuxdoClientId: "",
    linuxdoClientSecret: "",
    linuxdoOauthBaseUrl: "https://connect.linux.do",
    passkeyMode: "invite-only",
    deletedUserMailboxRetentionDays: 7,
    updatedAt: nowIso(),
  } satisfies typeof registrationSettings.$inferInsert;
  await db.insert(registrationSettings).values(record);
  return mapSettingsRow(record);
};

export const getRegistrationSettings = async (
  env: WorkerEnv,
  config?: RuntimeConfig,
) => {
  const settings = await ensureRegistrationSettings(env);
  if (!config) {
    return settings;
  }

  const oauth = resolveStoredOauthConfig(settings, config);
  return registrationSettingsSchema.parse({
    ...settings,
    githubClientId: oauth.githubClientId,
    githubClientSecret: "",
    githubOauthScopes: oauth.githubOauthScopes,
    linuxdoClientId: oauth.linuxdoClientId,
    linuxdoClientSecret: "",
    linuxdoOauthBaseUrl: oauth.linuxdoOauthBaseUrl,
  });
};

export const updateRegistrationSettings = async (
  env: WorkerEnv,
  input: {
    githubMode: RegistrationMode;
    githubDailyLimit: number;
    githubClientId: string;
    githubClientSecret: string;
    githubOauthScopes: string;
    linuxdoMode: RegistrationMode;
    linuxdoDailyLimit: number;
    linuxdoClientId: string;
    linuxdoClientSecret: string;
    linuxdoOauthBaseUrl: string;
    passkeyMode: PasskeyMode;
    deletedUserMailboxRetentionDays: number;
  },
) => {
  const db = getDb(env);
  const existing = await ensureRegistrationSettings(env);
  const updatedAt = nowIso();
  await db
    .update(registrationSettings)
    .set({
      ...input,
      githubClientId: input.githubClientId.trim(),
      githubClientSecret:
        input.githubClientSecret.trim() || existing.githubClientSecret,
      githubOauthScopes: input.githubOauthScopes.trim() || "read:user",
      linuxdoClientId: input.linuxdoClientId.trim(),
      linuxdoClientSecret:
        input.linuxdoClientSecret.trim() || existing.linuxdoClientSecret,
      linuxdoOauthBaseUrl:
        input.linuxdoOauthBaseUrl.trim() || "https://connect.linux.do",
      updatedAt,
    })
    .where(eq(registrationSettings.id, SETTINGS_ROW_ID));
  return getRegistrationSettings(env);
};

export const createInvite = async (
  env: WorkerEnv,
  actor: AuthUser,
  input: { note?: string; count: number },
) => {
  const db = getDb(env);
  const note = input.note?.trim() || null;
  const records = Array.from({ length: input.count }, () => {
    const createdAt = nowIso();
    return {
      id: randomId("inv"),
      code: `km_${randomSecret(18)}`,
      kind: "standard",
      role: "member",
      note,
      createdByUserId: actor.id,
      createdAt,
      usedAt: null,
      usedByUserId: null,
    } satisfies typeof invites.$inferInsert;
  });
  await db.insert(invites).values(records);
  return records.map(mapInviteRow);
};

export const listInvites = async (env: WorkerEnv) => {
  const db = getDb(env);
  const rows = await db
    .select()
    .from(invites)
    .orderBy(sql`${invites.createdAt} desc`);
  return rows.map(mapInviteRow);
};

export const listInvitesPaginated = async (
  env: WorkerEnv,
  input: PaginationInput,
) => {
  const db = getDb(env);
  const page = Math.max(1, input.page);
  const pageSize = Math.max(1, input.pageSize);
  const totalRows = await db.select({ value: count() }).from(invites);
  const totalItems = totalRows[0]?.value ?? 0;
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
  const normalizedPage = Math.min(page, totalPages);
  const normalizedOffset = (normalizedPage - 1) * pageSize;
  const rows = await db
    .select()
    .from(invites)
    .orderBy(sql`${invites.createdAt} desc`)
    .limit(pageSize)
    .offset(normalizedOffset);
  return {
    invites: rows.map(mapInviteRow),
    pagination: {
      page: normalizedPage,
      pageSize,
      totalItems,
      totalPages,
    },
  };
};

export const deleteInvite = async (env: WorkerEnv, inviteId: string) => {
  const db = getDb(env);
  const rows = await db
    .select()
    .from(invites)
    .where(eq(invites.id, inviteId))
    .limit(1);
  const record = rows[0];
  if (!record) throw new ApiError(404, "Invite not found");
  if (record.usedAt) throw new ApiError(409, "Invite already used");
  await db.delete(invites).where(eq(invites.id, inviteId));
};

const resolveInviteForCode = async (env: WorkerEnv, code: string) => {
  const db = getDb(env);
  const rows = await db
    .select()
    .from(invites)
    .where(eq(invites.code, code))
    .limit(1);
  return rows[0] ?? null;
};

export const getInviteForCode = async (env: WorkerEnv, code: string) => {
  const normalizedCode = code.trim();
  if (!normalizedCode) return null;
  return resolveInviteForCode(env, normalizedCode);
};

const claimInvite = async (
  env: WorkerEnv,
  inviteId: string,
  userId: string,
) => {
  const db = getDb(env);
  await db
    .update(invites)
    .set({
      usedAt: nowIso(),
      usedByUserId: userId,
    })
    .where(eq(invites.id, inviteId));
};

const usernameExists = async (env: WorkerEnv, username: string) => {
  const db = getDb(env);
  const rows = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.username, username))
    .limit(1);
  return Boolean(rows[0]);
};

export const generateUsername = async (
  env: WorkerEnv,
  seed: string,
  fallbackPrefix = "user",
) => {
  const base = usernameSlug(seed) || fallbackPrefix;
  for (let attempt = 0; attempt < 50; attempt += 1) {
    const candidate =
      attempt === 0 ? base : `${base}-${Math.floor(Math.random() * 10000)}`;
    if (!(await usernameExists(env, candidate))) return candidate;
  }
  return `${fallbackPrefix}-${randomId("u").slice(-8)}`;
};

const consumeDailyOpenRegistration = async (
  env: WorkerEnv,
  provider: ExternalProvider,
) => {
  const db = getDb(env);
  const settings = await getRegistrationSettings(env);
  const dateKey = shanghaiDateKey();
  const rows = await db
    .select()
    .from(dailySignupCounters)
    .where(
      and(
        eq(dailySignupCounters.provider, provider),
        eq(dailySignupCounters.dateKey, dateKey),
      ),
    )
    .limit(1);
  const current = rows[0];
  const limit =
    provider === "github"
      ? settings.githubDailyLimit
      : settings.linuxdoDailyLimit;
  const currentCount = current?.createdCount ?? 0;
  if (currentCount >= limit) {
    throw new ApiError(429, "Daily signup quota exceeded");
  }

  if (current) {
    await db
      .update(dailySignupCounters)
      .set({
        createdCount: currentCount + 1,
        updatedAt: nowIso(),
      })
      .where(eq(dailySignupCounters.id, current.id));
    return;
  }

  await db.insert(dailySignupCounters).values({
    id: randomId("dsc"),
    provider,
    dateKey,
    createdCount: 1,
    updatedAt: nowIso(),
  });
};

const getProviderMode = (
  settings: ResolvedRegistrationSettings,
  provider: ExternalProvider,
) => (provider === "github" ? settings.githubMode : settings.linuxdoMode);

export const resolveExternalRegistrationRequirement = async (
  env: WorkerEnv,
  provider: ExternalProvider,
  inviteCode?: string | null,
): Promise<InviteResolution> => {
  const db = getDb(env);
  const totalUsers = await db.select({ value: count() }).from(users);
  const isEmpty = (totalUsers[0]?.value ?? 0) === 0;
  const normalizedInvite = inviteCode?.trim() || null;

  if (isEmpty) {
    const bootstrapCode = env.BOOTSTRAP_ADMIN_INVITE_CODE?.trim() || null;
    if (!bootstrapCode) {
      throw new ApiError(403, "Bootstrap invite required");
    }
    if (!normalizedInvite) {
      return {
        inviteRequired: true,
        invitePrevalidated: false,
      };
    }
    if (normalizedInvite !== bootstrapCode) {
      throw new ApiError(403, "Invalid bootstrap invite");
    }
    const usedBootstrap = await resolveInviteForCode(env, normalizedInvite);
    if (usedBootstrap?.usedAt) {
      throw new ApiError(409, "Bootstrap invite already used");
    }
    return {
      inviteRequired: true,
      invitePrevalidated: true,
      role: "admin",
      inviteId: usedBootstrap?.id ?? null,
      bootstrap: true,
    };
  }

  if (normalizedInvite) {
    const invite = await resolveInviteForCode(env, normalizedInvite);
    if (!invite) throw new ApiError(404, "Invite not found");
    if (invite.usedAt) throw new ApiError(409, "Invite already used");
    return {
      inviteRequired: true,
      invitePrevalidated: true,
      role: invite.role as "admin" | "member",
      inviteId: invite.id,
      bootstrap: false,
    };
  }

  const settings = await getRegistrationSettings(env);
  const mode = getProviderMode(settings, provider);
  if (mode === "off") throw new ApiError(403, "Registration is disabled");
  if (mode === "invite-only") {
    return {
      inviteRequired: true,
      invitePrevalidated: false,
    };
  }

  return {
    inviteRequired: false,
    invitePrevalidated: false,
  };
};

export const resolvePasskeyRegistrationRequirement = async (
  env: WorkerEnv,
  inviteCode?: string | null,
) => {
  const db = getDb(env);
  const totalUsers = await db.select({ value: count() }).from(users);
  const isEmpty = (totalUsers[0]?.value ?? 0) === 0;
  const normalizedInvite = inviteCode?.trim() || null;

  if (isEmpty) {
    const bootstrapCode = env.BOOTSTRAP_ADMIN_INVITE_CODE?.trim() || null;
    if (!bootstrapCode) {
      throw new ApiError(403, "Bootstrap invite required");
    }
    if (!normalizedInvite) {
      return {
        inviteRequired: true,
        invitePrevalidated: false,
      } satisfies InviteResolution;
    }
    if (normalizedInvite !== bootstrapCode) {
      throw new ApiError(403, "Invalid bootstrap invite");
    }
    const usedBootstrap = await resolveInviteForCode(env, normalizedInvite);
    if (usedBootstrap?.usedAt) {
      throw new ApiError(409, "Bootstrap invite already used");
    }
    return {
      inviteRequired: true,
      invitePrevalidated: true,
      role: "admin",
      inviteId: usedBootstrap?.id ?? null,
      bootstrap: true,
    } satisfies InviteResolution;
  }

  const settings = await getRegistrationSettings(env);
  if (settings.passkeyMode !== "invite-only") {
    throw new ApiError(403, "Passkey registration is disabled");
  }
  if (!normalizedInvite) {
    return {
      inviteRequired: true,
      invitePrevalidated: false,
    } satisfies InviteResolution;
  }
  const invite = await resolveInviteForCode(env, normalizedInvite);
  if (!invite) throw new ApiError(404, "Invite not found");
  if (invite.usedAt) throw new ApiError(409, "Invite already used");
  return {
    inviteRequired: true,
    invitePrevalidated: true,
    role: invite.role as "admin" | "member",
    inviteId: invite.id,
    bootstrap: false,
  } satisfies InviteResolution;
};

export const consumeInviteForAuthenticatedUser = async (
  env: WorkerEnv,
  userId: string,
  inviteCode?: string | null,
) => {
  const normalizedInvite = inviteCode?.trim() || null;
  if (!normalizedInvite) return;

  const bootstrapCode = env.BOOTSTRAP_ADMIN_INVITE_CODE?.trim() || null;
  if (bootstrapCode && normalizedInvite === bootstrapCode) {
    const existingInvite = await resolveInviteForCode(env, normalizedInvite);
    if (existingInvite?.usedAt) {
      throw new ApiError(409, "Bootstrap invite already used");
    }
    if (existingInvite) {
      await claimInvite(env, existingInvite.id, userId);
      return;
    }
    const db = getDb(env);
    const usedAt = nowIso();
    await db.insert(invites).values({
      id: randomId("inv"),
      code: normalizedInvite,
      kind: "bootstrap_admin",
      role: "admin",
      note: "Bootstrap admin invite",
      createdByUserId: null,
      createdAt: usedAt,
      usedAt,
      usedByUserId: userId,
    });
    return;
  }

  const invite = await resolveInviteForCode(env, normalizedInvite);
  if (!invite) throw new ApiError(404, "Invite not found");
  if (invite.usedAt) throw new ApiError(409, "Invite already used");
  await claimInvite(env, invite.id, userId);
};

export const resolveInteractiveMethodCount = async (
  env: WorkerEnv,
  userId: string,
) => {
  const db = getDb(env);
  const externalRows = await db
    .select({ value: count() })
    .from(externalAccounts)
    .where(
      and(
        eq(externalAccounts.userId, userId),
        isNull(externalAccounts.releasedAt),
      ),
    );
  const passkeyRows = await db
    .select({ value: count() })
    .from(passkeys)
    .where(and(eq(passkeys.userId, userId), isNull(passkeys.revokedAt)));
  return (externalRows[0]?.value ?? 0) + (passkeyRows[0]?.value ?? 0);
};

export const getUserRecord = async (env: WorkerEnv, userId: string) => {
  const db = getDb(env);
  const rows = await db
    .select()
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  return rows[0] ?? null;
};

export const createUserRecord = async (
  env: WorkerEnv,
  input: {
    username: string;
    nickname: string;
    role?: "admin" | "member";
  },
) => {
  const db = getDb(env);
  const now = nowIso();
  const record = {
    id: randomId("usr"),
    username: input.username,
    nickname: input.nickname,
    role: input.role ?? "member",
    deletedAt: null,
    createdAt: now,
    updatedAt: now,
  } satisfies typeof users.$inferInsert;
  await db.insert(users).values(record);
  return record;
};

export const getAccountForUser = async (env: WorkerEnv, userId: string) => {
  const row = await getUserRecord(env, userId);
  if (!row || row.deletedAt) throw new ApiError(404, "User not found");
  return row;
};

export const updateNickname = async (
  env: WorkerEnv,
  userId: string,
  nickname: string,
) => {
  const db = getDb(env);
  await db
    .update(users)
    .set({ nickname, updatedAt: nowIso() })
    .where(eq(users.id, userId));
  return getAccountForUser(env, userId);
};

export const listExternalAccountsForUser = async (
  env: WorkerEnv,
  userId: string,
) => {
  const db = getDb(env);
  const rows = await db
    .select()
    .from(externalAccounts)
    .where(
      and(
        eq(externalAccounts.userId, userId),
        isNull(externalAccounts.releasedAt),
      ),
    );
  return rows.map(mapExternalAccountRow);
};

export const bindExternalAccount = async (
  env: WorkerEnv,
  userId: string,
  record: ExternalAccountRecord,
) => {
  const db = getDb(env);
  const conflictRows = await db
    .select({ id: externalAccounts.id, userId: externalAccounts.userId })
    .from(externalAccounts)
    .where(
      and(
        eq(externalAccounts.provider, record.provider),
        eq(externalAccounts.providerUserId, record.providerUserId),
        isNull(externalAccounts.releasedAt),
      ),
    )
    .limit(1);
  const conflict = conflictRows[0];
  if (conflict && conflict.userId !== userId) {
    throw new ApiError(409, "External account already bound");
  }

  const existingRows = await db
    .select()
    .from(externalAccounts)
    .where(
      and(
        eq(externalAccounts.userId, userId),
        eq(externalAccounts.provider, record.provider),
        isNull(externalAccounts.releasedAt),
      ),
    )
    .limit(1);

  const now = nowIso();
  if (existingRows[0]) {
    await db
      .update(externalAccounts)
      .set({
        providerUserId: record.providerUserId,
        providerUsername: record.providerUsername ?? null,
        providerNickname: record.providerNickname ?? null,
        avatarUrl: record.avatarUrl ?? null,
        profileUrl: record.profileUrl ?? null,
        lastUsedAt: now,
      })
      .where(eq(externalAccounts.id, existingRows[0].id));
    const rows = await db
      .select()
      .from(externalAccounts)
      .where(eq(externalAccounts.id, existingRows[0].id))
      .limit(1);
    const updatedRow = rows[0];
    if (!updatedRow) {
      throw new ApiError(500, "Failed to reload external account");
    }
    return mapExternalAccountRow(updatedRow);
  }

  const inserted = {
    id: randomId("ext"),
    userId,
    provider: record.provider,
    providerUserId: record.providerUserId,
    providerUsername: record.providerUsername ?? null,
    providerNickname: record.providerNickname ?? null,
    avatarUrl: record.avatarUrl ?? null,
    profileUrl: record.profileUrl ?? null,
    createdAt: now,
    lastUsedAt: now,
    releasedAt: null,
  } satisfies typeof externalAccounts.$inferInsert;
  await db.insert(externalAccounts).values(inserted);
  return mapExternalAccountRow(inserted);
};

export const releaseExternalAccount = async (
  env: WorkerEnv,
  userId: string,
  externalAccountId: string,
) => {
  const db = getDb(env);
  const rows = await db
    .select()
    .from(externalAccounts)
    .where(eq(externalAccounts.id, externalAccountId))
    .limit(1);
  const record = rows[0];
  if (!record || record.releasedAt)
    throw new ApiError(404, "External account not found");
  if (record.userId !== userId) throw new ApiError(403, "Forbidden");
  const methodCount = await resolveInteractiveMethodCount(env, userId);
  if (methodCount <= 1) {
    throw new ApiError(409, "Cannot remove the last interactive login method");
  }
  await db
    .update(externalAccounts)
    .set({
      releasedAt: nowIso(),
    })
    .where(eq(externalAccounts.id, externalAccountId));
};

export const markExternalAccountUsed = async (
  env: WorkerEnv,
  externalAccountId: string,
) => {
  const db = getDb(env);
  await db
    .update(externalAccounts)
    .set({ lastUsedAt: nowIso() })
    .where(eq(externalAccounts.id, externalAccountId));
};

export const softDeleteAccount = async (env: WorkerEnv, user: AuthUser) => {
  const db = getDb(env);
  const rows = await db
    .select({ id: users.id, role: users.role })
    .from(users)
    .where(eq(users.id, user.id))
    .limit(1);
  const record = rows[0];
  if (!record) throw new ApiError(404, "User not found");
  if (record.role === "admin") {
    throw new ApiError(409, "Transfer admin before deleting this account");
  }

  const deletedAt = nowIso();
  const settings = await getRegistrationSettings(env);
  const retentionDays = settings.deletedUserMailboxRetentionDays;
  const retentionMillis = retentionDays * 24 * 60 * 60 * 1000;
  const mailboxExpiry = new Date(
    Date.parse(deletedAt) + retentionMillis,
  ).toISOString();

  await db
    .update(users)
    .set({
      deletedAt,
      updatedAt: deletedAt,
      nickname: `${resolveDisplayNickname(user)} (deleted)`,
    })
    .where(eq(users.id, user.id));

  await db
    .update(externalAccounts)
    .set({ releasedAt: deletedAt })
    .where(
      and(
        eq(externalAccounts.userId, user.id),
        isNull(externalAccounts.releasedAt),
      ),
    );
  await db
    .update(passkeys)
    .set({ revokedAt: deletedAt })
    .where(and(eq(passkeys.userId, user.id), isNull(passkeys.revokedAt)));
  await revokeAllApiKeysForUser(env, user.id);
  await db
    .update(mailboxes)
    .set({
      expiresAt: retentionDays === 0 ? deletedAt : mailboxExpiry,
    })
    .where(
      and(
        eq(mailboxes.userId, user.id),
        or(
          isNull(mailboxes.expiresAt),
          sql`${mailboxes.expiresAt} > ${mailboxExpiry}`,
        ),
        inArray(mailboxes.status, ["active", "expired", "destroying"]),
      ),
    );
};

export const listAdminUsers = async (env: WorkerEnv) => {
  const db = getDb(env);
  const userRows = await db
    .select()
    .from(users)
    .orderBy(sql`${users.createdAt} asc`);
  const userIds = userRows.map((row) => row.id);
  const externalRows = userIds.length
    ? await db
        .select()
        .from(externalAccounts)
        .where(
          and(
            inArray(externalAccounts.userId, userIds),
            isNull(externalAccounts.releasedAt),
          ),
        )
    : [];
  const passkeyCounts = userIds.length
    ? await db
        .select({
          userId: passkeys.userId,
          value: count(),
        })
        .from(passkeys)
        .where(
          and(inArray(passkeys.userId, userIds), isNull(passkeys.revokedAt)),
        )
        .groupBy(passkeys.userId)
    : [];
  const externalByUser = new Map<
    string,
    ReturnType<typeof mapExternalAccountRow>[]
  >();
  for (const row of externalRows) {
    const current = externalByUser.get(row.userId) ?? [];
    current.push(mapExternalAccountRow(row));
    externalByUser.set(row.userId, current);
  }
  const passkeyCountByUser = new Map(
    passkeyCounts.map((row) => [row.userId, row.value]),
  );
  return userRows.map((row) =>
    adminUserSchema.parse({
      id: row.id,
      username: row.username,
      nickname: row.nickname,
      role: row.role,
      deletedAt: row.deletedAt,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
      externalAccounts: externalByUser.get(row.id) ?? [],
      passkeyCount: passkeyCountByUser.get(row.id) ?? 0,
    }),
  );
};

export const listAdminUsersPaginated = async (
  env: WorkerEnv,
  input: PaginationInput,
) => {
  const db = getDb(env);
  const page = Math.max(1, input.page);
  const pageSize = Math.max(1, input.pageSize);
  const totalRows = await db.select({ value: count() }).from(users);
  const totalItems = totalRows[0]?.value ?? 0;
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
  const normalizedPage = Math.min(page, totalPages);
  const normalizedOffset = (normalizedPage - 1) * pageSize;
  const userRows = await db
    .select()
    .from(users)
    .orderBy(sql`${users.createdAt} asc`)
    .limit(pageSize)
    .offset(normalizedOffset);
  const userIds = userRows.map((row) => row.id);
  const externalRows = userIds.length
    ? await db
        .select()
        .from(externalAccounts)
        .where(
          and(
            inArray(externalAccounts.userId, userIds),
            isNull(externalAccounts.releasedAt),
          ),
        )
    : [];
  const passkeyCounts = userIds.length
    ? await db
        .select({
          userId: passkeys.userId,
          value: count(),
        })
        .from(passkeys)
        .where(
          and(inArray(passkeys.userId, userIds), isNull(passkeys.revokedAt)),
        )
        .groupBy(passkeys.userId)
    : [];
  const externalByUser = new Map<
    string,
    ReturnType<typeof mapExternalAccountRow>[]
  >();
  for (const row of externalRows) {
    const current = externalByUser.get(row.userId) ?? [];
    current.push(mapExternalAccountRow(row));
    externalByUser.set(row.userId, current);
  }
  const passkeyCountByUser = new Map(
    passkeyCounts.map((row) => [row.userId, row.value]),
  );
  return {
    users: userRows.map((row) =>
      adminUserSchema.parse({
        id: row.id,
        username: row.username,
        nickname: row.nickname,
        role: row.role,
        deletedAt: row.deletedAt,
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
        externalAccounts: externalByUser.get(row.id) ?? [],
        passkeyCount: passkeyCountByUser.get(row.id) ?? 0,
      }),
    ),
    pagination: {
      page: normalizedPage,
      pageSize,
      totalItems,
      totalPages,
    },
  };
};

const ensureTransferParticipants = async (
  env: WorkerEnv,
  currentAdminId: string,
  nextAdminId: string,
) => {
  const db = getDb(env);
  const rows = await db
    .select()
    .from(users)
    .where(inArray(users.id, [currentAdminId, nextAdminId]));
  const currentAdmin = rows.find((row) => row.id === currentAdminId);
  const nextAdmin = rows.find((row) => row.id === nextAdminId);
  if (
    !currentAdmin ||
    currentAdmin.deletedAt ||
    currentAdmin.role !== "admin"
  ) {
    throw new ApiError(403, "Only the current admin can transfer admin");
  }
  if (!nextAdmin || nextAdmin.deletedAt) {
    throw new ApiError(404, "Target user not found");
  }
  return { currentAdmin, nextAdmin };
};

export const createAdminTransferIntent = async (
  env: WorkerEnv,
  config: RuntimeConfig,
  actorUserId: string,
  targetUserId: string,
) => {
  if (actorUserId === targetUserId) {
    throw new ApiError(409, "Cannot transfer admin to the current admin");
  }
  await ensureTransferParticipants(env, actorUserId, targetUserId);
  const now = Math.floor(Date.now() / 1000);
  return signPayload<AdminTransferIntentPayload>(
    {
      kind: "admin-transfer-intent",
      actorUserId,
      targetUserId,
      iat: now,
      exp: now + ADMIN_TRANSFER_INTENT_TTL_SECONDS,
    },
    config.SESSION_SECRET,
  );
};

const resolveAdminTransferIntent = async (
  config: RuntimeConfig,
  intentToken: string,
) => {
  const payload = await verifyPayload<AdminTransferIntentPayload>(
    intentToken,
    config.SESSION_SECRET,
  );
  if (!payload || payload.kind !== "admin-transfer-intent") {
    throw new ApiError(400, "Admin transfer verification expired");
  }
  return payload;
};

const issueAdminTransferVerification = async (
  config: RuntimeConfig,
  payload: {
    actorUserId: string;
    targetUserId: string;
    method: AdminTransferMethod;
  },
) => {
  const now = Math.floor(Date.now() / 1000);
  return signPayload<AdminTransferVerificationPayload>(
    {
      kind: "admin-transfer-verification",
      actorUserId: payload.actorUserId,
      targetUserId: payload.targetUserId,
      method: payload.method,
      iat: now,
      exp: now + ADMIN_TRANSFER_VERIFICATION_TTL_SECONDS,
    },
    config.SESSION_SECRET,
  );
};

const resolveAdminTransferVerification = async (
  config: RuntimeConfig,
  verificationToken: string,
) => {
  const payload = await verifyPayload<AdminTransferVerificationPayload>(
    verificationToken,
    config.SESSION_SECRET,
  );
  if (!payload || payload.kind !== "admin-transfer-verification") {
    throw new ApiError(400, "Admin transfer verification expired");
  }
  return payload;
};

export const verifyAdminTransferWithApiKey = async (
  env: WorkerEnv,
  config: RuntimeConfig,
  actorUserId: string,
  input: {
    intentToken: string;
    apiKey: string;
  },
) => {
  const intent = await resolveAdminTransferIntent(config, input.intentToken);
  if (intent.actorUserId !== actorUserId) {
    throw new ApiError(403, "Admin transfer verification failed");
  }
  await ensureTransferParticipants(env, actorUserId, intent.targetUserId);
  const authenticatedUser = await authenticateApiKey(env, config, input.apiKey);
  if (!authenticatedUser || authenticatedUser.id !== actorUserId) {
    throw new ApiError(401, "Invalid API key");
  }
  return {
    targetUserId: intent.targetUserId,
    verificationToken: await issueAdminTransferVerification(config, {
      actorUserId,
      targetUserId: intent.targetUserId,
      method: "api-key",
    }),
  };
};

export const verifyAdminTransferReauthSubject = async (
  env: WorkerEnv,
  config: RuntimeConfig,
  actorUserId: string,
  input: {
    intentToken: string;
    method: Exclude<AdminTransferMethod, "api-key">;
    authenticatedUserId: string;
  },
) => {
  const intent = await resolveAdminTransferIntent(config, input.intentToken);
  if (
    intent.actorUserId !== actorUserId ||
    input.authenticatedUserId !== actorUserId
  ) {
    throw new ApiError(403, "Admin transfer verification failed");
  }
  await ensureTransferParticipants(env, actorUserId, intent.targetUserId);
  return {
    targetUserId: intent.targetUserId,
    verificationToken: await issueAdminTransferVerification(config, {
      actorUserId,
      targetUserId: intent.targetUserId,
      method: input.method,
    }),
  };
};

export const transferAdminRole = async (
  env: WorkerEnv,
  config: RuntimeConfig,
  currentAdminId: string,
  nextAdminId: string,
  verificationToken: string,
) => {
  if (currentAdminId === nextAdminId) return;
  const verification = await resolveAdminTransferVerification(
    config,
    verificationToken,
  );
  if (
    verification.actorUserId !== currentAdminId ||
    verification.targetUserId !== nextAdminId
  ) {
    throw new ApiError(403, "Admin transfer verification failed");
  }
  const db = getDb(env);
  await ensureTransferParticipants(env, currentAdminId, nextAdminId);
  const updatedAt = nowIso();
  await db
    .update(users)
    .set({ role: "member", updatedAt })
    .where(eq(users.id, currentAdminId));
  await db
    .update(users)
    .set({ role: "admin", updatedAt })
    .where(eq(users.id, nextAdminId));
};

export const findUserByExternalAccount = async (
  env: WorkerEnv,
  provider: ExternalProvider,
  providerUserId: string,
) => {
  const db = getDb(env);
  const rows = await db
    .select({
      externalAccountId: externalAccounts.id,
      id: users.id,
      username: users.username,
      nickname: users.nickname,
      role: users.role,
      deletedAt: users.deletedAt,
    })
    .from(externalAccounts)
    .innerJoin(users, eq(externalAccounts.userId, users.id))
    .where(
      and(
        eq(externalAccounts.provider, provider),
        eq(externalAccounts.providerUserId, providerUserId),
        isNull(externalAccounts.releasedAt),
      ),
    )
    .limit(1);
  return rows[0] ?? null;
};

export const buildAuthProviderStatuses = async (
  env: WorkerEnv,
  config: RuntimeConfig,
) => {
  const db = getDb(env);
  const settings = await getRegistrationSettings(env);
  const oauth = resolveStoredOauthConfig(settings, config);
  const dateKey = shanghaiDateKey();
  const counterRows = await db
    .select()
    .from(dailySignupCounters)
    .where(eq(dailySignupCounters.dateKey, dateKey));
  const countByProvider = new Map(
    counterRows.map((row) => [row.provider, row.createdCount]),
  );
  const githubConfigured = Boolean(
    oauth.githubClientId && oauth.githubClientSecret,
  );
  const linuxdoConfigured = Boolean(
    oauth.linuxdoClientId &&
      oauth.linuxdoClientSecret &&
      oauth.linuxdoOauthBaseUrl,
  );
  return [
    {
      provider: "github" as const,
      configured: githubConfigured,
      loginEnabled: githubConfigured,
      registrationMode: settings.githubMode,
      dailyLimit: settings.githubDailyLimit,
      dailyUsed: countByProvider.get("github") ?? 0,
      dailyRemaining: Math.max(
        settings.githubDailyLimit - (countByProvider.get("github") ?? 0),
        0,
      ),
    },
    {
      provider: "linuxdo" as const,
      configured: linuxdoConfigured,
      loginEnabled: linuxdoConfigured,
      registrationMode: settings.linuxdoMode,
      dailyLimit: settings.linuxdoDailyLimit,
      dailyUsed: countByProvider.get("linuxdo") ?? 0,
      dailyRemaining: Math.max(
        settings.linuxdoDailyLimit - (countByProvider.get("linuxdo") ?? 0),
        0,
      ),
    },
    {
      provider: "passkey" as const,
      configured: Boolean(
        config.WEB_APP_ORIGINS?.length || config.WEB_APP_ORIGIN,
      ),
      loginEnabled: Boolean(
        config.WEB_APP_ORIGINS?.length || config.WEB_APP_ORIGIN,
      ),
      registrationMode: settings.passkeyMode,
      dailyLimit: null,
      dailyUsed: 0,
      dailyRemaining: null,
    },
  ];
};

export const registerViaExternalProvider = async (
  env: WorkerEnv,
  provider: ExternalProvider,
  profile: ExternalAccountRecord,
  options?: { inviteCode?: string | null; nickname?: string | null },
) => {
  const existing = await findUserByExternalAccount(
    env,
    provider,
    profile.providerUserId,
  );
  if (existing && !existing.deletedAt) {
    await markExternalAccountUsed(env, existing.externalAccountId);
    return {
      user: {
        id: existing.id,
        username: existing.username,
        nickname: existing.nickname,
        role: existing.role === "admin" ? "admin" : "member",
      } satisfies AuthUser,
      created: false,
    };
  }

  const inviteResolution = await resolveExternalRegistrationRequirement(
    env,
    provider,
    options?.inviteCode ?? null,
  );
  const role = inviteResolution.role ?? "member";
  const consumedInviteId = inviteResolution.inviteId ?? null;
  const isBootstrap = inviteResolution.bootstrap === true;

  const nickname =
    options?.nickname?.trim() ||
    profile.providerNickname?.trim() ||
    profile.providerUsername?.trim() ||
    `${provider} user`;
  const username = await generateUsername(
    env,
    profile.providerUsername || profile.providerNickname || provider,
    provider,
  );
  const user = await createUserRecord(env, {
    username,
    nickname,
    role,
  });
  if (!inviteResolution.invitePrevalidated) {
    await consumeDailyOpenRegistration(env, provider);
  } else if (!consumedInviteId && !isBootstrap) {
    await consumeDailyOpenRegistration(env, provider);
  }
  const boundAccount = await bindExternalAccount(env, user.id, profile);
  if (consumedInviteId) {
    await claimInvite(env, consumedInviteId, user.id);
  } else if (isBootstrap) {
    await consumeInviteForAuthenticatedUser(
      env,
      user.id,
      options?.inviteCode ?? null,
    );
  }
  return {
    user: {
      id: user.id,
      username: user.username,
      nickname: user.nickname,
      role: user.role,
    } satisfies AuthUser,
    externalAccount: boundAccount,
    created: true,
  };
};

export const registerViaPasskeyInvite = async (
  env: WorkerEnv,
  inviteCode: string,
  nickname: string,
) => {
  const inviteResolution = await resolvePasskeyRegistrationRequirement(
    env,
    inviteCode,
  );
  const role = inviteResolution.role ?? "member";
  const inviteId = inviteResolution.inviteId ?? null;

  const username = await generateUsername(env, nickname, "member");
  const user = await createUserRecord(env, {
    username,
    nickname,
    role,
  });
  if (inviteId) {
    await claimInvite(env, inviteId, user.id);
  } else if (inviteResolution.bootstrap) {
    await consumeInviteForAuthenticatedUser(env, user.id, inviteCode);
  }
  return user;
};
