import { count } from "drizzle-orm";
import type { Database } from "../db/client";
import { apiKeys, users } from "../db/schema";
import type { RuntimeConfig } from "../env";
import { nowIso, randomId, sha256Hex } from "../lib/crypto";

export const ensureBootstrapAdmin = async (
  db: Database,
  config: RuntimeConfig,
) => {
  const existing = await db.select({ value: count() }).from(users);
  if ((existing[0]?.value ?? 0) > 0) return;
  if (!config.BOOTSTRAP_ADMIN_EMAIL || !config.BOOTSTRAP_ADMIN_API_KEY) return;

  const userId = randomId("usr");
  const apiKeyId = randomId("key");
  const createdAt = nowIso();
  const keyHash = await sha256Hex(config.BOOTSTRAP_ADMIN_API_KEY);
  const prefix = config.BOOTSTRAP_ADMIN_API_KEY.slice(0, 12);

  await db.insert(users).values({
    id: userId,
    email: config.BOOTSTRAP_ADMIN_EMAIL,
    name: config.BOOTSTRAP_ADMIN_NAME,
    role: "admin",
    createdAt,
    updatedAt: createdAt,
  });

  await db.insert(apiKeys).values({
    id: apiKeyId,
    userId,
    name: "Bootstrap Admin",
    prefix,
    keyHash,
    scopes: JSON.stringify(["*"]),
    createdAt,
    lastUsedAt: null,
    revokedAt: null,
  });
};
