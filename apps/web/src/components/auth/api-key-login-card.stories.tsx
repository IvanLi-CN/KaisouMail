import type { Meta, StoryObj } from "@storybook/react-vite";
import { MemoryRouter } from "react-router-dom";
import { expect, fn, userEvent, within } from "storybook/test";

import { ApiKeyLoginCard } from "@/components/auth/api-key-login-card";

const meta = {
  title: "Auth/ApiKeyLoginCard",
  component: ApiKeyLoginCard,
  tags: ["autodocs"],
  decorators: [
    (Story) => (
      <MemoryRouter>
        <Story />
      </MemoryRouter>
    ),
  ],
  args: {
    onSubmit: fn(),
    isPending: false,
    error: null,
  },
} satisfies Meta<typeof ApiKeyLoginCard>;

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
    await expect(args.onSubmit).toHaveBeenCalledWith({
      apiKey: "cfm_storybook_login_key",
    });
  },
};

export const ErrorState: Story = {
  args: {
    error: "Invalid API key",
  },
};
