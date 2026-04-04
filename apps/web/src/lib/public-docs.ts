const trimTrailingSlash = (value: string) => value.replace(/\/+$/, "");

export type PublicDocsLinks = {
  docsHome: string;
  storybook: string;
  tokenPermissions: string;
  faq: string;
};

export const buildPublicDocsLinks = (
  origin?: string | null,
): PublicDocsLinks | null => {
  const rawOrigin = origin?.trim();
  if (!rawOrigin) return null;

  const docsOrigin = trimTrailingSlash(rawOrigin);
  return {
    docsHome: docsOrigin,
    storybook: `${docsOrigin}/storybook.html`,
    tokenPermissions: `${docsOrigin}/cloudflare-token-permissions`,
    faq: `${docsOrigin}/faq`,
  };
};

export const publicDocsLinks = buildPublicDocsLinks(
  import.meta.env.VITE_DOCS_SITE_ORIGIN,
);
