import type { Meta, StoryObj } from "@storybook/react-vite";
import { fn } from "storybook/test";

import { AppShell } from "@/components/layout/app-shell";
import {
  demoMailboxes,
  demoMessages,
  demoSessionUser,
  demoVersion,
} from "@/mocks/data";
import { MailboxDetailPageView } from "@/pages/mailbox-detail-page";

const mailbox = demoMailboxes[0];
const messageStatsByMailbox = new Map([
  [
    mailbox.id,
    {
      unread: demoMessages.filter((message) => message.mailboxId === mailbox.id)
        .length,
      total: demoMessages.filter((message) => message.mailboxId === mailbox.id)
        .length,
    },
  ],
]);

const meta = {
  title: "Pages/Mailbox Detail",
  component: MailboxDetailPageView,
  tags: ["autodocs"],
  args: {
    mailbox,
    messageStatsByMailbox,
    isLoading: false,
    error: null,
    onRetry: fn(),
    onDestroy: fn(),
    isRefreshing: false,
    lastRefreshedAt: new Date("2026-04-04T09:12:00.000Z").getTime(),
    workspaceHref: `/workspace?mailbox=${mailbox.id}`,
  },
  render: (args) => (
    <AppShell user={demoSessionUser} version={demoVersion} onLogout={fn()}>
      <MailboxDetailPageView {...args} />
    </AppShell>
  ),
} satisfies Meta<typeof MailboxDetailPageView>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Overview: Story = {};

export const Loading: Story = {
  args: {
    mailbox: null,
    messageStatsByMailbox: new Map(),
    isLoading: true,
  },
};

export const RecoverableError: Story = {
  args: {
    mailbox: null,
    messageStatsByMailbox: new Map(),
    error: {
      variant: "recoverable",
      title: "邮箱详情加载失败",
      description: "暂时无法加载邮箱状态与统计信息，请重试。",
      details:
        '{\n  "error": "Request failed",\n  "details": "mailbox offline"\n}',
    },
  },
};
