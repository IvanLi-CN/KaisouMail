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
