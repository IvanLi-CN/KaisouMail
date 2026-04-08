import {
  mailboxLocalPartRegex,
  mailboxSubdomainRegex,
  rootDomainRegex,
} from "./consts";

export interface ParsedMailboxAddress {
  localPart: string;
  subdomain: string;
  rootDomain: string;
  address: string;
}

export const normalizeMailboxLabel = (value: string) =>
  value.toLowerCase().trim();

export const normalizeRootDomain = (value: string) =>
  value
    .toLowerCase()
    .trim()
    .replace(/^\.+|\.+$/g, "");

export const normalizeMailboxAddress = (value: string) =>
  value.trim().toLowerCase();

export const buildMailboxAddress = (
  localPart: string,
  subdomain: string,
  rootDomain: string,
): ParsedMailboxAddress => {
  const normalizedLocalPart = normalizeMailboxLabel(localPart);
  const normalizedSubdomain = normalizeMailboxLabel(subdomain);
  const normalizedRootDomain = normalizeRootDomain(rootDomain);

  return {
    localPart: normalizedLocalPart,
    subdomain: normalizedSubdomain,
    rootDomain: normalizedRootDomain,
    address: `${normalizedLocalPart}@${normalizedSubdomain}.${normalizedRootDomain}`,
  };
};

export const parseMailboxAddress = (
  value: string,
  rootDomain: string,
): ParsedMailboxAddress | null => {
  const address = normalizeMailboxAddress(value);
  const [localPart, domain] = address.split("@");
  const normalizedRootDomain = normalizeRootDomain(rootDomain);
  const suffix = `.${normalizedRootDomain}`;

  if (!rootDomainRegex.test(normalizedRootDomain)) return null;
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
