import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, fn, userEvent, within } from "storybook/test";

import { UserTable } from "@/components/users/user-table";
import { demoUsers } from "@/mocks/data";

const meta = {
  title: "Users/UserTable",
  component: UserTable,
  tags: ["autodocs"],
  args: {
    users: demoUsers,
    latestKey: null,
    onCreate: fn(),
  },
} satisfies Meta<typeof UserTable>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    await userEvent.type(canvas.getByLabelText("姓名"), "Koha");
    await userEvent.type(canvas.getByLabelText("邮箱"), "koha@example.com");
    await userEvent.selectOptions(canvas.getByLabelText("角色"), "admin");
    await userEvent.click(canvas.getByRole("button", { name: "创建用户" }));
    await expect(args.onCreate).toHaveBeenCalledWith({
      name: "Koha",
      email: "koha@example.com",
      role: "admin",
    });
  },
};

export const WithInitialKey: Story = {
  args: {
    latestKey: "cfm_initial_user_secret",
  },
};
