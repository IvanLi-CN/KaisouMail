import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, fn, userEvent, within } from "storybook/test";

import { MailboxCreateCard } from "@/components/mailboxes/mailbox-create-card";
import { RANDOM_ROOT_DOMAIN_OPTION_LABEL } from "@/components/mailboxes/mailbox-create-preview";

const meta = {
  title: "Mailboxes/MailboxCreateCard",
  component: MailboxCreateCard,
  tags: ["autodocs"],
  args: {
    onSubmit: fn(),
    isPending: false,
    domains: ["relay.example.test", "mail.example.net"],
    defaultTtlMinutes: 60,
    maxTtlMinutes: 1440,
    isMetaLoading: false,
  },
} satisfies Meta<typeof MailboxCreateCard>;

export default meta;

type Story = StoryObj<typeof meta>;

export const RandomDefault: Story = {
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    const rootDomainField = canvas.getByLabelText(
      "邮箱域名",
    ) as HTMLSelectElement;
    await expect(rootDomainField.value).toBe("");
    expect(
      (
        within(rootDomainField).getByRole("option", {
          name: RANDOM_ROOT_DOMAIN_OPTION_LABEL,
        }) as HTMLOptionElement
      ).selected,
    ).toBe(true);
    await expect(
      canvas.getByText("ava-lin@desk.hub.<随机 active 域名>"),
    ).toBeInTheDocument();
    await userEvent.click(canvas.getByRole("button", { name: "创建邮箱" }));
    await expect(args.onSubmit).toHaveBeenCalledWith({
      expiresInMinutes: 60,
    });
  },
};

export const ManualDomainSelected: Story = {
  args: {},
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    await userEvent.type(canvas.getByLabelText("用户名"), "nightly");
    await userEvent.type(canvas.getByLabelText("子域名"), "ops.alpha");
    await userEvent.selectOptions(
      canvas.getByLabelText("邮箱域名"),
      "mail.example.net",
    );
    await expect(
      canvas.getByText("nightly@ops.alpha.mail.example.net"),
    ).toBeInTheDocument();
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
    domains: ["relay.example.test", "mail.example.net"],
  },
};

export const LoadingMeta: Story = {
  args: {
    isMetaLoading: true,
    domains: ["relay.example.test", "mail.example.net"],
  },
};

export const CustomDomain: Story = {
  args: {
    domains: ["mail.example.net", "ops.example.org"],
    defaultTtlMinutes: 120,
    maxTtlMinutes: 720,
  },
};

export const NoActiveDomains: Story = {
  args: {
    domains: [],
  },
};
