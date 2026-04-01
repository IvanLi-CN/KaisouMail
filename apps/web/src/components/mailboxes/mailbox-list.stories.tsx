import type { Meta, StoryObj } from "@storybook/react-vite";
import { fn } from "storybook/test";

import { MailboxList } from "@/components/mailboxes/mailbox-list";
import { demoMailboxes } from "@/mocks/data";

const meta = {
  title: "Mailboxes/MailboxList",
  component: MailboxList,
  tags: ["autodocs"],
  args: {
    mailboxes: demoMailboxes,
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
