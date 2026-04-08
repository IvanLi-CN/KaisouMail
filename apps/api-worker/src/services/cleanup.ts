import type { WorkerEnv } from "../env";
import { parseRuntimeConfig } from "../env";
import { destroyMailbox, listMailboxIdsPendingCleanup } from "./mailboxes";

export const runMailboxCleanup = async (env: WorkerEnv) => {
  const config = parseRuntimeConfig(env);
  const expiredIds = await listMailboxIdsPendingCleanup(env, config);
  for (const mailboxId of expiredIds) {
    await destroyMailbox(env, config, mailboxId);
  }
  return expiredIds.length;
};
