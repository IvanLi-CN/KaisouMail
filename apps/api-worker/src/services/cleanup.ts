import type { WorkerEnv } from "../env";
import { parseRuntimeConfig } from "../env";
import { destroyMailbox, listMailboxIdsPendingCleanup } from "./mailboxes";
import { backfillMessageVerification } from "./message-verification";
import { runSubdomainCleanup } from "./subdomain-cleanup";

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

  let subdomainCleanupError: unknown = null;
  try {
    await runSubdomainCleanup(env, config);
  } catch (error) {
    subdomainCleanupError = error;
  }

  await backfillMessageVerification(env, config);

  if (subdomainCleanupError && errors.length === 0) {
    throw subdomainCleanupError;
  }

  if (errors.length > 0) {
    throw new AggregateError(
      [
        ...errors.map(({ error }) =>
          error instanceof Error ? error : new Error(String(error)),
        ),
        ...(subdomainCleanupError
          ? [
              subdomainCleanupError instanceof Error
                ? subdomainCleanupError
                : new Error(String(subdomainCleanupError)),
            ]
          : []),
      ],
      `Mailbox cleanup failed for ${errors.length} mailbox(es): ${errors
        .map(({ mailboxId }) => mailboxId)
        .join(", ")}${
        subdomainCleanupError
          ? `; subdomain cleanup aborted: ${
              subdomainCleanupError instanceof Error
                ? subdomainCleanupError.message
                : String(subdomainCleanupError)
            }`
          : ""
      }`,
    );
  }

  return expiredIds.length;
};
