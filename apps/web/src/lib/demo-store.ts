import {
  buildRealisticMailboxAddressExamples,
  filterMailboxesForWorkspaceScope,
  generatedMailboxMaxAttempts,
  generateRealisticMailboxLocalPart,
  generateRealisticMailboxSubdomain,
  type mailboxListScopes,
  type mailboxStatuses,
  recommendApexMailboxBinding,
} from "@kaisoumail/shared";
import type { PublicKeyCredentialCreationOptionsJSON } from "@simplewebauthn/browser";
import type {
  AdminUserRecord,
  ApiKeyRecord,
  ApiMeta,
  CreateApiKeyResult,
  DomainCatalogItem,
  DomainRecord,
  ExternalAccountRecord,
  InviteRecord,
  Mailbox,
  MessageDetail,
  MessageSummary,
  PaginationMeta,
  PasskeyRecord,
  RegistrationSettings,
  SessionResponse,
  UserRecord,
  VersionInfo,
} from "@/lib/contracts";
import {
  demoAdminUsers,
  demoApiKeys,
  demoCloudflareZones,
  demoDomains,
  demoExternalAccounts,
  demoInvites,
  demoMailboxes,
  demoMessageDetails,
  demoMessages,
  demoMeta,
  demoPasskeys,
  demoRegistrationSettings,
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
type MailboxStatus = (typeof mailboxStatuses)[number];
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
  externalAccounts: ExternalAccountRecord[];
  apiKeys: ApiKeyRecord[];
  passkeys: PasskeyRecord[];
  users: UserRecord[];
  adminUsers: AdminUserRecord[];
  invites: InviteRecord[];
  registrationSettings: RegistrationSettings;
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
  externalAccounts: clone(demoExternalAccounts),
  apiKeys: clone(demoApiKeys),
  passkeys: clone(demoPasskeys),
  users: clone(demoUsers),
  adminUsers: clone(demoAdminUsers),
  invites: clone(demoInvites),
  registrationSettings: clone(demoRegistrationSettings),
  cloudflareZones: clone(demoCloudflareZones),
  domains: clone(demoDomains),
  mailboxes: clone(demoMailboxes),
  messages: clone(demoMessages),
  messageDetails: clone(demoMessageDetails),
  meta: clone(demoMeta),
  version: clone(demoVersion),
});

let state = createState();

const paginate = <T>(
  items: T[],
  input: {
    page: number;
    pageSize: number;
  },
) => {
  const pageSize = Math.max(1, input.pageSize);
  const totalItems = items.length;
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
  const page = Math.min(Math.max(input.page, 1), totalPages);
  const offset = (page - 1) * pageSize;
  return {
    items: items.slice(offset, offset + pageSize),
    pagination: {
      page,
      pageSize,
      totalItems,
      totalPages,
    } satisfies PaginationMeta,
  };
};

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
        mailDomain: local?.mailDomain ?? zone?.rootDomain ?? rootDomain,
        rootDomain,
        zoneId: zone?.id ?? local?.zoneId ?? null,
        bindingSource: local?.bindingSource ?? null,
        cloudflareAvailability: zone ? "available" : "missing",
        cloudflareStatus: zone?.status ?? null,
        nameServers: zone?.nameServers ?? [],
        projectStatus: local?.status ?? "not_enabled",
        catchAllEnabled: local?.catchAllEnabled ?? false,
        lastProvisionError: local?.lastProvisionError ?? null,
        createdAt: local?.createdAt ?? null,
        updatedAt: local?.updatedAt ?? null,
        lastProvisionedAt: local?.lastProvisionedAt ?? null,
        disabledAt: local?.disabledAt ?? null,
      } satisfies DomainCatalogItem;
    });
};

const buildDemoAuthProviders = () => {
  const githubConfigured = Boolean(
    state.registrationSettings.githubClientId.trim() &&
      state.registrationSettings.githubClientSecret.trim(),
  );
  const linuxdoConfigured = Boolean(
    state.registrationSettings.linuxdoClientId.trim() &&
      state.registrationSettings.linuxdoClientSecret.trim() &&
      state.registrationSettings.linuxdoOauthBaseUrl.trim(),
  );

  return [
    {
      provider: "github" as const,
      configured: githubConfigured,
      loginEnabled: githubConfigured,
      registrationMode: state.registrationSettings.githubMode,
      dailyLimit: state.registrationSettings.githubDailyLimit,
      dailyUsed: 2,
      dailyRemaining: Math.max(
        state.registrationSettings.githubDailyLimit - 2,
        0,
      ),
    },
    {
      provider: "linuxdo" as const,
      configured: linuxdoConfigured,
      loginEnabled: linuxdoConfigured,
      registrationMode: state.registrationSettings.linuxdoMode,
      dailyLimit: state.registrationSettings.linuxdoDailyLimit,
      dailyUsed: 0,
      dailyRemaining: state.registrationSettings.linuxdoDailyLimit,
    },
    {
      provider: "passkey" as const,
      configured: true,
      loginEnabled: true,
      registrationMode: state.registrationSettings.passkeyMode,
      dailyLimit: null,
      dailyUsed: 0,
      dailyRemaining: null,
    },
  ];
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
  async createAdminTransferIntent(userId: string) {
    return {
      intentToken: `demo-transfer-intent:${userId}`,
    };
  },
  async verifyAdminTransferApiKey(
    userId: string,
    input: {
      intentToken: string;
      apiKey: string;
    },
  ) {
    if (!input.intentToken.endsWith(userId)) {
      throw new Error("Admin transfer target mismatch");
    }
    if (input.apiKey.trim().length < 8) {
      throw new Error("Invalid API key");
    }
    return {
      verificationToken: `demo-transfer-verification:${userId}:api-key`,
      method: "api-key" as const,
    };
  },
  async verifyAdminTransferPasskey(
    userId: string,
    input: {
      intentToken: string;
      response: { id: string };
    },
  ) {
    if (!input.intentToken.endsWith(userId) || !input.response.id) {
      throw new Error("Admin transfer verification failed");
    }
    state.session = {
      user: clone(demoSessionUser),
      authenticatedAt: new Date().toISOString(),
    };
    return {
      verificationToken: `demo-transfer-verification:${userId}:passkey`,
      method: "passkey" as const,
    };
  },
  async createAdminTransferPasskeyOptions(userId: string, intentToken: string) {
    if (!intentToken.endsWith(userId)) {
      throw new Error("Admin transfer verification failed");
    }
    return {
      challenge: `demo-admin-transfer-passkey:${userId}`,
      rpId: "localhost",
      timeout: 60000,
      userVerification: "required",
    };
  },
  async logout() {
    state.session = null;
  },
  async getAccount() {
    return clone({
      user:
        state.users.find((user) => user.id === demoSessionUser.id) ??
        demoUsers[0],
    });
  },
  async updateAccount(input: { nickname: string }) {
    const user = state.users.find((entry) => entry.id === demoSessionUser.id);
    if (!user) throw new Error("User not found");
    user.nickname = input.nickname;
    user.updatedAt = new Date().toISOString();
    const adminUser = state.adminUsers.find((entry) => entry.id === user.id);
    if (adminUser) {
      adminUser.nickname = user.nickname;
      adminUser.updatedAt = user.updatedAt;
    }
    return clone({ user });
  },
  async deleteAccount() {
    state.session = null;
    const deletedAt = new Date().toISOString();
    const user = state.users.find((entry) => entry.id === demoSessionUser.id);
    if (user) {
      user.deletedAt = deletedAt;
      user.nickname = `${user.nickname} (deleted)`;
      user.updatedAt = deletedAt;
    }
    state.externalAccounts = state.externalAccounts.filter(
      (entry) => entry.providerUserId !== "10001",
    );
    state.passkeys = state.passkeys.map((entry) =>
      entry.revokedAt ? entry : { ...entry, revokedAt: deletedAt },
    );
    state.apiKeys = state.apiKeys.map((entry) =>
      entry.revokedAt ? entry : { ...entry, revokedAt: deletedAt },
    );
  },
  async listExternalAccounts() {
    return clone(
      state.externalAccounts.filter((entry) =>
        state.session?.user.id
          ? entry.id === "ext_github_owner" &&
            state.session.user.id === demoSessionUser.id
          : false,
      ),
    );
  },
  async unlinkExternalAccount(id: string) {
    state.externalAccounts = state.externalAccounts.filter(
      (entry) => entry.id !== id,
    );
  },
  async listAuthProviders() {
    return clone(buildDemoAuthProviders());
  },
  getProviderStartUrl(
    provider: "github" | "linuxdo",
    options?: {
      intent?: "login" | "register" | "bind" | "admin-transfer";
      inviteCode?: string;
      intentToken?: string;
    },
  ) {
    const params = new URLSearchParams();
    if (options?.intent) params.set("intent", options.intent);
    if (options?.inviteCode) params.set("inviteCode", options.inviteCode);
    if (options?.intentToken) params.set("intentToken", options.intentToken);
    return `/api/auth/${provider}/start?${params.toString()}`;
  },
  async startProviderRegistration(
    provider: "github" | "linuxdo",
    options?: { inviteCode?: string; returnTo?: string },
  ) {
    return {
      startUrl: this.getProviderStartUrl(provider, {
        intent: "register",
        inviteCode: options?.inviteCode,
      }),
    };
  },
  async startPasskeyRegistration(input?: { inviteCode?: string }) {
    return {
      registration: {
        token: "demo-passkey-pending",
        method: "passkey",
        sourceIntent: "register",
        redirectTo: "/workspace",
        inviteRequired: true,
        invitePrevalidated: Boolean(input?.inviteCode?.trim()),
        canComplete: true,
        suggestedNickname: null,
        error: null,
      },
    };
  },
  async getPendingRegistration(token: string) {
    if (token === "demo-passkey-pending") {
      return {
        registration: {
          token,
          method: "passkey",
          sourceIntent: "register",
          redirectTo: "/workspace",
          inviteRequired: true,
          invitePrevalidated: false,
          canComplete: true,
          suggestedNickname: null,
          error: null,
        },
      };
    }
    return {
      registration: {
        token,
        method: "github",
        sourceIntent: "register",
        redirectTo: "/workspace",
        inviteRequired: false,
        invitePrevalidated: false,
        canComplete: true,
        suggestedNickname: "Ivan Owner",
        error: null,
      },
    };
  },
  async completeExternalRegistration(input: {
    token: string;
    nickname: string;
    inviteCode?: string;
  }) {
    state.session = {
      user: {
        ...demoSessionUser,
        nickname: input.nickname,
      },
      authenticatedAt: new Date().toISOString(),
    };
    return clone(state.session);
  },
  async getVersion() {
    return clone(state.version);
  },
  async getMeta() {
    return clone(state.meta);
  },
  async listMailboxes(options?: {
    scope?: MailboxListScope;
    status?: MailboxStatus | MailboxStatus[];
    tags?: string[];
  }) {
    const visibleMailboxes =
      options?.scope === "workspace"
        ? filterMailboxesForWorkspaceScope(state.mailboxes, DEMO_NOW_ISO)
        : state.mailboxes;
    const statuses = options?.status
      ? new Set(
          Array.isArray(options.status) ? options.status : [options.status],
        )
      : null;
    const tagSet = new Set(options?.tags ?? []);
    return clone(
      [...visibleMailboxes]
        .filter((mailbox) => !statuses || statuses.has(mailbox.status))
        .filter(
          (mailbox) =>
            tagSet.size === 0 ||
            [...tagSet].every((tag) => mailbox.tags.includes(tag)),
        )
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    );
  },
  async getMailbox(id: string) {
    return clone(state.mailboxes.find((mailbox) => mailbox.id === id) ?? null);
  },
  async createMailbox(input: {
    localPart?: string;
    subdomain?: string;
    mailDomain?: string;
    rootDomain?: string;
    expiresInMinutes?: number | null;
    tags?: string[];
  }) {
    const rootDomain = (
      input.mailDomain?.trim().toLowerCase() ??
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
    const expiresInMinutes =
      input.expiresInMinutes === undefined
        ? state.meta.defaultMailboxTtlMinutes
        : input.expiresInMinutes;
    const mailbox: Mailbox = {
      id: randomId("mbx"),
      userId: demoSessionUser.id,
      localPart,
      subdomain,
      mailDomain: rootDomain,
      rootDomain,
      address,
      status: "active",
      createdAt,
      lastReceivedAt: null,
      expiresAt:
        expiresInMinutes === null
          ? null
          : new Date(Date.now() + expiresInMinutes * 60_000).toISOString(),
      destroyedAt: null,
      source: "registered",
      createdVia: "web",
      createdByApiKey: null,
      tags: input.tags ?? [],
      routingRuleId: randomId("rule"),
    };
    state.mailboxes.unshift(mailbox);
    return clone(mailbox);
  },
  async ensureMailbox(
    input:
      | { address: string; expiresInMinutes?: number | null }
      | {
          localPart: string;
          subdomain: string;
          mailDomain?: string;
          rootDomain?: string;
          expiresInMinutes?: number | null;
          tags?: string[];
        },
  ) {
    const address =
      "address" in input
        ? normalizeAddress(input.address)
        : buildAddress(
            normalizeLabel(input.localPart),
            normalizeLabel(input.subdomain),
            (
              input.mailDomain?.trim().toLowerCase() ??
              input.rootDomain?.trim().toLowerCase() ??
              pickRandomRootDomain(state.meta.domains)
            )?.toLowerCase() ?? "",
          );
    const existing = state.mailboxes.find(
      (mailbox) =>
        mailbox.address === address &&
        (mailbox.status === "active" || mailbox.status === "expired"),
    );
    if (existing) {
      const expiresInMinutes =
        input.expiresInMinutes === undefined
          ? state.meta.defaultMailboxTtlMinutes
          : input.expiresInMinutes;
      if (expiresInMinutes !== undefined) {
        existing.expiresAt =
          expiresInMinutes === null
            ? null
            : new Date(Date.now() + expiresInMinutes * 60_000).toISOString();
        existing.status = "active";
        existing.destroyedAt = null;
      }
      return clone(existing);
    }

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
      ...("tags" in input ? { tags: input.tags } : {}),
      expiresInMinutes:
        input.expiresInMinutes === undefined
          ? state.meta.defaultMailboxTtlMinutes
          : input.expiresInMinutes,
    });
  },
  async resolveMailbox(address: string) {
    const mailbox = state.mailboxes.find(
      (entry) =>
        entry.address === normalizeAddress(address) &&
        (entry.status === "active" || entry.status === "expired"),
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
  async resetMailboxTtl(
    id: string,
    input: { expiresInMinutes: number | null },
  ) {
    const mailbox = state.mailboxes.find((entry) => entry.id === id);
    if (!mailbox) throw new Error("Mailbox not found");
    if (mailbox.status !== "active" || mailbox.source !== "registered") {
      throw new Error("Mailbox TTL can only be reset for active mailboxes");
    }
    mailbox.expiresAt =
      input.expiresInMinutes === null
        ? null
        : new Date(Date.now() + input.expiresInMinutes * 60_000).toISOString();
    return clone(mailbox);
  },
  async updateMailboxTags(id: string, input: { tags: string[] }) {
    const mailbox = state.mailboxes.find((entry) => entry.id === id);
    if (!mailbox) throw new Error("Mailbox not found");
    mailbox.tags = [...new Set(input.tags)];
    return clone(mailbox);
  },
  async listMessages(
    mailboxAddresses: string[],
    input?: { after?: string; since?: string },
    options?: {
      mailboxIds?: string[];
      mailboxStatuses?: MailboxStatus[];
      scope?: MailboxListScope;
    },
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
    const normalizedMailboxStatuses = [
      ...new Set(options?.mailboxStatuses ?? []),
    ];
    const scopedMailboxes =
      options?.scope === "workspace" || normalizedMailboxStatuses.length > 0
        ? (options?.scope === "workspace"
            ? filterMailboxesForWorkspaceScope(state.mailboxes, DEMO_NOW_ISO)
            : state.mailboxes
          ).filter(
            (mailbox) =>
              normalizedMailboxStatuses.length === 0 ||
              normalizedMailboxStatuses.includes(mailbox.status),
          )
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
      scopedMailboxes !== null
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
  async createPasskeyInviteRegistrationOptions(_input: {
    inviteCode: string;
    nickname: string;
    passkeyName: string;
  }) {
    return {
      challenge: "demo-passkey-register",
      rp: {
        name: "KaisouMail",
        id: "localhost",
      },
      user: {
        id: "demo-passkey-user",
        name: "demo-user",
        displayName: "Demo User",
      },
      pubKeyCredParams: [{ alg: -7, type: "public-key" }],
      timeout: 60000,
      attestation: "none",
      excludeCredentials: [],
      authenticatorSelection: {
        residentKey: "required",
        userVerification: "required",
      },
    } satisfies PublicKeyCredentialCreationOptionsJSON;
  },
  async verifyPasskeyInviteRegistration() {
    state.session = {
      user: clone(demoSessionUser),
      authenticatedAt: new Date().toISOString(),
    };
    return clone(state.session);
  },
  async createPasskeyRegistrationCompletionOptions(_input: {
    inviteCode?: string;
    nickname: string;
    passkeyName: string;
  }) {
    return this.createPasskeyInviteRegistrationOptions({
      inviteCode: _input.inviteCode ?? "km_demo_invite_1",
      nickname: _input.nickname,
      passkeyName: _input.passkeyName,
    });
  },
  async verifyPasskeyRegistrationCompletion() {
    return this.verifyPasskeyInviteRegistration();
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
  async listUsers(input: { page: number; pageSize: number }) {
    const result = paginate(state.adminUsers, input);
    return clone({
      users: result.items,
      pagination: result.pagination,
    });
  },
  async listInvites(input: { page: number; pageSize: number }) {
    const result = paginate(state.invites, input);
    return clone({
      invites: result.items,
      pagination: result.pagination,
    });
  },
  async createInvite(input: { note?: string; count: number }) {
    const invites = Array.from({ length: input.count }, () => ({
      id: randomId("inv"),
      code: `km_demo_${Math.random().toString(36).slice(2, 10)}`,
      kind: "standard" as const,
      role: "member" as const,
      note: input.note?.trim() || null,
      createdByUserId: demoSessionUser.id,
      createdAt: new Date().toISOString(),
      usedAt: null,
      usedByUserId: null,
    })) satisfies InviteRecord[];
    state.invites = [...invites, ...state.invites];
    return clone({ invites });
  },
  async deleteInvite(id: string) {
    state.invites = state.invites.filter((entry) => entry.id !== id);
  },
  async getRegistrationSettings() {
    return clone({
      settings: {
        ...state.registrationSettings,
        githubClientSecret: "",
        linuxdoClientSecret: "",
      },
    });
  },
  async updateRegistrationSettings(
    input: Omit<RegistrationSettings, "updatedAt">,
  ) {
    state.registrationSettings = {
      ...input,
      githubClientSecret:
        input.githubClientSecret.trim() ||
        state.registrationSettings.githubClientSecret,
      linuxdoClientSecret:
        input.linuxdoClientSecret.trim() ||
        state.registrationSettings.linuxdoClientSecret,
      updatedAt: new Date().toISOString(),
    };
    return clone({
      settings: {
        ...state.registrationSettings,
        githubClientSecret: "",
        linuxdoClientSecret: "",
      },
    });
  },
  async transferAdmin(userId: string, verificationToken?: string) {
    if (!verificationToken?.includes(userId)) {
      throw new Error("Admin transfer verification expired");
    }
    state.users = state.users.map((user) =>
      user.id === demoSessionUser.id
        ? { ...user, role: "member", updatedAt: new Date().toISOString() }
        : user.id === userId
          ? { ...user, role: "admin", updatedAt: new Date().toISOString() }
          : user,
    );
    state.adminUsers = state.adminUsers.map((user) =>
      user.id === demoSessionUser.id
        ? { ...user, role: "member", updatedAt: new Date().toISOString() }
        : user.id === userId
          ? { ...user, role: "admin", updatedAt: new Date().toISOString() }
          : user,
    );
  },
  async listDomains() {
    return clone(state.domains);
  },
  async listDomainCatalog() {
    return {
      domains: clone(buildDomainCatalog()),
      cloudflareSync: {
        status: "live" as const,
        retryAfter: null,
        retryAfterSeconds: null,
        rateLimitContext: null,
      },
    };
  },
  async createDomain(input: {
    mailDomain: string;
    zoneId: string;
    rootDomain?: string;
  }) {
    const rootDomain = (input.mailDomain ?? input.rootDomain)
      .trim()
      .toLowerCase();
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
      mailDomain: rootDomain,
      rootDomain,
      zoneId,
      bindingSource: existing?.bindingSource ?? "catalog",
      status: rootDomain.includes("fail") ? "provisioning_error" : "active",
      catchAllEnabled: existing?.catchAllEnabled ?? false,
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
  async bindDomain(input: { mailDomain: string; rootDomain?: string }) {
    const rootDomain = (input.mailDomain ?? input.rootDomain)
      .trim()
      .toLowerCase();
    const subdomainRecommendation = recommendApexMailboxBinding(rootDomain);
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

    if (subdomainRecommendation) {
      if (existing && existingZone?.id === existing.zoneId) {
        const restoredDomain: DomainRecord = {
          ...existing,
          rootDomain,
          mailDomain: rootDomain,
          zoneId: existingZone.id,
          bindingSource: existing.bindingSource,
          status:
            existingZone.status === "active" ? "active" : "provisioning_error",
          lastProvisionError:
            existingZone.status === "active"
              ? null
              : "Zone is pending activation in Cloudflare; retry after nameservers are delegated",
          updatedAt: createdAt,
          lastProvisionedAt:
            existingZone.status === "active" ? createdAt : null,
          disabledAt: null,
        };
        Object.assign(existing, restoredDomain);
        syncMetaDomains();
        return clone(existing);
      }

      throw new Error("Direct subdomain binding is not supported");
    }

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
      mailDomain: rootDomain,
      rootDomain,
      zoneId: existingZone?.id ?? zoneId,
      bindingSource: "project_bind",
      status: "provisioning_error",
      catchAllEnabled: false,
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
    domain.catchAllEnabled = false;
    domain.disabledAt = new Date().toISOString();
    domain.updatedAt = domain.disabledAt;
    syncMetaDomains();
    return clone(domain);
  },
  async enableDomainCatchAll(id: string) {
    const domain = state.domains.find((entry) => entry.id === id);
    if (!domain) throw new Error("Mailbox domain not found");
    if (domain.status !== "active") {
      throw new Error("Only active mailbox domains can enable catch-all");
    }
    domain.catchAllEnabled = true;
    domain.updatedAt = new Date().toISOString();
    return clone(domain);
  },
  async disableDomainCatchAll(id: string) {
    const domain = state.domains.find((entry) => entry.id === id);
    if (!domain) throw new Error("Mailbox domain not found");
    domain.catchAllEnabled = false;
    domain.updatedAt = new Date().toISOString();
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
};
