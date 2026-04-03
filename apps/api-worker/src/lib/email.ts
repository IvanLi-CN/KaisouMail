import { mailboxLocalPartRegex, mailboxSubdomainRegex } from "@cf-mail/shared";

export interface ParsedMailboxAddress {
  localPart: string;
  subdomain: string;
  address: string;
}

export const buildMailboxAddress = (
  localPart: string,
  subdomain: string,
  rootDomain: string,
): ParsedMailboxAddress => ({
  localPart,
  subdomain,
  address: `${localPart}@${subdomain}.${rootDomain}`,
});

export const randomLabel = (prefix: string) =>
  `${prefix}-${crypto.randomUUID().slice(0, 8)}`.toLowerCase();

export const normalizeLabel = (value: string) => value.toLowerCase().trim();

export const normalizeMailboxAddress = (value: string) =>
  value.trim().toLowerCase();

export const parseMailboxAddress = (
  value: string,
  rootDomain: string,
): ParsedMailboxAddress | null => {
  const address = normalizeMailboxAddress(value);
  const [localPart, domain] = address.split("@");
  const suffix = `.${rootDomain.toLowerCase().trim()}`;

  if (!localPart || !domain || domain.length <= suffix.length) return null;
  if (!domain.endsWith(suffix)) return null;

  const subdomain = domain.slice(0, -suffix.length);
  if (!subdomain) return null;
  if (
    !mailboxLocalPartRegex.test(localPart) ||
    !mailboxSubdomainRegex.test(subdomain)
  ) {
    return null;
  }

  return {
    localPart,
    subdomain,
    address: `${localPart}@${subdomain}${suffix}`,
  };
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
