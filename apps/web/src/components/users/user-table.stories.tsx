import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, fn, userEvent, within } from "storybook/test";

import { UserTable } from "@/components/users/user-table";
import {
  demoAdminUsers,
  demoInvites,
  demoRegistrationSettings,
  demoSessionUser,
} from "@/mocks/data";

const meta = {
  title: "Users/UserTable",
  component: UserTable,
  tags: ["autodocs"],
  args: {
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
} satisfies Meta<typeof UserTable>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {},
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getAllByText("@ivan").length).toBeGreaterThan(0);
    await expect(canvas.getByText("km_demo_invite_1")).toBeInTheDocument();
  },
};

export const CreateInvite: Story = {
  args: {
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
    await userEvent.type(canvas.getByLabelText("数量"), "12");
    await userEvent.click(
      canvas.getByRole("button", { name: "批量生成邀请码" }),
    );
    await expect(args.onCreateInvite).toHaveBeenCalled();
  },
};

export const TransferAdminDialog: Story = {
  args: {
    currentAdmin: {
      user: demoSessionUser,
      externalAccounts: demoAdminUsers[0]?.externalAccounts ?? [],
      hasPasskeys: (demoAdminUsers[0]?.passkeyCount ?? 0) > 0,
    },
    pendingTransferVerification: {
      verificationToken: "demo-transfer-verification:usr_demo_member:github",
      targetUserId: "usr_demo_member",
      method: "github",
    },
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText("已通过 GitHub 验证")).toBeInTheDocument();
    await expect(
      canvas.getByRole("button", { name: "确认转移管理员" }),
    ).toBeEnabled();
  },
};
