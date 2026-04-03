import { mailboxLocalPartRegex, mailboxSubdomainRegex } from "@cf-mail/shared";

export interface ParsedMailboxAddress {
  localPart: string;
  subdomain: string;
  rootDomain: string;
  address: string;
}

export const buildMailboxAddress = (
  localPart: string,
  subdomain: string,
  rootDomain: string,
): ParsedMailboxAddress => ({
  localPart,
  subdomain,
  rootDomain,
  address: `${localPart}@${subdomain}.${rootDomain}`,
});

export const randomLabel = (prefix: string) =>
  `${prefix}-${crypto.randomUUID().slice(0, 8)}`.toLowerCase();

export const normalizeLabel = (value: string) => value.toLowerCase().trim();

export const normalizeRootDomain = (value: string) =>
  value
    .toLowerCase()
    .trim()
    .replace(/^\.+|\.+$/g, "");

export const normalizeMailboxAddress = (value: string) =>
  value.trim().toLowerCase();

export const parseMailboxAddress = (
  value: string,
  rootDomain: string,
): ParsedMailboxAddress | null => {
  const address = normalizeMailboxAddress(value);
  const [localPart, domain] = address.split("@");
  const normalizedRootDomain = normalizeRootDomain(rootDomain);
  const suffix = `.${normalizedRootDomain}`;

  if (!localPart || !domain || domain.length <= suffix.length) return null;
  if (!domain.endsWith(suffix)) return null;

  const subdomain = domain.slice(0, -suffix.length);
  if (
    !mailboxLocalPartRegex.test(localPart) ||
    !mailboxSubdomainRegex.test(subdomain)
  ) {
    return null;
  }

  return {
    localPart,
    subdomain,
    rootDomain: normalizedRootDomain,
    address: `${localPart}@${subdomain}${suffix}`,
  };
};

export const parseMailboxAddressAgainstDomains = (
  value: string,
  rootDomains: string[],
) => {
  const orderedDomains = [...rootDomains]
    .map((entry) => normalizeRootDomain(entry))
    .sort((left, right) => right.length - left.length);

  for (const rootDomain of orderedDomains) {
    const parsed = parseMailboxAddress(value, rootDomain);
    if (parsed) return parsed;
  }

  return null;
};

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
