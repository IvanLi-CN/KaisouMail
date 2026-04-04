import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, fn, userEvent, within } from "storybook/test";

import { MessageRefreshControl } from "@/components/messages/message-refresh-control";

const meta = {
  title: "Messages/MessageRefreshControl",
  component: MessageRefreshControl,
  tags: ["autodocs"],
  args: {
    isRefreshing: false,
    lastRefreshedAt: new Date("2026-04-04T09:12:00.000Z").getTime(),
    onRefresh: fn(),
  },
} satisfies Meta<typeof MessageRefreshControl>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Resting: Story = {
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);

    await expect(
      canvas.getByText(/更新于 09:12:00|更新于 17:12:00/),
    ).toBeInTheDocument();
    await userEvent.click(canvas.getByRole("button", { name: "手动刷新" }));
    await expect(args.onRefresh).toHaveBeenCalled();
  },
};

export const Refreshing: Story = {
  args: {
    isRefreshing: true,
  },
};

export const InitialSync: Story = {
  args: {
    lastRefreshedAt: null,
  },
};
