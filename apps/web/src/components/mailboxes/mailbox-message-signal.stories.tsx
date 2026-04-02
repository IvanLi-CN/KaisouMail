import type { Meta, StoryObj } from "@storybook/react-vite";

import { MailboxMessageSignal } from "@/components/mailboxes/mailbox-message-signal";

const meta = {
  title: "Mailboxes/MailboxMessageSignal",
  component: MailboxMessageSignal,
  tags: ["autodocs"],
  parameters: {
    layout: "centered",
  },
  decorators: [
    (Story) => (
      <div className="rounded-2xl border border-border bg-card p-8">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof MailboxMessageSignal>;

export default meta;

type Story = StoryObj<typeof meta>;

export const HasMessages: Story = {
  args: {
    hasMessages: true,
  },
};

export const NoMessages: Story = {
  args: {
    hasMessages: false,
  },
};

export const Destroyed: Story = {
  args: {
    hasMessages: false,
    disabled: true,
  },
};
