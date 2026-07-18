import type { Meta, StoryObj } from "@storybook/react-vite";
import { type ComponentProps, useEffect, useState } from "react";
import { MemoryRouter } from "react-router-dom";
import { expect, fn, userEvent, waitFor, within } from "storybook/test";

import { RegisterCompleteCard } from "@/components/auth/register-complete-card";
import type { PendingRegistration } from "@/lib/contracts";

const defaultRegistration = {
  token: "pending_github",
  method: "github",
  sourceIntent: "register",
  redirectTo: "/workspace",
  inviteRequired: false,
  invitePrevalidated: false,
  canComplete: true,
  suggestedNickname: "Ivan Owner",
  error: null,
} as const;

const AsyncSuggestedNicknameCard = ({
  registration,
  ...props
}: ComponentProps<typeof RegisterCompleteCard>) => {
  const [currentRegistration, setCurrentRegistration] =
    useState<PendingRegistration>({
      ...registration,
      suggestedNickname: null,
    });

  useEffect(() => {
    setCurrentRegistration({
      ...registration,
      suggestedNickname: null,
    });

    const timer = window.setTimeout(() => {
      setCurrentRegistration(registration);
    }, 0);

    return () => window.clearTimeout(timer);
  }, [registration]);

  return <RegisterCompleteCard {...props} registration={currentRegistration} />;
};

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
    registration: defaultRegistration,
  },
} satisfies Meta<typeof RegisterCompleteCard>;

export default meta;

type Story = StoryObj<typeof meta>;

export const ExternalProvider: Story = {
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByLabelText("昵称")).toHaveValue("Ivan Owner");
    await userEvent.clear(canvas.getByLabelText("昵称"));
    await userEvent.type(canvas.getByLabelText("昵称"), "Koha");
    await userEvent.click(canvas.getByRole("button", { name: "创建账号" }));
    await expect(args.onSubmit).toHaveBeenCalledWith({
      nickname: "Koha",
      inviteCode: "",
      passkeyName: "Primary Passkey",
    });
  },
};

export const AsyncSuggestedNickname: Story = {
  render: (args) => <AsyncSuggestedNicknameCard {...args} />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const nicknameInput = canvas.getByLabelText("昵称");
    await expect(nicknameInput).toHaveValue("");
    await waitFor(() => {
      expect(nicknameInput).toHaveValue("Ivan Owner");
    });
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
