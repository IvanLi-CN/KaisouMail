import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, fn, userEvent, within } from "storybook/test";

import { AppShell } from "@/components/layout/app-shell";
import { demoSessionUser, demoUsers, demoVersion } from "@/mocks/data";
import { UsersPageView } from "@/pages/users-page";

const meta = {
  title: "Pages/Users",
  component: UsersPageView,
  tags: ["autodocs"],
  args: {
    users: demoUsers,
    latestKey: null,
    onCreate: fn(),
  },
  render: (args) => (
    <AppShell user={demoSessionUser} version={demoVersion} onLogout={fn()}>
      <UsersPageView {...args} />
    </AppShell>
  ),
} satisfies Meta<typeof UsersPageView>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Overview: Story = {};

export const LoadError: Story = {
  args: {
    users: [],
    error: {
      variant: "recoverable",
      title: "用户目录加载失败",
      description: "多用户列表现在不可用，所以控制台不会把它误判成空白状态。",
      details:
        '{\n  "error": "Request failed",\n  "details": "users offline"\n}',
    },
    onRetry: fn(),
  },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    await userEvent.click(
      canvas.getByRole("button", { name: "重新加载用户列表" }),
    );
    await expect(args.onRetry).toHaveBeenCalled();
  },
};
