import type {
  ApiKeyRecord,
  ApiMeta,
  CreateApiKeyResult,
  CreateUserResult,
  DomainRecord,
  Mailbox,
  MessageDetail,
  MessageSummary,
  SessionResponse,
  UserRecord,
  VersionInfo,
} from "@/lib/contracts";
import {
  demoApiKeys,
  demoDomains,
  demoMailboxes,
  demoMessageDetails,
  demoMessages,
  demoMeta,
  demoSessionUser,
  demoUsers,
  demoVersion,
} from "@/mocks/data";

const clone = <T>(value: T): T => structuredClone(value);
const randomId = (prefix: string) =>
  `${prefix}_${Math.random().toString(36).slice(2, 10)}`;
const normalizeAddress = (value: string) => value.trim().toLowerCase();
const buildAddress = (
  localPart: string,
  subdomain: string,
  rootDomain: string,
) => `${localPart}@${subdomain}.${rootDomain}`;

const pickRandomRootDomain = (domains: string[]) => {
  if (domains.length === 0) return null;
  const index = Math.floor(Math.random() * domains.length);
  return domains[index] ?? domains[0] ?? null;
};

interface DemoState {
  session: SessionResponse | null;
  apiKeys: ApiKeyRecord[];
  users: UserRecord[];
  domains: DomainRecord[];
  mailboxes: Mailbox[];
  messages: MessageSummary[];
  messageDetails: Record<string, MessageDetail>;
  meta: ApiMeta;
  version: VersionInfo;
}

const createState = (): DemoState => ({
  session: null,
  apiKeys: clone(demoApiKeys),
  users: clone(demoUsers),
  domains: clone(demoDomains),
  mailboxes: clone(demoMailboxes),
  messages: clone(demoMessages),
  messageDetails: clone(demoMessageDetails),
  meta: clone(demoMeta),
  version: clone(demoVersion),
});

let state = createState();

export const demoApi = {
  reset() {
    state = createState();
  },
  async getSession() {
    return clone(state.session);
  },
  async login(apiKey: string) {
    if (apiKey.trim().length < 8) throw new Error("Invalid API key");
    state.session = {
      user: clone(demoSessionUser),
      authenticatedAt: new Date().toISOString(),
    };
    return clone(state.session);
  },
  async logout() {
    state.session = null;
  },
  async getVersion() {
    return clone(state.version);
  },
  async getMeta() {
    return clone(state.meta);
  },
  async listMailboxes() {
    return clone(
      [...state.mailboxes].sort((a, b) =>
        b.createdAt.localeCompare(a.createdAt),
      ),
    );
  },
  async getMailbox(id: string) {
    return clone(state.mailboxes.find((mailbox) => mailbox.id === id) ?? null);
  },
  async createMailbox(input: {
    localPart?: string;
    subdomain?: string;
    rootDomain?: string;
    expiresInMinutes: number;
  }) {
    const rootDomain = (
      input.rootDomain?.trim().toLowerCase() ??
      pickRandomRootDomain(state.meta.domains)
    )?.toLowerCase();
    if (!rootDomain) {
      throw new Error("No mailbox domains are enabled");
    }
    if (!state.meta.domains.includes(rootDomain)) {
      throw new Error("Mailbox domain is not enabled");
    }
    const localPart =
      input.localPart?.trim() ||
      `mail-${Math.random().toString(36).slice(2, 8)}`;
    const subdomain =
      input.subdomain?.trim() ||
      `box-${Math.random().toString(36).slice(2, 8)}`;
    const address = buildAddress(localPart, subdomain, rootDomain);
    if (
      state.mailboxes.some(
        (mailbox) =>
          mailbox.address === address && mailbox.status !== "destroyed",
      )
    ) {
      throw new Error("Mailbox already exists");
    }
    const createdAt = new Date().toISOString();
    const mailbox: Mailbox = {
      id: randomId("mbx"),
      userId: demoSessionUser.id,
      localPart,
      subdomain,
      rootDomain,
      address,
      status: "active",
      createdAt,
      lastReceivedAt: null,
      expiresAt: new Date(
        Date.now() + input.expiresInMinutes * 60_000,
      ).toISOString(),
      destroyedAt: null,
      routingRuleId: randomId("rule"),
    };
    state.mailboxes.unshift(mailbox);
    return clone(mailbox);
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
    const address =
      "address" in input
        ? normalizeAddress(input.address)
        : buildAddress(
            input.localPart.trim(),
            input.subdomain.trim(),
            (
              input.rootDomain?.trim().toLowerCase() ??
              pickRandomRootDomain(state.meta.domains)
            )?.toLowerCase() ?? "",
          );
    const existing = state.mailboxes.find(
      (mailbox) => mailbox.address === address && mailbox.status === "active",
    );
    if (existing) return clone(existing);

    if (
      state.mailboxes.some(
        (mailbox) =>
          mailbox.address === address && mailbox.status !== "destroyed",
      )
    ) {
      throw new Error("Mailbox already exists");
    }

    const [localPart, domain] = address.split("@");
    const rootDomain =
      state.meta.domains.find((entry) => domain.endsWith(`.${entry}`)) ?? null;
    if (!rootDomain) {
      throw new Error("Mailbox domain is not enabled");
    }
    const subdomain = domain.slice(0, -(rootDomain.length + 1));
    return this.createMailbox({
      localPart,
      subdomain,
      rootDomain,
      expiresInMinutes:
        input.expiresInMinutes ?? state.meta.defaultMailboxTtlMinutes,
    });
  },
  async resolveMailbox(address: string) {
    const mailbox = state.mailboxes.find(
      (entry) =>
        entry.address === normalizeAddress(address) &&
        entry.status === "active",
    );
    if (!mailbox) throw new Error("Mailbox not found");
    return clone(mailbox);
  },
  async destroyMailbox(id: string) {
    const mailbox = state.mailboxes.find((entry) => entry.id === id);
    if (!mailbox) throw new Error("Mailbox not found");
    mailbox.status = "destroyed";
    mailbox.destroyedAt = new Date().toISOString();
    mailbox.routingRuleId = null;
    state.messages = state.messages.filter(
      (message) => message.mailboxId !== id,
    );
    for (const [messageId, detail] of Object.entries(state.messageDetails)) {
      if (detail.mailboxId === id) delete state.messageDetails[messageId];
    }
    return clone(mailbox);
  },
  async listMessages(
    mailboxAddresses: string[],
    input?: { after?: string; since?: string },
  ) {
    const receivedAfter = [input?.after, input?.since]
      .map((value) => {
        if (!value) return null;
        const parsed = new Date(value);
        return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
      })
      .filter((value): value is string => Boolean(value))
      .sort((left, right) => left.localeCompare(right))
      .at(-1);
    const messages =
      mailboxAddresses.length > 0
        ? state.messages.filter((message) =>
            mailboxAddresses.includes(message.mailboxAddress),
          )
        : state.messages;
    return clone(
      messages
        .filter((message) =>
          receivedAfter ? message.receivedAt > receivedAfter : true,
        )
        .sort((a, b) => b.receivedAt.localeCompare(a.receivedAt)),
    );
  },
  async getMessage(id: string) {
    return clone(state.messageDetails[id] ?? null);
  },
  async listApiKeys() {
    return clone(state.apiKeys);
  },
  async createApiKey(input: {
    name: string;
    scopes: string[];
  }): Promise<CreateApiKeyResult> {
    const createdAt = new Date().toISOString();
    const apiKeyRecord: ApiKeyRecord = {
      id: randomId("key"),
      name: input.name,
      prefix: `cfm_${Math.random().toString(36).slice(2, 10)}`,
      scopes: input.scopes,
      createdAt,
      lastUsedAt: null,
      revokedAt: null,
    };
    state.apiKeys.unshift(apiKeyRecord);
    return {
      apiKey: `${apiKeyRecord.prefix}_secret`,
      apiKeyRecord: clone(apiKeyRecord),
    };
  },
  async revokeApiKey(id: string) {
    const apiKey = state.apiKeys.find((entry) => entry.id === id);
    if (apiKey) apiKey.revokedAt = new Date().toISOString();
  },
  async listUsers() {
    return clone(state.users);
  },
  async listDomains() {
    return clone(state.domains);
  },
  async createDomain(input: { rootDomain: string; zoneId: string }) {
    const rootDomain = input.rootDomain.trim().toLowerCase();
    const existing = state.domains.find(
      (domain) => domain.rootDomain === rootDomain,
    );
    if (existing?.status === "active") {
      throw new Error("Mailbox domain already exists");
    }

    const updatedAt = new Date().toISOString();
    const domain: DomainRecord = {
      id: existing?.id ?? randomId("dom"),
      rootDomain,
      zoneId: input.zoneId.trim(),
      status: rootDomain.includes("fail") ? "provisioning_error" : "active",
      lastProvisionError: rootDomain.includes("fail")
        ? "Zone access denied"
        : null,
      createdAt: existing?.createdAt ?? updatedAt,
      updatedAt,
      lastProvisionedAt: rootDomain.includes("fail") ? null : updatedAt,
      disabledAt: null,
    };
    if (existing) {
      Object.assign(existing, domain);
    } else {
      state.domains.unshift(domain);
    }
    state.meta.domains = state.domains
      .filter((entry) => entry.status === "active")
      .map((entry) => entry.rootDomain);
    state.meta.addressRules.examples = state.meta.domains
      .slice(0, 2)
      .flatMap((entry) => [`build@alpha.${entry}`, `spec@ops.alpha.${entry}`]);
    return clone(domain);
  },
  async disableDomain(id: string) {
    const domain = state.domains.find((entry) => entry.id === id);
    if (!domain) throw new Error("Mailbox domain not found");
    domain.status = "disabled";
    domain.disabledAt = new Date().toISOString();
    domain.updatedAt = domain.disabledAt;
    state.meta.domains = state.domains
      .filter((entry) => entry.status === "active")
      .map((entry) => entry.rootDomain);
    return clone(domain);
  },
  async retryDomain(id: string) {
    const domain = state.domains.find((entry) => entry.id === id);
    if (!domain) throw new Error("Mailbox domain not found");
    domain.status = "active";
    domain.lastProvisionError = null;
    domain.disabledAt = null;
    domain.updatedAt = new Date().toISOString();
    domain.lastProvisionedAt = domain.updatedAt;
    state.meta.domains = state.domains
      .filter((entry) => entry.status === "active")
      .map((entry) => entry.rootDomain);
    return clone(domain);
  },
  async createUser(input: {
    email: string;
    name: string;
    role: "admin" | "member";
  }): Promise<CreateUserResult> {
    const now = new Date().toISOString();
    const user: UserRecord = {
      id: randomId("usr"),
      email: input.email,
      name: input.name,
      role: input.role,
      createdAt: now,
      updatedAt: now,
    };
    state.users.unshift(user);
    const initialKey = await this.createApiKey({
      name: `${input.name} initial key`,
      scopes: ["mailboxes:write", "messages:read"],
    });
    return { user: clone(user), initialKey };
  },
};
