import type { Meta, StoryObj } from "@storybook/react-vite";
import { type ComponentProps, useEffect, useMemo, useState } from "react";
import { expect, fn, userEvent, within } from "storybook/test";

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

const demoDetailMap = demoMessageDetails as Record<string, MessageDetail>;

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
  maxTtlMinutes: demoMeta.maxMailboxTtlMinutes,
  metaError: null,
  onCancel: fn(),
  onOpen: fn(),
  onSubmit: fn(),
  ...overrides,
});

const meta = {
  title: "Workspace/MailWorkspace",
  component: MailWorkspace,
  tags: ["autodocs"],
  parameters: {
    layout: "fullscreen",
  },
  decorators: [
    (Story) => (
      <div className="min-h-screen bg-background px-4 py-6 text-foreground lg:px-6 xl:px-8">
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

export const AllMailboxes: Story = {
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

export const ToolbarCreateFlow: Story = {
  render: () => <WorkspaceStoryHarness />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);

    await userEvent.click(canvas.getByRole("button", { name: "新建邮箱" }));
    await expect(
      canvas.getByText("在当前工作台里直接创建新地址。"),
    ).toBeInTheDocument();

    await userEvent.keyboard("{Escape}");
    await expect(canvas.queryByLabelText("用户名")).not.toBeInTheDocument();

    await userEvent.click(canvas.getByRole("button", { name: "新建邮箱" }));
    await userEvent.type(canvas.getByLabelText("用户名"), "storybox");
    await userEvent.type(canvas.getByLabelText("子域名"), "ops.alpha");
    await userEvent.selectOptions(
      canvas.getByLabelText("邮箱域名"),
      "mail.example.net",
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

export const CreatePopoverOpen: Story = {
  render: () => <WorkspaceStoryHarness initialCreateOpen />,
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
  args: {
    createMailboxAction: buildCreateMailboxAction(),
    highlightedMailboxId: "mbx_beta",
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
