import type {
  ApiKeyRecord,
  CreateApiKeyResult,
  CreateUserResult,
  Mailbox,
  MessageDetail,
  MessageSummary,
  SessionResponse,
  UserRecord,
  VersionInfo,
} from "@/lib/contracts";
import {
  demoApiKeys,
  demoMailboxes,
  demoMessageDetails,
  demoMessages,
  demoSessionUser,
  demoUsers,
  demoVersion,
} from "@/mocks/data";

const clone = <T>(value: T): T => structuredClone(value);
const randomId = (prefix: string) =>
  `${prefix}_${Math.random().toString(36).slice(2, 10)}`;
const demoMailDomain = "707979.xyz";

interface DemoState {
  session: SessionResponse | null;
  apiKeys: ApiKeyRecord[];
  users: UserRecord[];
  mailboxes: Mailbox[];
  messages: MessageSummary[];
  messageDetails: Record<string, MessageDetail>;
  version: VersionInfo;
}

const createState = (): DemoState => ({
  session: null,
  apiKeys: clone(demoApiKeys),
  users: clone(demoUsers),
  mailboxes: clone(demoMailboxes),
  messages: clone(demoMessages),
  messageDetails: clone(demoMessageDetails),
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
    expiresInMinutes: number;
  }) {
    const localPart =
      input.localPart?.trim() ||
      `mail-${Math.random().toString(36).slice(2, 8)}`;
    const subdomain =
      input.subdomain?.trim() ||
      `box-${Math.random().toString(36).slice(2, 8)}`;
    const createdAt = new Date().toISOString();
    const mailbox: Mailbox = {
      id: randomId("mbx"),
      userId: demoSessionUser.id,
      localPart,
      subdomain,
      address: `${localPart}@${subdomain}.${demoMailDomain}`,
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
  async listMessages(mailboxAddresses: string[]) {
    const messages =
      mailboxAddresses.length > 0
        ? state.messages.filter((message) =>
            mailboxAddresses.includes(message.mailboxAddress),
          )
        : state.messages;
    return clone(
      messages.sort((a, b) => b.receivedAt.localeCompare(a.receivedAt)),
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
