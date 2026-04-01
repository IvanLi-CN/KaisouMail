export const userRoles = ["admin", "member"] as const;
export const mailboxStatuses = ["active", "destroying", "destroyed"] as const;
export const recipientKinds = ["to", "cc", "bcc", "replyTo"] as const;
export const attachmentDispositions = [
  "attachment",
  "inline",
  "unknown",
] as const;

export const mailboxLocalPartRegex = /^[a-z0-9](?:[a-z0-9-]{0,30}[a-z0-9])?$/;

export const mailboxSubdomainRegex =
  /^(?=.{1,190}$)[a-z0-9](?:[a-z0-9-]{0,30}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,30}[a-z0-9])?)*$/;
