import {
  apiErrorSchema,
  apiMetaResponseSchema,
  createApiKeyResponseSchema,
  createDomainRequestSchema,
  createUserResponseSchema,
  domainSchema,
  listApiKeysResponseSchema,
  listDomainCatalogResponseSchema,
  listDomainsResponseSchema,
  listMailboxesResponseSchema,
  listMessagesResponseSchema,
  listUsersResponseSchema,
  mailboxSchema,
  messageDetailResponseSchema,
  sessionResponseSchema,
  versionResponseSchema,
} from "@cf-mail/shared";

import { demoApi } from "@/lib/demo-store";

const API_BASE = import.meta.env.VITE_API_BASE_URL ?? "";
const DEMO_MODE = import.meta.env.VITE_DEMO_MODE === "true";

export class ApiClientError extends Error {
  constructor(
    message: string,
    public readonly details: unknown = null,
  ) {
    super(message);
  }
}

const requestJson = async <T>(
  path: string,
  init: RequestInit,
  parser: (value: unknown) => T,
) => {
  const headers = new Headers(init.headers ?? undefined);
  if (init.body && !headers.has("content-type")) {
    headers.set("content-type", "application/json");
  }

  const response = await fetch(`${API_BASE}${path}`, {
    credentials: "include",
    ...init,
    headers,
  });
  if (response.status === 204) return parser({});
  const payload = await response.json();
  if (!response.ok) {
    const parsedError = apiErrorSchema.safeParse(payload);
    if (parsedError.success) {
      throw new ApiClientError(
        parsedError.data.error,
        parsedError.data.details ?? null,
      );
    }
    throw new ApiClientError("Request failed");
  }
  return parser(payload);
};

export const apiClient = {
  async getSession() {
    if (DEMO_MODE) return demoApi.getSession();
    return requestJson("/api/auth/session", { method: "GET" }, (value) =>
      sessionResponseSchema.parse(value),
    );
  },
  async login(apiKey: string) {
    if (DEMO_MODE) return demoApi.login(apiKey);
    return requestJson(
      "/api/auth/session",
      { method: "POST", body: JSON.stringify({ apiKey }) },
      (value) => sessionResponseSchema.parse(value),
    );
  },
  async logout() {
    if (DEMO_MODE) return demoApi.logout();
    const response = await fetch(`${API_BASE}/api/auth/session`, {
      method: "DELETE",
      credentials: "include",
    });
    if (!response.ok && response.status !== 204)
      throw new Error("Logout failed");
  },
  async getVersion() {
    if (DEMO_MODE) return demoApi.getVersion();
    return requestJson("/api/version", { method: "GET" }, (value) =>
      versionResponseSchema.parse(value),
    );
  },
  async getMeta() {
    if (DEMO_MODE) return demoApi.getMeta();
    return requestJson("/api/meta", { method: "GET" }, (value) =>
      apiMetaResponseSchema.parse(value),
    );
  },
  async listMailboxes() {
    if (DEMO_MODE) return demoApi.listMailboxes();
    const payload = await requestJson(
      "/api/mailboxes",
      { method: "GET" },
      (value) => listMailboxesResponseSchema.parse(value),
    );
    return payload.mailboxes;
  },
  async getMailbox(id: string) {
    if (DEMO_MODE) return demoApi.getMailbox(id);
    return requestJson(`/api/mailboxes/${id}`, { method: "GET" }, (value) =>
      mailboxSchema.parse(value),
    );
  },
  async createMailbox(input: {
    localPart?: string;
    subdomain?: string;
    rootDomain?: string;
    expiresInMinutes: number;
  }) {
    if (DEMO_MODE) return demoApi.createMailbox(input);
    return requestJson(
      "/api/mailboxes",
      { method: "POST", body: JSON.stringify(input) },
      (value) => mailboxSchema.parse(value),
    );
  },
  async ensureMailbox(
    input:
      | { address: string; expiresInMinutes?: number }
      | {
          localPart: string;
          subdomain: string;
          rootDomain?: string;
          expiresInMinutes?: number;
        },
  ) {
    if (DEMO_MODE) return demoApi.ensureMailbox(input);
    return requestJson(
      "/api/mailboxes/ensure",
      { method: "POST", body: JSON.stringify(input) },
      (value) => mailboxSchema.parse(value),
    );
  },
  async resolveMailbox(address: string) {
    if (DEMO_MODE) return demoApi.resolveMailbox(address);
    const params = new URLSearchParams({ address });
    return requestJson(
      `/api/mailboxes/resolve?${params.toString()}`,
      { method: "GET" },
      (value) => mailboxSchema.parse(value),
    );
  },
  async destroyMailbox(id: string) {
    if (DEMO_MODE) return demoApi.destroyMailbox(id);
    return requestJson(`/api/mailboxes/${id}`, { method: "DELETE" }, (value) =>
      mailboxSchema.parse(value),
    );
  },
  async listMessages(
    mailboxes: string[] = [],
    filters?: { after?: string; since?: string },
  ) {
    if (DEMO_MODE) return demoApi.listMessages(mailboxes, filters);
    const params = new URLSearchParams();
    for (const mailbox of mailboxes) params.append("mailbox", mailbox);
    if (filters?.after) params.set("after", filters.after);
    if (filters?.since) params.set("since", filters.since);
    const payload = await requestJson(
      `/api/messages${params.size > 0 ? `?${params.toString()}` : ""}`,
      { method: "GET" },
      (value) => listMessagesResponseSchema.parse(value),
    );
    return payload.messages;
  },
  async getMessage(id: string) {
    if (DEMO_MODE) return demoApi.getMessage(id);
    const payload = await requestJson(
      `/api/messages/${id}`,
      { method: "GET" },
      (value) => messageDetailResponseSchema.parse(value),
    );
    return payload.message;
  },
  getRawMessageUrl(id: string) {
    return `${API_BASE}/api/messages/${id}/raw`;
  },
  async listApiKeys() {
    if (DEMO_MODE) return demoApi.listApiKeys();
    const payload = await requestJson(
      "/api/api-keys",
      { method: "GET" },
      (value) => listApiKeysResponseSchema.parse(value),
    );
    return payload.apiKeys;
  },
  async createApiKey(input: { name: string; scopes: string[] }) {
    if (DEMO_MODE) return demoApi.createApiKey(input);
    return requestJson(
      "/api/api-keys",
      { method: "POST", body: JSON.stringify(input) },
      (value) => createApiKeyResponseSchema.parse(value),
    );
  },
  async revokeApiKey(id: string) {
    if (DEMO_MODE) return demoApi.revokeApiKey(id);
    const response = await fetch(`${API_BASE}/api/api-keys/${id}/revoke`, {
      method: "POST",
      credentials: "include",
    });
    if (!response.ok && response.status !== 204)
      throw new Error("Failed to revoke API key");
  },
  async listUsers() {
    if (DEMO_MODE) return demoApi.listUsers();
    const payload = await requestJson(
      "/api/users",
      { method: "GET" },
      (value) => listUsersResponseSchema.parse(value),
    );
    return payload.users;
  },
  async createUser(input: {
    email: string;
    name: string;
    role: "admin" | "member";
  }) {
    if (DEMO_MODE) return demoApi.createUser(input);
    return requestJson(
      "/api/users",
      { method: "POST", body: JSON.stringify(input) },
      (value) => createUserResponseSchema.parse(value),
    );
  },
  async listDomains() {
    if (DEMO_MODE) return demoApi.listDomains();
    const payload = await requestJson(
      "/api/domains",
      { method: "GET" },
      (value) => listDomainsResponseSchema.parse(value),
    );
    return payload.domains;
  },
  async listDomainCatalog() {
    if (DEMO_MODE) return demoApi.listDomainCatalog();
    const payload = await requestJson(
      "/api/domains/catalog",
      { method: "GET" },
      (value) => listDomainCatalogResponseSchema.parse(value),
    );
    return payload.domains;
  },
  async createDomain(input: { rootDomain: string; zoneId: string }) {
    const payload = createDomainRequestSchema.parse(input);
    if (DEMO_MODE) return demoApi.createDomain(payload);
    return requestJson(
      "/api/domains",
      { method: "POST", body: JSON.stringify(payload) },
      (value) => domainSchema.parse(value),
    );
  },
  async disableDomain(id: string) {
    if (DEMO_MODE) return demoApi.disableDomain(id);
    return requestJson(
      `/api/domains/${id}/disable`,
      { method: "POST" },
      (value) => domainSchema.parse(value),
    );
  },
  async retryDomain(id: string) {
    if (DEMO_MODE) return demoApi.retryDomain(id);
    return requestJson(
      `/api/domains/${id}/retry`,
      { method: "POST" },
      (value) => domainSchema.parse(value),
    );
  },
};
