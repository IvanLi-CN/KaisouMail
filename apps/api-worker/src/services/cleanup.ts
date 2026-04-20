import type { WorkerEnv } from "../env";
import { parseRuntimeConfig } from "../env";
import { destroyMailbox, listMailboxIdsPendingCleanup } from "./mailboxes";
import { backfillMessageVerification } from "./message-verification";

export const runMailboxCleanup = async (env: WorkerEnv) => {
  const config = parseRuntimeConfig(env);
  const expiredIds = await listMailboxIdsPendingCleanup(env, config);
  const errors: Array<{ mailboxId: string; error: unknown }> = [];

  for (const mailboxId of expiredIds) {
    try {
      await destroyMailbox(env, config, mailboxId);
    } catch (error) {
      errors.push({ mailboxId, error });
    }
  }

  await backfillMessageVerification(env, config);

  if (errors.length > 0) {
    throw new AggregateError(
      errors.map(({ error }) =>
        error instanceof Error ? error : new Error(String(error)),
      ),
      `Mailbox cleanup failed for ${errors.length} mailbox(es): ${errors
        .map(({ mailboxId }) => mailboxId)
        .join(", ")}`,
    );
  }

  return expiredIds.length;
};
