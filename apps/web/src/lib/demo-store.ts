import {
  buildRealisticMailboxAddressExamples,
  filterMailboxesForWorkspaceScope,
  generatedMailboxMaxAttempts,
  generateRealisticMailboxLocalPart,
  generateRealisticMailboxSubdomain,
  type mailboxListScopes,
} from "@kaisoumail/shared";

import type {
  ApiKeyRecord,
  ApiMeta,
  CreateApiKeyResult,
  CreateUserResult,
  DomainCatalogItem,
  DomainRecord,
  Mailbox,
  MessageDetail,
  MessageSummary,
  PasskeyRecord,
  SessionResponse,
  UserRecord,
  VersionInfo,
} from "@/lib/contracts";
import {
  demoApiKeys,
  demoCloudflareZones,
  demoDomains,
  demoMailboxes,
  demoMessageDetails,
  demoMessages,
  demoMeta,
  demoPasskeys,
  demoSessionUser,
  demoUsers,
  demoVersion,
} from "@/mocks/data";

const clone = <T>(value: T): T => structuredClone(value);
const randomId = (prefix: string) =>
  `${prefix}_${Math.random().toString(36).slice(2, 10)}`;
const normalizeAddress = (value: string) => value.trim().toLowerCase();
const normalizeLabel = (value: string) => value.trim().toLowerCase();
const DEMO_NOW_ISO = "2026-04-08T12:00:00.000Z";
type MailboxListScope = (typeof mailboxListScopes)[number];
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
  passkeys: PasskeyRecord[];
  users: UserRecord[];
  cloudflareZones: Array<{
    id: string;
    rootDomain: string;
    status: string | null;
    nameServers: string[];
  }>;
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
  passkeys: clone(demoPasskeys),
  users: clone(demoUsers),
  cloudflareZones: clone(demoCloudflareZones),
  domains: clone(demoDomains),
  mailboxes: clone(demoMailboxes),
  messages: clone(demoMessages),
  messageDetails: clone(demoMessageDetails),
  meta: clone(demoMeta),
  version: clone(demoVersion),
});

let state = createState();

const buildDomainCatalog = (): DomainCatalogItem[] => {
  const localDomains = new Map(
    state.domains.map((domain) => [domain.rootDomain, domain] as const),
  );
  const cloudflareZones = new Map(
    state.cloudflareZones.map((zone) => [zone.rootDomain, zone] as const),
  );
  const rootDomains = new Set([
    ...localDomains.keys(),
    ...cloudflareZones.keys(),
  ]);

  return [...rootDomains]
    .sort((left, right) => left.localeCompare(right))
    .map((rootDomain) => {
      const local = localDomains.get(rootDomain) ?? null;
      const zone = cloudflareZones.get(rootDomain) ?? null;
      return {
        id: local?.id ?? null,
        rootDomain,
        zoneId: zone?.id ?? local?.zoneId ?? null,
        bindingSource: local?.bindingSource ?? null,
        cloudflareAvailability: zone ? "available" : "missing",
        cloudflareStatus: zone?.status ?? null,
        nameServers: zone?.nameServers ?? [],
        projectStatus: local?.status ?? "not_enabled",
        lastProvisionError: local?.lastProvisionError ?? null,
        createdAt: local?.createdAt ?? null,
        updatedAt: local?.updatedAt ?? null,
        lastProvisionedAt: local?.lastProvisionedAt ?? null,
        disabledAt: local?.disabledAt ?? null,
      } satisfies DomainCatalogItem;
    });
};

const syncMetaDomains = () => {
  state.meta.domains = state.domains
    .filter((entry) => entry.status === "active")
    .map((entry) => entry.rootDomain);
  state.meta.addressRules.examples = buildRealisticMailboxAddressExamples(
    state.meta.domains,
  );
};

const findAvailableMailboxCandidate = ({
  localPart,
  subdomain,
  rootDomain,
}: {
  localPart?: string;
  subdomain?: string;
  rootDomain: string;
}) => {
  const normalizedLocalPart = localPart ? normalizeLabel(localPart) : undefined;
  const normalizedSubdomain = subdomain ? normalizeLabel(subdomain) : undefined;

  for (let attempt = 0; attempt < generatedMailboxMaxAttempts; attempt += 1) {
    const nextLocalPart =
      normalizedLocalPart ??
      generateRealisticMailboxLocalPart({
        attempt,
      });
    const nextSubdomain =
      normalizedSubdomain ??
      generateRealisticMailboxSubdomain({
        attempt,
      });
    const address = buildAddress(nextLocalPart, nextSubdomain, rootDomain);

    if (
      !state.mailboxes.some(
        (mailbox) =>
          mailbox.address === address && mailbox.status !== "destroyed",
      )
    ) {
      return {
        localPart: nextLocalPart,
        subdomain: nextSubdomain,
        address,
      };
    }
  }

  throw new Error("Mailbox already exists");
};

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
  async listMailboxes(options?: { scope?: MailboxListScope }) {
    const visibleMailboxes =
      options?.scope === "workspace"
        ? filterMailboxesForWorkspaceScope(state.mailboxes, DEMO_NOW_ISO)
        : state.mailboxes;
    return clone(
      [...visibleMailboxes].sort((a, b) =>
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
    const { localPart, subdomain, address } = findAvailableMailboxCandidate({
      localPart: input.localPart,
      subdomain: input.subdomain,
      rootDomain,
    });
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
            normalizeLabel(input.localPart),
            normalizeLabel(input.subdomain),
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
    options?: { mailboxIds?: string[]; scope?: MailboxListScope },
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
    const scopedMailboxes =
      options?.scope === "workspace"
        ? filterMailboxesForWorkspaceScope(state.mailboxes, DEMO_NOW_ISO)
        : null;
    const normalizedMailboxIds = [...new Set(options?.mailboxIds ?? [])];
    const normalizedMailboxAddresses = mailboxAddresses.map(normalizeAddress);
    const visibleMailboxIds =
      scopedMailboxes === null
        ? []
        : normalizedMailboxIds.length > 0
          ? scopedMailboxes
              .filter((mailbox) => normalizedMailboxIds.includes(mailbox.id))
              .map((mailbox) => mailbox.id)
          : normalizedMailboxAddresses.length > 0
            ? scopedMailboxes
                .filter((mailbox) =>
                  normalizedMailboxAddresses.includes(mailbox.address),
                )
                .map((mailbox) => mailbox.id)
            : scopedMailboxes.map((mailbox) => mailbox.id);
    const visibleMailboxAddresses =
      scopedMailboxes === null
        ? normalizedMailboxAddresses
        : normalizedMailboxAddresses.length > 0
          ? scopedMailboxes
              .filter((mailbox) =>
                normalizedMailboxAddresses.includes(mailbox.address),
              )
              .map((mailbox) => mailbox.address)
          : scopedMailboxes.map((mailbox) => mailbox.address);
    const messages =
      options?.scope === "workspace"
        ? visibleMailboxIds.length > 0
          ? state.messages.filter((message) =>
              visibleMailboxIds.includes(message.mailboxId),
            )
          : []
        : normalizedMailboxIds.length > 0
          ? state.messages.filter((message) =>
              normalizedMailboxIds.includes(message.mailboxId),
            )
          : visibleMailboxAddresses.length > 0
            ? state.messages.filter((message) =>
                visibleMailboxAddresses.includes(message.mailboxAddress),
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
  async listPasskeys() {
    return clone(state.passkeys);
  },
  async registerPasskey(name: string) {
    const createdAt = new Date().toISOString();
    const passkey: PasskeyRecord = {
      id: randomId("psk"),
      name,
      credentialId: `demo_${Math.random().toString(36).slice(2, 14)}`,
      deviceType: "multiDevice",
      backedUp: true,
      transports: ["internal", "hybrid"],
      createdAt,
      lastUsedAt: null,
      revokedAt: null,
    };
    state.passkeys.unshift(passkey);
    return clone(passkey);
  },
  async revokePasskey(id: string) {
    const passkey = state.passkeys.find((entry) => entry.id === id);
    if (passkey) passkey.revokedAt = new Date().toISOString();
  },
  async loginWithPasskey() {
    const activePasskey = state.passkeys.find((entry) => !entry.revokedAt);
    if (!activePasskey) {
      throw new Error("No passkeys are registered");
    }
    activePasskey.lastUsedAt = new Date().toISOString();
    state.session = {
      user: clone(demoSessionUser),
      authenticatedAt: activePasskey.lastUsedAt,
    };
    return clone(state.session);
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
  async listDomainCatalog() {
    return clone(buildDomainCatalog());
  },
  async createDomain(input: { rootDomain: string; zoneId: string }) {
    const rootDomain = input.rootDomain.trim().toLowerCase();
    const zoneId = input.zoneId.trim();
    const catalogMatch = state.cloudflareZones.find(
      (zone) => zone.rootDomain === rootDomain && zone.id === zoneId,
    );
    if (!catalogMatch) {
      throw new Error("Mailbox domain is not available in Cloudflare");
    }
    catalogMatch.status = "active";
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
      zoneId,
      bindingSource: existing?.bindingSource ?? "catalog",
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
    syncMetaDomains();
    return clone(domain);
  },
  async bindDomain(input: { rootDomain: string }) {
    const rootDomain = input.rootDomain.trim().toLowerCase();
    const existing = state.domains.find(
      (domain) => domain.rootDomain === rootDomain,
    );
    if (existing?.status === "active") {
      throw new Error("Mailbox domain already exists");
    }

    const createdAt = new Date().toISOString();
    const zoneId = `zone_${rootDomain.replace(/[^a-z0-9]/g, "").slice(0, 12)}`;
    const existingZone = state.cloudflareZones.find(
      (zone) => zone.rootDomain === rootDomain,
    );

    if (!existingZone) {
      state.cloudflareZones.unshift({
        id: zoneId,
        rootDomain,
        status: "pending",
        nameServers: ["amy.ns.cloudflare.com", "kai.ns.cloudflare.com"],
      });
    }

    const domain: DomainRecord = {
      id: existing?.id ?? randomId("dom"),
      rootDomain,
      zoneId: existingZone?.id ?? zoneId,
      bindingSource: "project_bind",
      status: "provisioning_error",
      lastProvisionError:
        "Zone is pending activation in Cloudflare; retry after nameservers are delegated",
      createdAt: existing?.createdAt ?? createdAt,
      updatedAt: createdAt,
      lastProvisionedAt: null,
      disabledAt: null,
    };
    if (existing) {
      Object.assign(existing, domain);
    } else {
      state.domains.unshift(domain);
    }
    syncMetaDomains();
    return clone(domain);
  },
  async disableDomain(id: string) {
    const domain = state.domains.find((entry) => entry.id === id);
    if (!domain) throw new Error("Mailbox domain not found");
    domain.status = "disabled";
    domain.disabledAt = new Date().toISOString();
    domain.updatedAt = domain.disabledAt;
    syncMetaDomains();
    return clone(domain);
  },
  async deleteDomain(id: string) {
    const domain = state.domains.find((entry) => entry.id === id);
    if (!domain) throw new Error("Mailbox domain not found");
    if (domain.bindingSource !== "project_bind") {
      throw new Error("Only project-bound domains can be deleted");
    }
    if (
      state.mailboxes.some(
        (mailbox) =>
          mailbox.rootDomain === domain.rootDomain &&
          mailbox.status !== "destroyed",
      )
    ) {
      throw new Error("Mailbox domain still has non-destroyed mailboxes");
    }

    state.domains = state.domains.filter((entry) => entry.id !== id);
    state.cloudflareZones = state.cloudflareZones.filter(
      (zone) => zone.rootDomain !== domain.rootDomain,
    );
    syncMetaDomains();
  },
  async retryDomain(id: string) {
    const domain = state.domains.find((entry) => entry.id === id);
    if (!domain) throw new Error("Mailbox domain not found");
    const zone = state.cloudflareZones.find(
      (entry) => entry.rootDomain === domain.rootDomain,
    );
    if (zone) {
      zone.status = "active";
    }
    domain.status = "active";
    domain.lastProvisionError = null;
    domain.disabledAt = null;
    domain.updatedAt = new Date().toISOString();
    domain.lastProvisionedAt = domain.updatedAt;
    syncMetaDomains();
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
