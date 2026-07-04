import type { Meta, StoryObj } from "@storybook/react-vite";
import { MemoryRouter } from "react-router-dom";
import { expect, fn, userEvent, within } from "storybook/test";

import { RegisterCompleteCard } from "@/components/auth/register-complete-card";

const meta = {
  title: "Auth/RegisterCompleteCard",
  component: RegisterCompleteCard,
  tags: ["autodocs"],
  parameters: {
    disableMemoryRouter: true,
  },
  decorators: [
    (Story) => (
      <MemoryRouter>
        <Story />
      </MemoryRouter>
    ),
  ],
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
    await userEvent.click(canvas.getByRole("button", { name: "创建账号" }));
    await expect(args.onSubmit).toHaveBeenCalled();
  },
};

export const EmptyNickname: Story = {
  args: {
    registration: {
      token: "pending_empty_nickname",
      method: "github",
      sourceIntent: "register",
      redirectTo: "/workspace",
      inviteRequired: false,
      invitePrevalidated: false,
      canComplete: true,
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
      canvas.getByRole("button", { name: "使用 Passkey 创建账号" }),
    );
    await expect(args.onSubmit).toHaveBeenCalled();
  },
};
