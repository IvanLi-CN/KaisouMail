export const appRoutes = {
  apiKeys: "/api-keys",
  apiKeysDocs: "/api-keys/docs",
  domains: "/domains",
} as const;

export const latestApiKeySecretQueryKey = ["latest-api-key-secret"] as const;
