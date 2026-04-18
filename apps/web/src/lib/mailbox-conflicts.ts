import { didMailboxExpiryExtend, mailboxSchema } from "@kaisoumail/shared";
import { z } from "zod";

import { ApiClientError } from "@/lib/api";
import type { Mailbox } from "@/lib/contracts";

const existingMailboxConflictDetailsSchema = z.object({
  code: z.literal("mailbox_exists"),
  mailbox: mailboxSchema,
});

export const extractExistingMailboxConflict = (error: unknown) => {
  if (!(error instanceof ApiClientError) || error.status !== 409) {
    return null;
  }

  const parsed = existingMailboxConflictDetailsSchema.safeParse(error.details);
  if (!parsed.success) {
    return null;
  }

  return parsed.data;
};

export const resolveMailboxTtlUpdateOutcome = ({
  previousMailbox,
  nextMailbox,
}: {
  previousMailbox: Mailbox;
  nextMailbox: Mailbox;
}) => {
  return didMailboxExpiryExtend({
    previousExpiresAt: previousMailbox.expiresAt,
    nextExpiresAt: nextMailbox.expiresAt,
  })
    ? "updated"
    : "unchanged";
};
