export type OAuthProvider = "github" | "linuxdo";

const providerCallbackPath = {
  github: "/api/auth/github/callback",
  linuxdo: "/api/auth/linuxdo/callback",
} satisfies Record<OAuthProvider, string>;

const fallbackControlPlaneOrigin = "https://<控制台域名>";

export const resolveCurrentControlPlaneOrigin = () => {
  if (typeof window === "undefined") {
    return fallbackControlPlaneOrigin;
  }

  return window.location.origin;
};

export const buildOAuthCallbackUrl = (
  provider: OAuthProvider,
  origin = resolveCurrentControlPlaneOrigin(),
) => `${origin}${providerCallbackPath[provider]}`;
