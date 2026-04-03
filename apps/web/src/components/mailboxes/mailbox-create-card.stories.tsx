import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, fn, userEvent, within } from "storybook/test";

import { MailboxCreateCard } from "@/components/mailboxes/mailbox-create-card";

const meta = {
  title: "Mailboxes/MailboxCreateCard",
  component: MailboxCreateCard,
  tags: ["autodocs"],
  args: {
    onSubmit: fn(),
    isPending: false,
    rootDomain: "707979.xyz",
    defaultTtlMinutes: 60,
    maxTtlMinutes: 1440,
    isMetaLoading: false,
  },
} satisfies Meta<typeof MailboxCreateCard>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    await userEvent.type(canvas.getByLabelText("用户名"), "nightly");
    await userEvent.type(canvas.getByLabelText("子域名"), "ops.alpha");
    await userEvent.clear(canvas.getByLabelText("生命周期（分钟）"));
    await userEvent.type(canvas.getByLabelText("生命周期（分钟）"), "90");
    await userEvent.click(canvas.getByRole("button", { name: "创建邮箱" }));
    await expect(args.onSubmit).toHaveBeenCalledWith({
      localPart: "nightly",
      subdomain: "ops.alpha",
      expiresInMinutes: 90,
    });
  },
};

export const Pending: Story = {
  args: {
    isPending: true,
  },
};

export const LoadingMeta: Story = {
  args: {
    isMetaLoading: true,
  },
};

export const MetaLoadFailed: Story = {
  args: {
    metaError: "Failed to load mailbox rules",
    rootDomain: undefined,
    defaultTtlMinutes: undefined,
    maxTtlMinutes: undefined,
  },
};
