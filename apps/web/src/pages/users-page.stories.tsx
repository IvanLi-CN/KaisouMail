import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, fn, userEvent, within } from "storybook/test";

import { AppShell } from "@/components/layout/app-shell";
import {
  demoAdminUsers,
  demoInvites,
  demoRegistrationSettings,
  demoSessionUser,
  demoVersion,
} from "@/mocks/data";
import { UsersPageView } from "@/pages/users-page";

const meta = {
  title: "Pages/Users",
  component: UsersPageView,
  tags: ["autodocs"],
  args: {
    section: "users",
    users: demoAdminUsers,
    invites: demoInvites,
    settings: demoRegistrationSettings,
    currentAdminUserId: demoSessionUser.id,
    currentAdmin: {
      user: demoSessionUser,
      externalAccounts: demoAdminUsers[0]?.externalAccounts ?? [],
      hasPasskeys: (demoAdminUsers[0]?.passkeyCount ?? 0) > 0,
    },
    onCreateInvite: fn(),
    onDeleteInvite: fn(),
    onUpdateSettings: fn(),
    onTransferAdmin: fn(),
  },
  render: (args) => (
    <AppShell user={demoSessionUser} version={demoVersion} onLogout={fn()}>
      <UsersPageView {...args} />
    </AppShell>
  ),
} satisfies Meta<typeof UsersPageView>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Overview: Story = {
  args: {},
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getAllByText("@ivan").length).toBeGreaterThan(0);
    await expect(canvas.getByRole("button", { name: "用户" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
  },
};

export const InviteFlow: Story = {
  args: {
    section: "invites",
    currentAdmin: {
      user: demoSessionUser,
      externalAccounts: demoAdminUsers[0]?.externalAccounts ?? [],
      hasPasskeys: (demoAdminUsers[0]?.passkeyCount ?? 0) > 0,
    },
    onCreateInvite: fn(),
  },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    await userEvent.type(canvas.getByLabelText("备注"), "QA onboarding");
    await userEvent.clear(canvas.getByLabelText("数量"));
    await userEvent.type(canvas.getByLabelText("数量"), "6");
    await userEvent.click(
      canvas.getByRole("button", { name: "批量生成邀请码" }),
    );
    await expect(args.onCreateInvite).toHaveBeenCalled();
  },
};
