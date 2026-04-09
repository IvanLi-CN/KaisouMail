import {
  apiErrorSchema,
  apiMetaResponseSchema,
  bindDomainRequestSchema,
  createApiKeyResponseSchema,
  createDomainRequestSchema,
  createUserResponseSchema,
  domainSchema,
  listApiKeysResponseSchema,
  listDomainCatalogResponseSchema,
  listDomainsResponseSchema,
  listMailboxesResponseSchema,
  listMessagesResponseSchema,
  listPasskeysResponseSchema,
  listUsersResponseSchema,
  type mailboxListScopes,
  mailboxSchema,
  messageDetailResponseSchema,
  passkeySchema,
  sessionResponseSchema,
  versionResponseSchema,
} from "@kaisoumail/shared";
import type {
  AuthenticationResponseJSON,
  PublicKeyCredentialCreationOptionsJSON,
  PublicKeyCredentialRequestOptionsJSON,
  RegistrationResponseJSON,
} from "@simplewebauthn/browser";

import { demoApi } from "@/lib/demo-store";

const SAME_ORIGIN_API_BASE = "";

const trimTrailingSlash = (value: string) => value.replace(/\/+$/, "");

const normalizeOrigin = (value: string | null | undefined) => {
  const trimmedValue = value?.trim();
  if (!trimmedValue) {
    return null;
  }

  try {
    return new URL(trimmedValue).origin;
  } catch {
    return null;
  }
};

export const resolveApiBase = ({
  configuredBaseUrl = import.meta.env.VITE_API_BASE_URL,
  currentLocation = typeof window !== "undefined" ? window.location : undefined,
  preferSameOrigin = currentLocation !== undefined,
}: {
  configuredBaseUrl?: string;
  currentLocation?: Pick<Location, "hostname">;
  preferSameOrigin?: boolean;
} = {}) => {
  if (preferSameOrigin && currentLocation) {
    return SAME_ORIGIN_API_BASE;
  }

  const configuredBase = configuredBaseUrl?.trim();
  return configuredBase ? trimTrailingSlash(configuredBase) : "";
};

export const resolveApiOrigin = ({
  configuredBaseUrl = import.meta.env.VITE_API_BASE_URL,
  currentLocation = typeof window !== "undefined" ? window.location : undefined,
}: {
  configuredBaseUrl?: string;
  currentLocation?: Pick<Location, "hostname" | "origin">;
} = {}) => {
  const apiBase = resolveApiBase({ configuredBaseUrl, currentLocation });
  if (!apiBase) {
    return normalizeOrigin(currentLocation?.origin);
  }

  try {
    return new URL(apiBase, currentLocation?.origin).origin;
  } catch {
    return null;
  }
};

const API_BASE = resolveApiBase();
const DEMO_MODE = import.meta.env.VITE_DEMO_MODE === "true";
type MailboxListScope = (typeof mailboxListScopes)[number];

export class ApiClientError extends Error {
  constructor(
    message: string,
    public readonly details: unknown = null,
    public readonly status: number | null = null,
  ) {
    super(message);
  }
}

const appendScopeParam = (
  params: URLSearchParams,
  scope?: MailboxListScope,
) => {
  if (scope && scope !== "default") {
    params.set("scope", scope);
  }
};

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
        response.status,
      );
    }
    throw new ApiClientError("Request failed", null, response.status);
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
  async createPasskeyAuthenticationOptions() {
    return requestJson(
      "/api/auth/passkey/options",
      { method: "POST" },
      (value) => value as PublicKeyCredentialRequestOptionsJSON,
    );
  },
  async verifyPasskeyAuthentication(response: AuthenticationResponseJSON) {
    return requestJson(
      "/api/auth/passkey/verify",
      { method: "POST", body: JSON.stringify({ response }) },
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
  async listMailboxes(options?: { scope?: MailboxListScope }) {
    if (DEMO_MODE) return demoApi.listMailboxes(options);
    const params = new URLSearchParams();
    appendScopeParam(params, options?.scope);
    const payload = await requestJson(
      `/api/mailboxes${params.size > 0 ? `?${params.toString()}` : ""}`,
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
    options?: { mailboxIds?: string[]; scope?: MailboxListScope },
  ) {
    if (DEMO_MODE) return demoApi.listMessages(mailboxes, filters, options);
    const params = new URLSearchParams();
    for (const mailbox of mailboxes) params.append("mailbox", mailbox);
    for (const mailboxId of options?.mailboxIds ?? []) {
      params.append("mailboxId", mailboxId);
    }
    if (filters?.after) params.set("after", filters.after);
    if (filters?.since) params.set("since", filters.since);
    appendScopeParam(params, options?.scope);
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
  async listPasskeys() {
    if (DEMO_MODE) return demoApi.listPasskeys();
    const payload = await requestJson(
      "/api/passkeys",
      { method: "GET" },
      (value) => listPasskeysResponseSchema.parse(value),
    );
    return payload.passkeys;
  },
  async createPasskeyRegistrationOptions(name: string) {
    return requestJson(
      "/api/passkeys/registration/options",
      { method: "POST", body: JSON.stringify({ name }) },
      (value) => value as PublicKeyCredentialCreationOptionsJSON,
    );
  },
  async verifyPasskeyRegistration(response: RegistrationResponseJSON) {
    return requestJson(
      "/api/passkeys/registration/verify",
      { method: "POST", body: JSON.stringify({ response }) },
      (value) => passkeySchema.parse(value),
    );
  },
  async revokePasskey(id: string) {
    if (DEMO_MODE) return demoApi.revokePasskey(id);
    const response = await fetch(`${API_BASE}/api/passkeys/${id}`, {
      method: "DELETE",
      credentials: "include",
    });
    if (!response.ok && response.status !== 204) {
      throw new Error("Passkey revoke failed");
    }
  },
  async loginWithPasskeyDemo() {
    return demoApi.loginWithPasskey();
  },
  async registerPasskeyDemo(name: string) {
    return demoApi.registerPasskey(name);
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
  async bindDomain(input: { rootDomain: string }) {
    const payload = bindDomainRequestSchema.parse(input);
    if (DEMO_MODE) return demoApi.bindDomain(payload);
    return requestJson(
      "/api/domains/bind",
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
  async deleteDomain(id: string) {
    if (DEMO_MODE) return demoApi.deleteDomain(id);
    const response = await fetch(`${API_BASE}/api/domains/${id}/delete`, {
      method: "POST",
      credentials: "include",
    });
    if (response.status === 204) return;
    const payload = await response.json();
    const parsedError = apiErrorSchema.safeParse(payload);
    if (parsedError.success) {
      throw new ApiClientError(
        parsedError.data.error,
        parsedError.data.details ?? null,
      );
    }
    throw new ApiClientError("Failed to delete domain");
  },
};
