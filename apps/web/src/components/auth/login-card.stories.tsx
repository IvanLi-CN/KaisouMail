import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, fn, userEvent, within } from "storybook/test";

import { LoginCard } from "@/components/auth/login-card";

const meta = {
  title: "Auth/LoginCard",
  component: LoginCard,
  tags: ["autodocs"],
  args: {
    onSubmit: fn(),
    error: null,
  },
} satisfies Meta<typeof LoginCard>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    await userEvent.type(
      canvas.getByLabelText("API Key"),
      "cfm_storybook_login_key",
    );
    await userEvent.click(canvas.getByRole("button", { name: "登录控制台" }));
    await expect(args.onSubmit).toHaveBeenCalled();
  },
};

export const ErrorState: Story = {
  args: {
    error: "Invalid API key",
  },
};
