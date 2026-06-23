export const appRoutes = {
  login: "/login",
  loginApiKey: "/login/api-key",
  register: "/register",
  apiKeys: "/api-keys",
  apiKeysDocs: "/api-keys/docs",
  domains: "/domains",
  mailboxDetail: (mailboxId: string) => `/mailboxes/${mailboxId}`,
  mailboxes: "/mailboxes",
  messageDetail: (messageId: string) => `/messages/${messageId}`,
  users: "/users",
  workspace: "/workspace",
} as const;

export const latestApiKeySecretQueryKey = ["latest-api-key-secret"] as const;
