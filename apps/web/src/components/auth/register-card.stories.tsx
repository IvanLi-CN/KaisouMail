import type { Meta, StoryObj } from "@storybook/react-vite";
import { MemoryRouter } from "react-router-dom";
import { expect, fn, userEvent, within } from "storybook/test";
import { RegisterCard } from "@/components/auth/register-card";
import { demoAuthProviders } from "@/mocks/data";

const meta = {
  title: "Auth/RegisterCard",
  component: RegisterCard,
  tags: ["autodocs"],
  decorators: [
    (Story) => (
      <MemoryRouter>
        <Story />
      </MemoryRouter>
    ),
  ],
  args: {
    onProviderRegister: fn(),
    onPasskeyStart: fn(),
    isPending: false,
    error: null,
    passkeySupported: true,
    providers: demoAuthProviders,
  },
} satisfies Meta<typeof RegisterCard>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    await userEvent.click(
      canvas.getByRole("button", { name: "使用 GitHub 继续" }),
    );
    await expect(args.onProviderRegister).toHaveBeenCalled();
  },
};

export const WithInviteCode: Story = {
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    await userEvent.type(
      canvas.getByLabelText("邀请码（如需）"),
      "km_story_invite",
    );
    await userEvent.click(
      canvas.getByRole("button", { name: "使用 LinuxDO 继续" }),
    );
    await expect(args.onProviderRegister).toHaveBeenCalledWith("linuxdo", {
      inviteCode: "km_story_invite",
    });
  },
};
