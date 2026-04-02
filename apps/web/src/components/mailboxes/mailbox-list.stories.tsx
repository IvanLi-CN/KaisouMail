import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, fn, within } from "storybook/test";

import { MailboxList } from "@/components/mailboxes/mailbox-list";
import { demoMailboxes } from "@/mocks/data";

const meta = {
  title: "Mailboxes/MailboxList",
  component: MailboxList,
  tags: ["autodocs"],
  args: {
    mailboxes: demoMailboxes,
    messageStatsByMailbox: new Map([
      ["mbx_alpha", { unread: 1, total: 1 }],
      ["mbx_beta", { unread: 1, total: 1 }],
      ["mbx_gamma", { unread: 0, total: 0 }],
    ]),
    onDestroy: fn(),
  },
} satisfies Meta<typeof MailboxList>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const ActiveOnly: Story = {
  args: {
    mailboxes: demoMailboxes.filter((mailbox) => mailbox.status === "active"),
  },
};

export const IncludesDestroyed: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);

    await expect(canvas.getByText("未读 / 全部")).toBeInTheDocument();
    await expect(
      canvas.queryByText(/active|destroyed/i),
    ).not.toBeInTheDocument();
  },
};
