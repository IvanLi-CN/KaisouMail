import {
  buildMailboxAddress,
  normalizeMailboxAddress,
  normalizeRootDomain,
  type ParsedMailboxAddress,
  parseMailboxAddress,
  parseMailboxAddressAgainstDomains,
} from "@kaisoumail/shared";

export {
  buildMailboxAddress,
  normalizeMailboxAddress,
  normalizeRootDomain,
  type ParsedMailboxAddress,
  parseMailboxAddress,
  parseMailboxAddressAgainstDomains,
};

export const randomLabel = (prefix: string) =>
  `${prefix}-${crypto.randomUUID().slice(0, 8)}`.toLowerCase();

export const normalizeLabel = (value: string) => value.toLowerCase().trim();

export const extractRootDomainFromAddress = (
  address: string,
  subdomain: string,
) => {
  const [, domain] = normalizeMailboxAddress(address).split("@");
  if (!domain) return null;
  const prefix = `${normalizeLabel(subdomain)}.`;
  if (!domain.startsWith(prefix) || domain.length <= prefix.length) return null;
  return domain.slice(prefix.length);
};

export const extractPreviewText = (
  text: string | null | undefined,
  html: string | null | undefined,
) => {
  const source =
    text?.trim() ||
    (html ? html.replace(/<[^>]+>/g, " ") : "") ||
    "(no preview)";
  return source.replace(/\s+/g, " ").trim().slice(0, 140);
};

export const resolveDisposition = (value: unknown) => {
  if (typeof value !== "string") return "unknown";
  const lowered = value.toLowerCase();
  if (lowered.includes("inline")) return "inline";
  if (lowered.includes("attachment")) return "attachment";
  return "unknown";
};
