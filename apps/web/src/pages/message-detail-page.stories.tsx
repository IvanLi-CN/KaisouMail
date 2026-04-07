import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, fn, userEvent, within } from "storybook/test";

import { AppShell } from "@/components/layout/app-shell";
import { demoMessageDetails, demoSessionUser, demoVersion } from "@/mocks/data";
import { MessageDetailPageView } from "@/pages/message-detail-page";

const meta = {
  title: "Pages/Message Detail",
  component: MessageDetailPageView,
  tags: ["autodocs"],
  args: {
    message: demoMessageDetails.msg_alpha,
    isLoading: false,
    error: null,
    onRetry: fn(),
    isRefreshing: false,
    lastRefreshedAt: new Date("2026-04-04T09:12:00.000Z").getTime(),
    mailboxHref: "/mailboxes",
    workspaceHref: "/workspace?mailbox=mbx_alpha&message=msg_alpha",
  },
  render: (args) => (
    <AppShell user={demoSessionUser} version={demoVersion} onLogout={fn()}>
      <MessageDetailPageView {...args} />
    </AppShell>
  ),
} satisfies Meta<typeof MessageDetailPageView>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Overview: Story = {};

export const NotFound: Story = {
  args: {
    message: null,
    error: {
      variant: "not-found",
      title: "这封邮件已经不可见了",
      description: "它可能已经被清理、迁移，或者当前会话无权继续查看。",
      details: '{\n  "error": "Message not found",\n  "details": null\n}',
    },
  },
};

export const RecoverableError: Story = {
  args: {
    message: null,
    error: {
      variant: "recoverable",
      title: "邮件详情加载失败",
      description: "暂时无法加载正文、附件和收件信息，请重试。",
      details:
        '{\n  "error": "Request failed",\n  "details": "blob timeout"\n}',
    },
  },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    await userEvent.click(
      canvas.getByRole("button", { name: "重新加载邮件详情" }),
    );
    await expect(args.onRetry).toHaveBeenCalled();
  },
};
