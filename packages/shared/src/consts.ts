export const userRoles = ["admin", "member"] as const;
export const mailboxStatuses = ["active", "destroying", "destroyed"] as const;
export const domainStatuses = [
  "active",
  "disabled",
  "provisioning_error",
] as const;
export const domainCatalogAvailabilities = ["available", "missing"] as const;
export const domainProjectStatuses = [
  "not_enabled",
  "active",
  "disabled",
  "provisioning_error",
] as const;
export const recipientKinds = ["to", "cc", "bcc", "replyTo"] as const;
export const attachmentDispositions = [
  "attachment",
  "inline",
  "unknown",
] as const;
export const minMailboxTtlMinutes = 5;
export const maxMailboxTtlMinutes = 24 * 60;

export const mailboxLocalPartRegex = /^[a-z0-9](?:[a-z0-9-]{0,30}[a-z0-9])?$/;

export const mailboxSubdomainRegex =
  /^(?=.{1,190}$)[a-z0-9](?:[a-z0-9-]{0,30}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,30}[a-z0-9])?)*$/;

export const rootDomainRegex =
  /^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)(?:\.(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?))+$/;
