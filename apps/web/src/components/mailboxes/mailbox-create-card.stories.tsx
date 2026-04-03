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
    domains: ["707979.xyz", "mail.example.net"],
    defaultTtlMinutes: 60,
    maxTtlMinutes: 1440,
    isMetaLoading: false,
  },
} satisfies Meta<typeof MailboxCreateCard>;

export default meta;

type Story = StoryObj<typeof meta>;

export const RandomDefault: Story = {};

export const Default: Story = {
  args: {},
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
    await expect(args.onSubmit).toHaveBeenCalledWith({
      localPart: "nightly",
      subdomain: "ops.alpha",
      rootDomain: "mail.example.net",
      expiresInMinutes: 90,
    });
  },
};

export const Pending: Story = {
  args: {
    isPending: true,
    domains: ["707979.xyz", "mail.example.net"],
  },
};

export const LoadingMeta: Story = {
  args: {
    isMetaLoading: true,
    domains: ["707979.xyz", "mail.example.net"],
  },
};

export const CustomDomain: Story = {
  args: {
    domains: ["mail.example.net", "ops.example.org"],
    defaultTtlMinutes: 120,
    maxTtlMinutes: 720,
  },
};
