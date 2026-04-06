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
  },
  render: (args) => (
    <AppShell user={demoSessionUser} version={demoVersion} onLogout={fn()}>
      <MailboxesPageView {...args} />
    </AppShell>
  ),
} satisfies Meta<typeof MailboxesPageView>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Overview: Story = {};

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
    await userEvent.clear(canvas.getByLabelText("生命周期（分钟）"));
    await userEvent.type(canvas.getByLabelText("生命周期（分钟）"), "90");
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
      description:
        "域名与 TTL 元数据还没拿到，所以创建入口不会被误渲染成空表单。",
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
      description: "邮箱存续数据不可用，所以控制台不会把它误判成“暂无邮箱”。",
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
