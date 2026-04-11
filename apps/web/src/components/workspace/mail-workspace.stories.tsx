import { filterMailboxesForWorkspaceScope } from "@kaisoumail/shared";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { type ComponentProps, useEffect, useMemo, useState } from "react";
import { expect, fn, userEvent, waitFor, within } from "storybook/test";

import { buildMailboxCreateAddressExample } from "@/components/mailboxes/mailbox-create-preview";
import { MessageRefreshControl } from "@/components/messages/message-refresh-control";
import { MailWorkspace } from "@/components/workspace/mail-workspace";
import type { Mailbox, MessageDetail, MessageSummary } from "@/lib/contracts";
import {
  filterMailboxes,
  type MailboxSortMode,
  sortMailboxes,
} from "@/lib/workspace";
import {
  demoMailboxes,
  demoMessageDetails,
  demoMessages,
  demoMeta,
} from "@/mocks/data";
import { projectViewportGlobals } from "@/storybook/viewports";

const demoDetailMap = demoMessageDetails as Record<string, MessageDetail>;
const demoSelectedMailbox = demoMailboxes[0] ?? null;
const demoSelectedMailboxMessages = demoMessages.filter(
  (message) => message.mailboxId === demoSelectedMailbox?.id,
);
const demoSelectedMailboxDetail =
  (demoSelectedMailboxMessages[0]
    ? demoDetailMap[demoSelectedMailboxMessages[0].id]
    : null) ?? demoMessageDetails.msg_alpha;

const buildMailboxMessageCounts = (
  mailboxes: Mailbox[],
  messages: MessageSummary[],
) =>
  new Map(
    mailboxes.map((mailbox) => [
      mailbox.id,
      messages.filter((message) => message.mailboxId === mailbox.id).length,
    ]),
  );

const buildMailboxLatestVerificationCodes = (messages: MessageSummary[]) => {
  const latestByMailboxId = new Map<
    string,
    { code: string; receivedAt: string }
  >();

  for (const message of messages) {
    const code = message.verification?.code;
    if (!code) continue;

    const current = latestByMailboxId.get(message.mailboxId);
    if (!current || message.receivedAt.localeCompare(current.receivedAt) > 0) {
      latestByMailboxId.set(message.mailboxId, {
        code,
        receivedAt: message.receivedAt,
      });
    }
  }

  return new Map(
    [...latestByMailboxId.entries()].map(([mailboxId, value]) => [
      mailboxId,
      value.code,
    ]),
  );
};

const createLongMailboxes = (count: number) =>
  Array.from({ length: count }, (_, index) => ({
    ...demoMailboxes[0],
    id: `mbx_virtual_${index}`,
    address: `mailbox-${index.toString().padStart(3, "0")}@ops.alpha.relay.example.test`,
    createdAt: `2026-04-05T08:${(index % 60).toString().padStart(2, "0")}:00.000Z`,
    lastReceivedAt: `2026-04-05T09:${(index % 60).toString().padStart(2, "0")}:00.000Z`,
  }));

const createLongMessages = (
  mailboxes: Mailbox[],
  mailboxIndex: number,
  count: number,
) =>
  Array.from({ length: count }, (_, index) => ({
    ...demoMessages[0],
    id: `msg_virtual_${index}`,
    mailboxId: mailboxes[mailboxIndex]?.id ?? demoMailboxes[0].id,
    mailboxAddress:
      mailboxes[mailboxIndex]?.address ?? demoMailboxes[0]?.address ?? "",
    subject: `Virtualized message ${index.toString().padStart(3, "0")}`,
    previewText: `Virtualized preview ${index}`,
    receivedAt: `2026-04-05T10:${(index % 60).toString().padStart(2, "0")}:00.000Z`,
  }));

const WORKSPACE_SCOPE_DEMO_NOW = "2026-04-08T12:00:00.000Z";

const createWorkspaceScopeMailboxes = () => {
  const activeMailbox: Mailbox = {
    ...demoMailboxes[0],
    id: "mbx_scope_active",
    address: "active@ops.mail.example.net",
    localPart: "active",
    subdomain: "ops",
    rootDomain: "mail.example.net",
    status: "active",
    createdAt: "2026-04-08T11:05:00.000Z",
    lastReceivedAt: "2026-04-08T11:58:00.000Z",
    expiresAt: "2026-04-08T13:00:00.000Z",
    destroyedAt: null,
    routingRuleId: "rule_scope_active",
  };
  const destroyingMailbox: Mailbox = {
    ...demoMailboxes[1],
    id: "mbx_scope_destroying",
    address: "retry@ops.mail.example.net",
    localPart: "retry",
    subdomain: "ops",
    rootDomain: "mail.example.net",
    status: "destroying",
    createdAt: "2026-04-08T10:55:00.000Z",
    lastReceivedAt: null,
    expiresAt: "2026-04-08T12:30:00.000Z",
    destroyedAt: null,
    routingRuleId: "rule_scope_destroying",
  };
  const recentDestroyedMailboxes = Array.from({ length: 55 }, (_, index) => ({
    ...demoMailboxes[2],
    id: `mbx_scope_destroyed_${index.toString().padStart(3, "0")}`,
    address: `destroyed-${index.toString().padStart(3, "0")}@archive.mail.example.net`,
    localPart: `destroyed-${index.toString().padStart(3, "0")}`,
    subdomain: "archive",
    rootDomain: "mail.example.net",
    status: "destroyed" as const,
    createdAt: `2026-04-08T09:${(index % 60).toString().padStart(2, "0")}:00.000Z`,
    lastReceivedAt: null,
    expiresAt: "2026-04-08T11:00:00.000Z",
    destroyedAt: `2026-04-08T11:${index.toString().padStart(2, "0")}:00.000Z`,
    routingRuleId: null,
  }));
  const staleDestroyedMailbox: Mailbox = {
    ...demoMailboxes[2],
    id: "mbx_scope_destroyed_stale",
    address: "destroyed-stale@archive.mail.example.net",
    localPart: "destroyed-stale",
    subdomain: "archive",
    rootDomain: "mail.example.net",
    status: "destroyed",
    createdAt: "2026-03-25T10:00:00.000Z",
    lastReceivedAt: null,
    expiresAt: "2026-03-25T11:00:00.000Z",
    destroyedAt: "2026-03-31T11:00:00.000Z",
    routingRuleId: null,
  };
  const missingDestroyedAtMailbox: Mailbox = {
    ...demoMailboxes[2],
    id: "mbx_scope_destroyed_missing",
    address: "destroyed-missing@archive.mail.example.net",
    localPart: "destroyed-missing",
    subdomain: "archive",
    rootDomain: "mail.example.net",
    status: "destroyed",
    createdAt: "2026-04-08T10:10:00.000Z",
    lastReceivedAt: null,
    expiresAt: "2026-04-08T11:10:00.000Z",
    destroyedAt: null,
    routingRuleId: null,
  };

  const allMailboxes = [
    activeMailbox,
    destroyingMailbox,
    ...recentDestroyedMailboxes,
    staleDestroyedMailbox,
    missingDestroyedAtMailbox,
  ];

  return {
    activeMailbox,
    allMailboxes,
    visibleMailboxes: filterMailboxesForWorkspaceScope(
      allMailboxes,
      WORKSPACE_SCOPE_DEMO_NOW,
    ),
  };
};

const buildCreateMailboxAction = (
  overrides: Partial<
    ComponentProps<typeof MailWorkspace>["createMailboxAction"]
  > = {},
): ComponentProps<typeof MailWorkspace>["createMailboxAction"] => ({
  defaultTtlMinutes: demoMeta.defaultMailboxTtlMinutes,
  domains: demoMeta.domains,
  error: null,
  isMetaLoading: false,
  isOpen: false,
  isPending: false,
  minTtlMinutes: demoMeta.minMailboxTtlMinutes,
  maxTtlMinutes: demoMeta.maxMailboxTtlMinutes,
  metaError: null,
  onCancel: fn(),
  onOpen: fn(),
  onSubmit: fn(),
  supportsUnlimitedTtl: demoMeta.supportsUnlimitedMailboxTtl,
  ...overrides,
});

const meta = {
  title: "Workspace/MailWorkspace",
  component: MailWorkspace,
  tags: ["autodocs"],
  parameters: {
    layout: "fullscreen",
    disableStoryPadding: true,
    docs: {
      description: {
        component:
          "Workspace now surfaces the latest recognized verification code directly in the mailbox rail and message stream. Mailbox rows expose a verification-code chip, while message rows expose a larger code panel that copies without changing the current selection.",
      },
    },
  },
  decorators: [
    (Story) => (
      <div className="min-h-screen bg-background px-4 py-6 text-foreground lg:px-6 xl:flex xl:h-screen xl:flex-col xl:overflow-hidden xl:px-8">
        <Story />
      </div>
    ),
  ],
  args: {
    createMailboxAction: buildCreateMailboxAction(),
    highlightedMailboxId: null,
    visibleMailboxes: demoMailboxes,
    totalMailboxCount: demoMailboxes.length,
    totalMessageCount: demoMessages.length,
    totalAggregatedMessageCount: demoMessages.length,
    mailboxMessageCounts: buildMailboxMessageCounts(
      demoMailboxes,
      demoMessages,
    ),
    mailboxLatestVerificationCodes:
      buildMailboxLatestVerificationCodes(demoMessages),
    selectedMailboxId: "all",
    selectedMailbox: null,
    messages: demoMessages,
    selectedMessageId: demoMessages[0]?.id ?? null,
    selectedMessage: demoMessageDetails.msg_alpha,
    searchQuery: "",
    sortMode: "recent",
    refreshAction: (
      <MessageRefreshControl
        isRefreshing={false}
        labelVisibility="desktop"
        lastRefreshedAt={new Date("2026-04-04T09:12:00.000Z").getTime()}
        onRefresh={fn()}
      />
    ),
    isMailboxesLoading: false,
    isMessagesLoading: false,
    isMessageLoading: false,
    mailboxManagementHref: "/mailboxes",
    messageDetailHref:
      "/messages/msg_alpha?mailbox=all&message=msg_alpha&sort=recent",
    onSearchQueryChange: fn(),
    onSortModeChange: fn(),
    onSelectMailbox: fn(),
    onSelectMessage: fn(),
  },
} satisfies Meta<typeof MailWorkspace>;

export default meta;

type Story = StoryObj<typeof meta>;

const getLayoutRects = (canvasElement: HTMLElement) => {
  const canvas = within(canvasElement);
  const mailboxList = canvas.getByRole("region", { name: "邮箱列表" });
  const messageList = canvas.getByRole("region", { name: "邮件列表" });
  const messageContent = canvas.getByRole("region", { name: "邮件内容" });

  return {
    mailboxList: mailboxList.getBoundingClientRect(),
    messageList: messageList.getBoundingClientRect(),
    messageContent: messageContent.getBoundingClientRect(),
  };
};

const assertMobileSingleColumnLayout = (canvasElement: HTMLElement) => {
  const { mailboxList, messageList, messageContent } =
    getLayoutRects(canvasElement);

  expect(messageList.top).toBeGreaterThan(mailboxList.bottom - 8);
  expect(messageContent.top).toBeGreaterThan(messageList.bottom - 8);
};

const assertTabletSplitLayout = (canvasElement: HTMLElement) => {
  const { mailboxList, messageList, messageContent } =
    getLayoutRects(canvasElement);

  expect(Math.abs(mailboxList.top - messageList.top)).toBeLessThan(24);
  expect(messageList.left).toBeGreaterThan(mailboxList.right - 8);
  expect(Math.abs(messageList.left - messageContent.left)).toBeLessThan(24);
  expect(messageContent.top).toBeGreaterThan(messageList.bottom - 8);
};

const assertDesktopThreePaneLayout = (canvasElement: HTMLElement) => {
  const { mailboxList, messageList, messageContent } =
    getLayoutRects(canvasElement);

  expect(Math.abs(mailboxList.top - messageList.top)).toBeLessThan(24);
  expect(Math.abs(messageList.top - messageContent.top)).toBeLessThan(24);
  expect(messageList.left).toBeGreaterThan(mailboxList.right - 8);
  expect(messageContent.left).toBeGreaterThan(messageList.right - 8);
};

const focusMailboxByTab = async (
  canvasElement: HTMLElement,
  target: HTMLElement,
) => {
  for (let index = 0; index < 12; index += 1) {
    if (target === canvasElement.ownerDocument.activeElement) {
      break;
    }

    await userEvent.tab();
  }

  await expect(target).toHaveFocus();
};

const installClipboardMock = () => {
  const writeText = fn(async () => undefined);

  Object.defineProperty(window.navigator, "clipboard", {
    configurable: true,
    value: {
      writeText,
    },
  });

  return writeText;
};

const WorkspaceStoryHarness = ({
  highlightedMailboxId: initialHighlightedMailboxId = null,
  initialCreateError = null,
  initialCreateOpen = false,
  submitMode = "success",
}: {
  highlightedMailboxId?: string | null;
  initialCreateError?: string | null;
  initialCreateOpen?: boolean;
  submitMode?: "success" | "error";
}) => {
  const [mailboxes, setMailboxes] = useState<Mailbox[]>(demoMailboxes);
  const [selectedMailboxId, setSelectedMailboxId] = useState("all");
  const [selectedMessageId, setSelectedMessageId] = useState<string | null>(
    demoMessages[0]?.id ?? null,
  );
  const [searchQuery, setSearchQuery] = useState("");
  const [sortMode, setSortMode] = useState<MailboxSortMode>("recent");
  const [isCreateOpen, setIsCreateOpen] = useState(initialCreateOpen);
  const [isCreatePending, setIsCreatePending] = useState(false);
  const [createError, setCreateError] = useState<string | null>(
    initialCreateError,
  );
  const [highlightedMailboxId, setHighlightedMailboxId] = useState<
    string | null
  >(initialHighlightedMailboxId);

  const selectedMailbox = useMemo(
    () =>
      selectedMailboxId === "all"
        ? null
        : (mailboxes.find((mailbox) => mailbox.id === selectedMailboxId) ??
          null),
    [mailboxes, selectedMailboxId],
  );

  const currentMessages = useMemo(
    () =>
      selectedMailbox
        ? demoMessages.filter(
            (message) => message.mailboxId === selectedMailbox.id,
          )
        : demoMessages,
    [selectedMailbox],
  );

  const visibleMailboxes = useMemo(
    () => filterMailboxes(sortMailboxes(mailboxes, sortMode), searchQuery),
    [mailboxes, searchQuery, sortMode],
  );

  useEffect(() => {
    if (!currentMessages.some((message) => message.id === selectedMessageId)) {
      setSelectedMessageId(currentMessages[0]?.id ?? null);
    }
  }, [currentMessages, selectedMessageId]);

  useEffect(() => {
    if (!highlightedMailboxId) return;

    const clearHighlight = () => setHighlightedMailboxId(null);

    window.addEventListener("pointerdown", clearHighlight, {
      capture: true,
      once: true,
    });
    window.addEventListener("keydown", clearHighlight, {
      capture: true,
      once: true,
    });

    return () => {
      window.removeEventListener("pointerdown", clearHighlight, {
        capture: true,
      });
      window.removeEventListener("keydown", clearHighlight, {
        capture: true,
      });
    };
  }, [highlightedMailboxId]);

  const selectedMessage =
    (selectedMessageId ? demoDetailMap[selectedMessageId] : null) ?? null;

  return (
    <MailWorkspace
      createMailboxAction={{
        defaultTtlMinutes: demoMeta.defaultMailboxTtlMinutes,
        domains: demoMeta.domains,
        error: createError,
        isMetaLoading: false,
        isOpen: isCreateOpen,
        isPending: isCreatePending,
        minTtlMinutes: demoMeta.minMailboxTtlMinutes,
        maxTtlMinutes: demoMeta.maxMailboxTtlMinutes,
        metaError: null,
        onCancel: () => {
          if (isCreatePending) return;
          setCreateError(null);
          setIsCreateOpen(false);
        },
        onOpen: () => {
          if (isCreatePending) return;
          setCreateError(null);
          setIsCreateOpen(true);
        },
        supportsUnlimitedTtl: demoMeta.supportsUnlimitedMailboxTtl,
        onSubmit: async (values) => {
          setCreateError(null);
          setIsCreatePending(true);
          await new Promise((resolve) => window.setTimeout(resolve, 180));

          if (submitMode === "error") {
            setIsCreatePending(false);
            setCreateError("Mailbox already exists");
            return;
          }

          const rootDomain =
            values.rootDomain ?? demoMeta.domains[0] ?? "relay.example.test";
          const localPart = values.localPart ?? "story";
          const subdomain = values.subdomain ?? "popover";
          const mailbox: Mailbox = {
            id: "mbx_story_new",
            userId: "usr_demo_admin",
            localPart,
            subdomain,
            rootDomain,
            address: `${localPart}@${subdomain}.${rootDomain}`,
            status: "active",
            createdAt: "2026-04-05T08:16:00.000Z",
            lastReceivedAt: null,
            expiresAt: "2026-04-05T09:16:00.000Z",
            destroyedAt: null,
            routingRuleId: "rule_story_new",
          };

          setMailboxes((current) => [
            mailbox,
            ...current.filter((entry) => entry.id !== mailbox.id),
          ]);
          setSearchQuery("");
          setSelectedMailboxId(mailbox.id);
          setSelectedMessageId(null);
          setHighlightedMailboxId(mailbox.id);
          setIsCreatePending(false);
          setIsCreateOpen(false);
        },
      }}
      highlightedMailboxId={highlightedMailboxId}
      isMailboxesLoading={false}
      isMessageLoading={false}
      isMessagesLoading={false}
      mailboxManagementHref="/mailboxes"
      mailboxMessageCounts={buildMailboxMessageCounts(mailboxes, demoMessages)}
      mailboxLatestVerificationCodes={buildMailboxLatestVerificationCodes(
        demoMessages,
      )}
      messageDetailHref={
        selectedMessageId
          ? `/messages/${selectedMessageId}?mailbox=${selectedMailboxId}`
          : null
      }
      messages={currentMessages}
      onSearchQueryChange={setSearchQuery}
      onSelectMailbox={(mailboxId) => {
        setSelectedMailboxId(mailboxId);
      }}
      onSelectMessage={setSelectedMessageId}
      onSortModeChange={setSortMode}
      refreshAction={
        <MessageRefreshControl
          isRefreshing={false}
          labelVisibility="desktop"
          lastRefreshedAt={new Date("2026-04-04T09:12:00.000Z").getTime()}
          onRefresh={fn()}
        />
      }
      searchQuery={searchQuery}
      selectedMailbox={selectedMailbox}
      selectedMailboxId={selectedMailboxId}
      selectedMessage={selectedMessage}
      selectedMessageId={selectedMessageId}
      sortMode={sortMode}
      totalAggregatedMessageCount={demoMessages.length}
      totalMailboxCount={mailboxes.length}
      totalMessageCount={currentMessages.length}
      visibleMailboxes={visibleMailboxes}
    />
  );
};

const DesktopVirtualizedHarness = () => {
  const longMailboxes = useMemo(() => createLongMailboxes(160), []);
  const longMessages = useMemo(
    () => createLongMessages(longMailboxes, 118, 260),
    [longMailboxes],
  );
  const [selectedMailboxId, setSelectedMailboxId] = useState(
    longMailboxes[118]?.id ?? "all",
  );
  const [selectedMessageId, setSelectedMessageId] = useState<string | null>(
    longMessages[203]?.id ?? null,
  );

  useEffect(() => {
    const originalMatchMedia = window.matchMedia.bind(window);

    window.matchMedia = ((query: string) => {
      if (query.includes("min-width: 1280px")) {
        return {
          matches: true,
          media: query,
          onchange: null,
          addEventListener() {},
          removeEventListener() {},
          addListener() {},
          removeListener() {},
          dispatchEvent() {
            return false;
          },
        } as MediaQueryList;
      }

      return originalMatchMedia(query);
    }) as typeof window.matchMedia;

    return () => {
      window.matchMedia = originalMatchMedia;
    };
  }, []);

  const selectedMailbox =
    longMailboxes.find((mailbox) => mailbox.id === selectedMailboxId) ?? null;
  const selectedMessage =
    (selectedMessageId ? demoDetailMap[selectedMessageId] : null) ??
    demoMessageDetails.msg_alpha;

  return (
    <MailWorkspace
      createMailboxAction={buildCreateMailboxAction()}
      highlightedMailboxId={longMailboxes[118]?.id ?? null}
      isMailboxesLoading={false}
      isMessageLoading={false}
      isMessagesLoading={false}
      mailboxManagementHref="/mailboxes"
      mailboxMessageCounts={
        new Map(longMailboxes.map((mailbox) => [mailbox.id, 1]))
      }
      mailboxLatestVerificationCodes={buildMailboxLatestVerificationCodes(
        longMessages,
      )}
      messageDetailHref={
        selectedMessageId
          ? `/messages/${selectedMessageId}?mailbox=${selectedMailboxId}`
          : null
      }
      messages={longMessages}
      onSearchQueryChange={fn()}
      onSelectMailbox={setSelectedMailboxId}
      onSelectMessage={setSelectedMessageId}
      onSortModeChange={fn()}
      refreshAction={
        <MessageRefreshControl
          isRefreshing={false}
          labelVisibility="desktop"
          lastRefreshedAt={new Date("2026-04-05T10:12:00.000Z").getTime()}
          onRefresh={fn()}
        />
      }
      searchQuery=""
      selectedMailbox={selectedMailbox}
      selectedMailboxId={selectedMailboxId}
      selectedMessage={selectedMessage}
      selectedMessageId={selectedMessageId}
      sortMode="recent"
      totalAggregatedMessageCount={longMessages.length}
      totalMailboxCount={longMailboxes.length}
      totalMessageCount={longMessages.length}
      visibleMailboxes={longMailboxes}
    />
  );
};

const WorkspaceScopeHistoryHarness = () => {
  const { activeMailbox, visibleMailboxes } = useMemo(
    () => createWorkspaceScopeMailboxes(),
    [],
  );
  const scopedMessages = useMemo<MessageSummary[]>(
    () => [
      {
        ...demoMessages[0],
        id: "msg_scope_active",
        mailboxId: activeMailbox.id,
        mailboxAddress: activeMailbox.address,
        subject: "Workspace scope keeps only recent destroyed rows",
        previewText: "Recent destroyed mailboxes stay visible for seven days.",
        receivedAt: "2026-04-08T11:58:00.000Z",
      },
    ],
    [activeMailbox],
  );
  const scopedDetail = useMemo<MessageDetail>(
    () => ({
      ...demoMessageDetails.msg_alpha,
      id: "msg_scope_active",
      mailboxId: activeMailbox.id,
      mailboxAddress: activeMailbox.address,
      subject: "Workspace scope keeps only recent destroyed rows",
      previewText: "Recent destroyed mailboxes stay visible for seven days.",
      receivedAt: "2026-04-08T11:58:00.000Z",
      envelopeTo: activeMailbox.address,
      rawDownloadPath: "/api/messages/msg_scope_active/raw",
    }),
    [activeMailbox],
  );

  return (
    <MailWorkspace
      createMailboxAction={buildCreateMailboxAction()}
      highlightedMailboxId={null}
      isMailboxesLoading={false}
      isMessageLoading={false}
      isMessagesLoading={false}
      mailboxManagementHref="/mailboxes"
      mailboxMessageCounts={buildMailboxMessageCounts(
        visibleMailboxes,
        scopedMessages,
      )}
      mailboxLatestVerificationCodes={buildMailboxLatestVerificationCodes(
        scopedMessages,
      )}
      messageDetailHref="/messages/msg_scope_active?mailbox=all&sort=recent"
      messages={scopedMessages}
      onSearchQueryChange={fn()}
      onSelectMailbox={fn()}
      onSelectMessage={fn()}
      onSortModeChange={fn()}
      refreshAction={
        <MessageRefreshControl
          isRefreshing={false}
          labelVisibility="desktop"
          lastRefreshedAt={new Date(WORKSPACE_SCOPE_DEMO_NOW).getTime()}
          onRefresh={fn()}
        />
      }
      searchQuery=""
      selectedMailbox={null}
      selectedMailboxId="all"
      selectedMessage={scopedDetail}
      selectedMessageId={scopedDetail.id}
      sortMode="recent"
      totalAggregatedMessageCount={scopedMessages.length}
      totalMailboxCount={visibleMailboxes.length}
      totalMessageCount={scopedMessages.length}
      visibleMailboxes={visibleMailboxes}
    />
  );
};

export const MobileSingleColumn: Story = {
  globals: projectViewportGlobals.mobile,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);

    await expect(
      canvas.getByRole("heading", { name: "邮件工作台" }),
    ).toBeInTheDocument();
    await expect(
      canvas.queryByText("集中查看邮箱、邮件列表和正文内容。"),
    ).not.toBeInTheDocument();
    await expect(
      canvas.getByRole("button", { name: "新建邮箱" }),
    ).toBeInTheDocument();

    assertMobileSingleColumnLayout(canvasElement);
  },
};

export const TabletSplitView: Story = {
  globals: projectViewportGlobals.tablet,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);

    await expect(
      canvas.getByRole("button", { name: "新建邮箱" }),
    ).toBeInTheDocument();
    await expect(
      canvas.getByText("集中查看邮箱、邮件列表和正文内容。"),
    ).toBeInTheDocument();
    await expect(
      canvas.getByRole("button", { name: "手动刷新" }),
    ).toBeInTheDocument();

    assertTabletSplitLayout(canvasElement);
  },
};

export const DesktopThreePane: Story = {
  globals: projectViewportGlobals.desktop,

  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    await expect(
      canvas.getByRole("heading", { name: "邮件工作台" }),
    ).toBeInTheDocument();
    await expect(
      canvas.getByRole("button", { name: "新建邮箱" }),
    ).toBeInTheDocument();
    await expect(
      canvas.getByRole("button", { name: "手动刷新" }),
    ).toBeInTheDocument();
    await expect(
      canvas.getByRole("link", { name: "打开邮箱管理" }),
    ).toBeInTheDocument();

    assertDesktopThreePaneLayout(canvasElement);

    await userEvent.click(
      canvas.getByRole("button", {
        name: /spec@ops\.beta\.mail\.example\.net/i,
      }),
    );
    await expect(args.onSelectMailbox).toHaveBeenCalledWith("mbx_beta");

    await userEvent.click(
      canvas.getByRole("button", { name: /Spec review notes/i }),
    );
    await expect(args.onSelectMessage).toHaveBeenCalledWith("msg_beta");
  },
};

const verificationSignalArgs = {
  selectedMailboxId: demoSelectedMailbox?.id ?? "all",
  selectedMailbox: demoSelectedMailbox,
  messages: demoSelectedMailboxMessages,
  selectedMessageId: demoSelectedMailboxDetail.id,
  selectedMessage: demoSelectedMailboxDetail,
  totalMessageCount: demoSelectedMailboxMessages.length,
} satisfies Partial<ComponentProps<typeof MailWorkspace>>;

export const VerificationSignalsDefault: Story = {
  globals: projectViewportGlobals.desktop,
  args: verificationSignalArgs,
};

export const VerificationSignals: Story = {
  globals: projectViewportGlobals.desktop,
  args: verificationSignalArgs,
  parameters: {
    docs: {
      description: {
        story:
          "Shows both mailbox-address and verification copy affordances together: the mailbox rail keeps a dedicated address-copy icon alongside the verification-code chip, while the message header and message row expose their own copy targets without stealing selection.",
      },
    },
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const writeText = installClipboardMock();
    const rowAddressCopyButton = canvas.getAllByRole("button", {
      name: "复制邮箱地址",
    })[0];
    const copyButtons = canvas.getAllByRole("button", {
      name: "复制验证码 842911",
    });

    await userEvent.click(rowAddressCopyButton ?? document.body);
    await userEvent.click(copyButtons[0] ?? document.body);
    await userEvent.click(copyButtons[1] ?? document.body);

    await waitFor(() => {
      expect(writeText).toHaveBeenCalledTimes(3);
    });
    const copiedValues = (writeText.mock.calls as unknown as string[][]).map(
      (call) => call[0],
    );
    expect(copiedValues.filter((value) => value === "842911")).toHaveLength(2);
    expect(
      copiedValues.filter(
        (value) => value === "build@alpha.relay.example.test",
      ),
    ).toHaveLength(1);
    await expect(
      canvas.getByRole("button", { name: "已复制邮箱地址" }),
    ).toBeInTheDocument();
    await expect(canvas.queryByText("邮箱地址已复制")).not.toBeInTheDocument();
    await expect(
      canvas.getAllByRole("button", { name: "已复制验证码 842911" }).length,
    ).toBeGreaterThan(0);
    await expect(
      canvas.getByRole("button", { name: /Build artifacts ready/i }),
    ).toBeInTheDocument();
    await expect(canvas.queryByText("点击复制")).not.toBeInTheDocument();
    await expect(canvas.queryByText("验证码")).not.toBeInTheDocument();
  },
};

export const WithoutVerificationSignals: Story = {
  args: {
    messages: demoMessages.map((message) => ({
      ...message,
      verification: null,
    })),
    mailboxLatestVerificationCodes: new Map<string, string>(),
    selectedMessage: {
      ...demoMessageDetails.msg_alpha,
      verification: null,
    },
  },
  parameters: {
    docs: {
      description: {
        story:
          "Verification copy actions stay completely hidden when the API returns `verification: null` for the current mailbox/message set.",
      },
    },
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);

    await expect(
      canvas.queryByRole("button", { name: /复制验证码/i }),
    ).not.toBeInTheDocument();
  },
};

export const ResponsiveCanvas: Story = {};

export const ToolbarCreateFlow: Story = {
  render: () => <WorkspaceStoryHarness />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const randomDomainPreviewAddress = buildMailboxCreateAddressExample({});
    const selectedDomainPreviewAddress = buildMailboxCreateAddressExample({
      rootDomain: "mail.example.net",
    });

    await userEvent.click(canvas.getByRole("button", { name: "新建邮箱" }));
    await expect(
      canvas.getByText("创建后会自动切换到新邮箱。"),
    ).toBeInTheDocument();
    await expect(
      canvas.getByRole("button", { name: "查看邮箱创建说明" }),
    ).toBeInTheDocument();
    await userEvent.click(
      canvas.getByRole("button", { name: "查看邮箱创建说明" }),
    );
    await expect(
      within(canvasElement.ownerDocument.body).getByText(
        randomDomainPreviewAddress,
      ),
    ).toBeInTheDocument();
    await expect(canvas.getByLabelText("邮箱域名")).toHaveValue("");

    await userEvent.click(
      canvas.getByRole("button", { name: "查看邮箱创建说明" }),
    );
    await userEvent.click(canvas.getByRole("button", { name: "取消" }));
    await expect(canvas.queryByLabelText("用户名")).not.toBeInTheDocument();

    await userEvent.click(canvas.getByRole("button", { name: "新建邮箱" }));
    await userEvent.type(canvas.getByLabelText("用户名"), "storybox");
    await userEvent.type(canvas.getByLabelText("子域名"), "ops.alpha");
    await userEvent.selectOptions(
      canvas.getByLabelText("邮箱域名"),
      "mail.example.net",
    );
    await userEvent.click(
      canvas.getByRole("button", { name: "查看邮箱创建说明" }),
    );
    await expect(
      within(canvasElement.ownerDocument.body).getByText(
        selectedDomainPreviewAddress,
      ),
    ).toBeInTheDocument();
    await userEvent.click(
      canvas.getByRole("button", { name: "查看邮箱创建说明" }),
    );
    await userEvent.click(canvas.getByRole("button", { name: "创建邮箱" }));

    await expect(
      canvas.getByRole("button", { name: "创建中…" }),
    ).toBeDisabled();

    const createdRow = await canvas.findByRole("button", {
      name: /storybox@ops\.alpha\.mail\.example\.net/i,
    });
    await expect(within(createdRow).getByText("新建")).toBeInTheDocument();

    await userEvent.click(canvas.getByRole("heading", { name: "邮件工作台" }));
    await expect(
      within(createdRow).queryByText("新建"),
    ).not.toBeInTheDocument();
  },
};

export const ToolbarCreateFullAddressFlow: Story = {
  render: () => <WorkspaceStoryHarness />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const fullAddressPreview = buildMailboxCreateAddressExample({
      mode: "address",
      address: "build@ops.alpha.mail.example.net",
    });

    await userEvent.click(canvas.getByRole("button", { name: "新建邮箱" }));
    await userEvent.click(canvas.getByRole("button", { name: "完整" }));
    await userEvent.type(
      canvas.getByLabelText("完整邮箱地址"),
      "Build@Ops.Alpha.mail.example.net",
    );
    await userEvent.click(
      canvas.getByRole("button", { name: "查看邮箱创建说明" }),
    );
    await expect(
      within(canvasElement.ownerDocument.body).getByText(fullAddressPreview),
    ).toBeInTheDocument();
    await userEvent.click(
      canvas.getByRole("button", { name: "查看邮箱创建说明" }),
    );
    await userEvent.click(canvas.getByRole("button", { name: "创建邮箱" }));

    const createdRow = await canvas.findByRole("button", {
      name: /build@ops\.alpha\.mail\.example\.net/i,
    });
    await expect(within(createdRow).getByText("新建")).toBeInTheDocument();
  },
};

export const CreatePopoverOpen: Story = {
  render: () => <WorkspaceStoryHarness initialCreateOpen />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(
      canvas.getByRole("button", { name: "查看邮箱创建说明" }),
    );
    await expect(
      within(canvasElement.ownerDocument.body).getByText(
        buildMailboxCreateAddressExample({}),
      ),
    ).toBeInTheDocument();
    await expect(canvas.getByLabelText("邮箱域名")).toHaveValue("");
  },
};

export const CreatePending: Story = {
  args: {
    createMailboxAction: buildCreateMailboxAction({
      isOpen: true,
      isPending: true,
    }),
  },
};

export const CreateSubmitError: Story = {
  render: () => <WorkspaceStoryHarness initialCreateOpen submitMode="error" />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);

    await userEvent.type(canvas.getByLabelText("用户名"), "build");
    await userEvent.type(canvas.getByLabelText("子域名"), "alpha");
    await userEvent.click(canvas.getByRole("button", { name: "创建邮箱" }));

    await expect(await canvas.findByRole("alert")).toHaveTextContent(
      "Mailbox already exists",
    );
    await expect(canvas.getByLabelText("用户名")).toBeEnabled();
  },
};

export const SingleMailbox: Story = {
  args: {
    createMailboxAction: buildCreateMailboxAction(),
    selectedMailboxId: "mbx_beta",
    selectedMailbox: demoMailboxes[1],
    messages: demoMessages.filter(
      (message) => message.mailboxId === "mbx_beta",
    ),
    totalMessageCount: demoMessages.filter(
      (message) => message.mailboxId === "mbx_beta",
    ).length,
    selectedMessageId: "msg_beta",
    selectedMessage: demoMessageDetails.msg_beta,
    messageDetailHref:
      "/messages/msg_beta?mailbox=mbx_beta&message=msg_beta&sort=recent",
  },
};

export const EmptyMailboxState: Story = {
  args: {
    createMailboxAction: buildCreateMailboxAction(),
    selectedMailboxId: "mbx_gamma",
    selectedMailbox: demoMailboxes[2],
    messages: [],
    totalMessageCount: 0,
    selectedMessageId: null,
    selectedMessage: null,
    messageDetailHref: null,
  },
};

export const SearchEmptyState: Story = {
  args: {
    createMailboxAction: buildCreateMailboxAction(),
    visibleMailboxes: [],
    searchQuery: "zzz",
    selectedMailboxId: "all",
    selectedMailbox: null,
    selectedMessageId: null,
    selectedMessage: null,
    messageDetailHref: null,
  },
};

export const HighlightedNewMailbox: Story = {
  globals: projectViewportGlobals.desktop,
  args: {
    createMailboxAction: buildCreateMailboxAction(),
    highlightedMailboxId: "mbx_beta",
  },
};

export const FocusedMailboxRow: Story = {
  globals: projectViewportGlobals.desktop,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const mailboxRow = canvas.getByRole("button", {
      name: /build@alpha\.relay\.example\.test/i,
    });

    await focusMailboxByTab(canvasElement, mailboxRow);
  },
};

export const FocusedAllMailboxRow: Story = {
  globals: projectViewportGlobals.desktop,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const mailboxRow = canvas.getByRole("button", {
      name: /全部邮箱/i,
    });

    await focusMailboxByTab(canvasElement, mailboxRow);
  },
};

export const FocusedMessageRow: Story = {
  globals: projectViewportGlobals.desktop,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const messageRow = canvas.getByRole("button", {
      name: /Spec review notes/i,
    });

    await focusMailboxByTab(canvasElement, messageRow);
  },
};

export const HighlightedNewMailboxFocused: Story = {
  globals: projectViewportGlobals.desktop,
  args: {
    createMailboxAction: buildCreateMailboxAction(),
    highlightedMailboxId: "mbx_beta",
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const highlightedRow = canvas.getByRole("button", {
      name: /spec@ops\.beta\.mail\.example\.net/i,
    });

    await focusMailboxByTab(canvasElement, highlightedRow);
    await expect(within(highlightedRow).getByText("新建")).toBeInTheDocument();
  },
};

export const RefreshingWorkspace: Story = {
  args: {
    createMailboxAction: buildCreateMailboxAction(),
    refreshAction: (
      <MessageRefreshControl
        isRefreshing
        labelVisibility="desktop"
        lastRefreshedAt={new Date("2026-04-04T09:12:00.000Z").getTime()}
        onRefresh={fn()}
      />
    ),
  },
};

export const DesktopVirtualizedLongLists: Story = {
  globals: projectViewportGlobals.desktop,
  render: () => <DesktopVirtualizedHarness />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const mailboxScroll = canvas.getByTestId("workspace-mailbox-scroll");
    const messageScroll = canvas.getByTestId("workspace-message-scroll");

    await waitFor(() => {
      expect(mailboxScroll.scrollTop).toBeGreaterThan(0);
      expect(messageScroll.scrollTop).toBeGreaterThan(0);
    });

    await expect(
      canvas.getByRole("button", {
        name: /mailbox-118@ops\.alpha\.relay\.example\.test/i,
      }),
    ).toBeVisible();
    await expect(
      canvas.getByRole("button", {
        name: /Virtualized message 203/i,
      }),
    ).toBeVisible();

    mailboxScroll.scrollTo({
      top: mailboxScroll.scrollHeight,
    });
    mailboxScroll.dispatchEvent(new Event("scroll"));

    await expect(
      await canvas.findByRole("button", {
        name: /mailbox-159@ops\.alpha\.relay\.example\.test/i,
      }),
    ).toBeVisible();

    await userEvent.click(
      canvas.getByRole("button", {
        name: /mailbox-159@ops\.alpha\.relay\.example\.test/i,
      }),
    );
  },
};

export const WorkspaceScopeTrimmedDestroyedHistory: Story = {
  globals: projectViewportGlobals.tablet,
  render: () => <WorkspaceScopeHistoryHarness />,
  parameters: {
    docs: {
      description: {
        story:
          "Workspace scope keeps active/destroying mailboxes, retains only the latest 50 destroyed rows from the last seven days, and hides older or malformed destroyed history.",
      },
    },
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);

    await expect(canvas.getByText("52 个邮箱 · 1 封邮件")).toBeInTheDocument();
    await expect(
      canvas.getByRole("button", {
        name: /destroyed-054@archive\.mail\.example\.net/i,
      }),
    ).toBeInTheDocument();
    await expect(
      canvas.queryByRole("button", {
        name: /destroyed-000@archive\.mail\.example\.net/i,
      }),
    ).not.toBeInTheDocument();
    await expect(
      canvas.queryByRole("button", {
        name: /destroyed-stale@archive\.mail\.example\.net/i,
      }),
    ).not.toBeInTheDocument();
    await expect(
      canvas.queryByRole("button", {
        name: /destroyed-missing@archive\.mail\.example\.net/i,
      }),
    ).not.toBeInTheDocument();
  },
};

export const MailboxPaneError: Story = {
  args: {
    createMailboxAction: buildCreateMailboxAction(),
    mailboxesError: {
      variant: "recoverable",
      title: "邮箱列表暂时不可用",
      description: "暂时无法获取邮箱目录和统计，请刷新后重试。",
      details:
        '{\n  "error": "Request failed",\n  "details": "mailboxes offline"\n}',
      onRetry: fn(),
    },
    visibleMailboxes: [],
    mailboxMessageCounts: new Map(),
  },
};

export const MessagePaneError: Story = {
  args: {
    createMailboxAction: buildCreateMailboxAction(),
    messagesError: {
      variant: "recoverable",
      title: "邮件流加载失败",
      description: "暂时无法获取当前范围内的邮件，请刷新后重试。",
      details:
        '{\n  "error": "Request failed",\n  "details": "messages offline"\n}',
      onRetry: fn(),
    },
    messages: [],
    selectedMessageId: null,
    selectedMessage: null,
    messageDetailHref: null,
  },
};

export const ReaderNotFound: Story = {
  args: {
    createMailboxAction: buildCreateMailboxAction(),
    messageError: {
      variant: "not-found",
      title: "这封邮件已经不可见了",
      description: "邮件正文可能已经被清理，或者当前会话不再拥有访问权限。",
      details: `{
  "error": "Message not found",
  "details": null
}`,
      onRetry: fn(),
    },
    selectedMessage: null,
  },
};
