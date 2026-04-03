import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, fn, userEvent, within } from "storybook/test";

import { AppShell } from "@/components/layout/app-shell";
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
