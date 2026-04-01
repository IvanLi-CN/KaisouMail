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
