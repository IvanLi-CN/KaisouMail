import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, fn, userEvent, within } from "storybook/test";
import { AppShell } from "@/components/layout/app-shell";
import { MessageRefreshControl } from "@/components/messages/message-refresh-control";
import {
  demoMailboxes,
  demoMessages,
  demoMeta,
  demoSessionUser,
  demoVersion,
} from "@/mocks/data";
import { MailboxesPageView } from "@/pages/mailboxes-page";

const messageStatsByMailbox = new Map<
  string,
  { unread: number; total: number }
>(
  demoMailboxes.map((mailbox) => [
    mailbox.id,
    {
      unread: demoMessages.filter((message) => message.mailboxId === mailbox.id)
        .length,
      total: demoMessages.filter((message) => message.mailboxId === mailbox.id)
        .length,
    },
  ]),
);

const statusSegmentMailboxes = [
  ...demoMailboxes.slice(0, 2),
  {
    ...demoMailboxes[1],
    id: "mbx_page_expired",
    address: "expired@trash.relay.example.test",
    status: "expired" as const,
    expiresAt: "2026-04-01T07:15:00.000Z",
    routingRuleId: "rule_page_expired",
  },
  {
    ...demoMailboxes[1],
    id: "mbx_page_destroying",
    address: "destroying@ops.relay.example.test",
    status: "destroying" as const,
    routingRuleId: "rule_page_destroying",
  },
  ...(demoMailboxes[3] ? [demoMailboxes[3]] : []),
];

const statusSegmentMessageStats = new Map(
  statusSegmentMailboxes.map((mailbox) => [
    mailbox.id,
    {
      unread: demoMessages.filter((message) => message.mailboxId === mailbox.id)
        .length,
      total: demoMessages.filter((message) => message.mailboxId === mailbox.id)
        .length,
    },
  ]),
);

const meta = {
  title: "Pages/Mailboxes",
  component: MailboxesPageView,
  tags: ["autodocs"],
  args: {
    meta: demoMeta,
    isMetaLoading: false,
    mailboxes: demoMailboxes,
    messageStatsByMailbox,
    isCreatePending: false,
    refreshAction: (
      <MessageRefreshControl
        density="default"
        isRefreshing={false}
        lastRefreshedAt={new Date("2026-04-04T09:12:00.000Z").getTime()}
        onRefresh={fn()}
      />
    ),
    onCreate: fn(),
    onDestroy: fn(),
    onRestoreTtl: fn(),
  },
  render: (args) => (
    <AppShell user={demoSessionUser} version={demoVersion} onLogout={fn()}>
      <MailboxesPageView {...args} />
    </AppShell>
  ),
} satisfies Meta<typeof MailboxesPageView>;

export default meta;

type Story = StoryObj<typeof meta>;

const existingMailboxConflictStoryMailbox = {
  ...(demoMailboxes[1] ?? demoMailboxes[0]),
  expiresAt: "2026-12-18T18:30:00.000Z",
  lastReceivedAt: "2026-04-18T09:36:00.000Z",
};

const existingMailboxConflictVisibleMailboxes = demoMailboxes.map((mailbox) =>
  mailbox.id === existingMailboxConflictStoryMailbox.id
    ? existingMailboxConflictStoryMailbox
    : mailbox,
);

const existingMailboxConflictMessageStatsByMailbox = new Map(
  existingMailboxConflictVisibleMailboxes.map((mailbox) => [
    mailbox.id,
    {
      unread: demoMessages.filter((message) => message.mailboxId === mailbox.id)
        .length,
      total: demoMessages.filter((message) => message.mailboxId === mailbox.id)
        .length,
    },
  ]),
);

export const Overview: Story = {};

export const StatusSegmentedRecycleBin: Story = {
  args: {
    mailboxes: statusSegmentMailboxes,
    messageStatsByMailbox: statusSegmentMessageStats,
    onRestoreTtl: fn(),
  },
  parameters: {
    docs: {
      description: {
        story:
          "Page-level segmented mailbox status filters. The expired segment is presented as a recycle-bin queue with history, immediate destroy, and TTL extension restore affordances.",
      },
    },
  },
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement);

    await expect(canvas.getByRole("tab", { name: /可用/ })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    await expect(
      canvas.queryByText("expired@trash.relay.example.test"),
    ).not.toBeInTheDocument();

    await userEvent.click(canvas.getByRole("tab", { name: /已过期/ }));
    await expect(
      canvas.getByText("expired@trash.relay.example.test"),
    ).toBeInTheDocument();
    await expect(canvas.getByText("已过期 · 回收站")).toBeInTheDocument();
    await expect(canvas.getByText(/回收站 ·/)).toBeInTheDocument();
    await expect(
      canvas.getByRole("link", { name: "查看历史" }),
    ).toHaveAttribute("href", "/mailboxes/mbx_page_expired");

    await userEvent.click(canvas.getByRole("button", { name: "延长 TTL" }));
    await expect(args.onRestoreTtl).toHaveBeenCalledWith(
      expect.objectContaining({ id: "mbx_page_expired" }),
    );
  },
};

export const LoadingMeta: Story = {
  args: {
    meta: null,
    isMetaLoading: true,
    mailboxes: [],
    messageStatsByMailbox: new Map(),
  },
};

export const CreateFlow: Story = {
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);

    await userEvent.type(canvas.getByLabelText("用户名"), "nightly");
    await userEvent.type(canvas.getByLabelText("子域名"), "ops.alpha");
    await userEvent.selectOptions(
      canvas.getByLabelText("邮箱域名"),
      "mail.example.net",
    );
    await userEvent.dblClick(canvas.getByLabelText("生命周期值"));
    await userEvent.clear(canvas.getByLabelText("生命周期值"));
    await userEvent.type(canvas.getByLabelText("生命周期值"), "90m");
    await userEvent.click(canvas.getByRole("button", { name: "创建邮箱" }));

    await expect(args.onCreate).toHaveBeenCalledWith({
      localPart: "nightly",
      subdomain: "ops.alpha",
      rootDomain: "mail.example.net",
      expiresInMinutes: 90,
    });
    await expect(
      canvas.getByRole("link", { name: "打开邮件工作台" }),
    ).toBeInTheDocument();
  },
};

export const ExistingMailboxConflict: Story = {
  args: {
    mailboxes: existingMailboxConflictVisibleMailboxes,
    messageStatsByMailbox: existingMailboxConflictMessageStatsByMailbox,
    selectedMailboxId: "mbx_beta",
    highlightedMailboxId: "mbx_beta",
    mailboxPrompt: {
      mailbox: existingMailboxConflictStoryMailbox,
      requestedExpiresInMinutes: demoMeta.defaultMailboxTtlMinutes,
      result: null,
      error: null,
    },
    onConfirmPrompt: fn(),
    onClosePrompt: fn(),
  },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);

    await expect(canvas.getByText("邮箱已存在")).toBeInTheDocument();
    await userEvent.click(canvas.getByRole("button", { name: "延长有效期" }));
    await expect(args.onConfirmPrompt).toHaveBeenCalled();
  },
};

export const RefreshingStats: Story = {
  args: {
    refreshAction: (
      <MessageRefreshControl
        density="default"
        isRefreshing
        lastRefreshedAt={new Date("2026-04-04T09:12:00.000Z").getTime()}
        onRefresh={fn()}
      />
    ),
  },
};

export const RulesLoadError: Story = {
  args: {
    meta: null,
    createError: {
      variant: "recoverable",
      title: "邮箱规则暂时加载失败",
      description: "暂时无法读取创建邮箱所需的规则，请重新加载后重试。",
      details:
        '{\n  "error": "Request failed",\n  "details": "meta offline"\n}',
    },
    onRetryCreate: fn(),
  },
};

export const MailboxListError: Story = {
  args: {
    listError: {
      variant: "recoverable",
      title: "邮箱列表加载失败",
      description: "暂时无法获取邮箱列表，请重新加载后再试。",
      details:
        '{\n  "error": "Request failed",\n  "details": "mailboxes offline"\n}',
    },
    mailboxes: [],
    messageStatsByMailbox: new Map(),
    onRetryList: fn(),
  },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    await userEvent.click(
      canvas.getByRole("button", { name: "重新加载邮箱列表" }),
    );
    await expect(args.onRetryList).toHaveBeenCalled();
  },
};
