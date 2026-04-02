import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, fn, userEvent, within } from "storybook/test";

import { MailWorkspace } from "@/components/workspace/mail-workspace";
import { demoMailboxes, demoMessageDetails, demoMessages } from "@/mocks/data";

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
    visibleMailboxes: demoMailboxes,
    totalMailboxCount: demoMailboxes.length,
    totalMessageCount: demoMessages.length,
    totalAggregatedMessageCount: demoMessages.length,
    mailboxMessageCounts: new Map([
      ["mbx_alpha", 1],
      ["mbx_beta", 1],
      ["mbx_gamma", 0],
    ]),
    selectedMailboxId: "all",
    selectedMailbox: null,
    messages: demoMessages,
    selectedMessageId: demoMessages[0]?.id ?? null,
    selectedMessage: demoMessageDetails.msg_alpha,
    searchQuery: "",
    sortMode: "recent",
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

export const AllMailboxes: Story = {
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    await expect(
      canvas.getByRole("heading", { name: "邮件工作台" }),
    ).toBeInTheDocument();
    await expect(
      canvas.getByRole("button", { name: /全部邮箱/i }),
    ).toBeInTheDocument();

    await userEvent.click(
      canvas.getByRole("button", { name: /spec@ops\.beta\.707979\.xyz/i }),
    );
    await expect(args.onSelectMailbox).toHaveBeenCalledWith("mbx_beta");

    await userEvent.click(
      canvas.getByRole("button", { name: /Spec review notes/i }),
    );
    await expect(args.onSelectMessage).toHaveBeenCalledWith("msg_beta");

    await expect(
      canvas.getByRole("button", { name: /qa@team\.gamma/i }),
    ).toBeDisabled();
    await expect(canvas.queryByText(/destroyed/i)).not.toBeInTheDocument();
    await expect(
      canvas.queryByText(/创建于|最近收信|过期时间/i),
    ).not.toBeInTheDocument();
    await expect(
      canvas.getByRole("button", { name: /spec@ops\.beta\.707979\.xyz 1/i }),
    ).toBeInTheDocument();
  },
};

export const SingleMailbox: Story = {
  args: {
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
    selectedMailboxId: "mbx_gamma",
    selectedMailbox: demoMailboxes[2],
    messages: [],
    totalMessageCount: 0,
    selectedMessageId: null,
    selectedMessage: null,
    messageDetailHref: null,
  },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    await userEvent.type(canvas.getByLabelText("搜索邮箱"), "nomatch");
    await expect(args.onSearchQueryChange).toHaveBeenCalled();
    await expect(canvas.getByText("当前范围内还没有邮件")).toBeInTheDocument();
  },
};

export const SearchEmptyState: Story = {
  args: {
    visibleMailboxes: [],
    searchQuery: "zzz",
    selectedMailboxId: "all",
    selectedMailbox: null,
    selectedMessageId: null,
    selectedMessage: null,
    messageDetailHref: null,
  },
};
