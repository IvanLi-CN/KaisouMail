import { eq } from "drizzle-orm";

import { getDb } from "../db/client";
import { runtimeState } from "../db/schema";
import type { WorkerEnv } from "../env";
import { nowIso } from "../lib/crypto";

export const getRuntimeStateValue = async (env: WorkerEnv, key: string) => {
  const db = getDb(env);
  const rows = await db
    .select()
    .from(runtimeState)
    .where(eq(runtimeState.key, key))
    .limit(1);

  return rows[0]?.value ?? null;
};

export const setRuntimeStateValue = async (
  env: WorkerEnv,
  key: string,
  value: string,
) => {
  const db = getDb(env);
  const updatedAt = nowIso();

  await db
    .insert(runtimeState)
    .values({
      key,
      value,
      updatedAt,
    })
    .onConflictDoUpdate({
      target: runtimeState.key,
      set: {
        value,
        updatedAt,
      },
    });

  return value;
};

export const tryAcquireRuntimeLease = async (
  env: WorkerEnv,
  key: string,
  owner: string,
  leaseUntil: string,
) => {
  const now = nowIso();
  const row = await env.DB.prepare(
    `INSERT INTO runtime_state (key, value, updated_at)
    VALUES (?, ?, ?)
    ON CONFLICT(key) DO UPDATE
      SET value = excluded.value,
          updated_at = excluded.updated_at
    WHERE runtime_state.updated_at <= ?
       OR runtime_state.value = ?
    RETURNING value, updated_at AS updatedAt`,
  )
    .bind(key, owner, leaseUntil, now, owner)
    .first<{ value: string; updatedAt: string }>();

  if (!row || row.value !== owner) {
    return null;
  }

  return {
    owner: row.value,
    leaseUntil: row.updatedAt,
  };
};

export const releaseRuntimeLease = async (
  env: WorkerEnv,
  key: string,
  owner: string,
) => {
  await env.DB.prepare(
    `DELETE FROM runtime_state
    WHERE key = ?
      AND value = ?`,
  )
    .bind(key, owner)
    .run();
};
