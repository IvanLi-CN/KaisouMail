import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, fn, userEvent, within } from "storybook/test";

import { RegisterCompleteCard } from "@/components/auth/register-complete-card";

const meta = {
  title: "Auth/RegisterCompleteCard",
  component: RegisterCompleteCard,
  tags: ["autodocs"],
  args: {
    onSubmit: fn(),
    error: null,
    isPending: false,
    registration: {
      token: "pending_github",
      method: "github",
      sourceIntent: "register",
      redirectTo: "/workspace",
      inviteRequired: false,
      invitePrevalidated: false,
      canComplete: true,
      suggestedNickname: "Ivan Owner",
      error: null,
    },
  },
} satisfies Meta<typeof RegisterCompleteCard>;

export default meta;

type Story = StoryObj<typeof meta>;

export const ExternalProvider: Story = {
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    await userEvent.clear(canvas.getByLabelText("昵称"));
    await userEvent.type(canvas.getByLabelText("昵称"), "Ivan Owner");
    await userEvent.click(
      canvas.getByRole("button", { name: "完成注册并创建账号" }),
    );
    await expect(args.onSubmit).toHaveBeenCalled();
  },
};

export const InviteRequiredError: Story = {
  args: {
    error: { fields: { inviteCode: "请输入邀请码。" } },
    registration: {
      token: "pending_github",
      method: "github",
      sourceIntent: "register",
      redirectTo: "/workspace",
      inviteRequired: true,
      invitePrevalidated: false,
      canComplete: true,
      suggestedNickname: "Ivan Owner",
      error: null,
    },
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByLabelText("邀请码")).toHaveAttribute(
      "aria-invalid",
      "true",
    );
    await expect(canvas.getByText("请输入邀请码。")).toBeInTheDocument();
  },
};

export const InviteInvalidError: Story = {
  args: {
    error: { fields: { inviteCode: "邀请码无效，请检查后重试。" } },
    registration: {
      token: "pending_github",
      method: "github",
      sourceIntent: "register",
      redirectTo: "/workspace",
      inviteRequired: true,
      invitePrevalidated: false,
      canComplete: true,
      suggestedNickname: "Ivan Owner",
      error: null,
    },
  },
};

export const NicknameRequiredError: Story = {
  args: {
    error: { fields: { nickname: "请输入昵称。" } },
  },
};

export const RegistrationExpired: Story = {
  args: {
    error: { form: "注册状态已失效，请返回注册页重新开始。" },
    registration: {
      token: "expired_github",
      method: "github",
      sourceIntent: "register",
      redirectTo: "/workspace",
      inviteRequired: false,
      invitePrevalidated: false,
      canComplete: false,
      suggestedNickname: null,
      error: null,
    },
  },
};

export const PasskeyInvite: Story = {
  args: {
    registration: {
      token: "pending_passkey",
      method: "passkey",
      sourceIntent: "register",
      redirectTo: "/workspace",
      inviteRequired: true,
      invitePrevalidated: false,
      canComplete: true,
      suggestedNickname: null,
      error: null,
    },
  },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    await userEvent.type(canvas.getByLabelText("邀请码"), "km_story_invite");
    await userEvent.type(canvas.getByLabelText("昵称"), "Ivan Owner");
    await userEvent.clear(canvas.getByLabelText("设备名称"));
    await userEvent.type(canvas.getByLabelText("设备名称"), "Primary Passkey");
    await userEvent.click(
      canvas.getByRole("button", { name: "完成注册并保存 Passkey" }),
    );
    await expect(args.onSubmit).toHaveBeenCalled();
  },
};
