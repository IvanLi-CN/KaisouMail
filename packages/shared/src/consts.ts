export const userRoles = ["admin", "member"] as const;
export const mailboxStatuses = ["active", "destroying", "destroyed"] as const;
export const recipientKinds = ["to", "cc", "bcc", "replyTo"] as const;
export const attachmentDispositions = [
  "attachment",
  "inline",
  "unknown",
] as const;
