const trimTrailingSlash = (value: string) => value.replace(/\/+$/, "");

export type PublicDocsLinks = {
  docsHome: string;
  storybook: string;
  tokenPermissions: string;
  domainCatalogEnablement: string;
  projectDomainBinding: string;
  faq: string;
};

export const buildPublicDocsLinks = (
  origin?: string | null,
): PublicDocsLinks | null => {
  const rawOrigin = origin?.trim();
  if (!rawOrigin) return null;

  const docsOrigin = trimTrailingSlash(rawOrigin);
  const zhDocsOrigin = docsOrigin.endsWith("/zh")
    ? docsOrigin
    : `${docsOrigin}/zh`;
  return {
    docsHome: `${zhDocsOrigin}/`,
    storybook: `${zhDocsOrigin}/storybook.html`,
    tokenPermissions: `${zhDocsOrigin}/cloudflare-token-permissions`,
    domainCatalogEnablement: `${zhDocsOrigin}/domain-catalog-enablement`,
    projectDomainBinding: `${zhDocsOrigin}/project-domain-binding`,
    faq: `${zhDocsOrigin}/faq`,
  };
};

export const publicDocsLinks = buildPublicDocsLinks(
  import.meta.env.VITE_DOCS_SITE_ORIGIN,
);
