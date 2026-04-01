import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, fn, userEvent, within } from "storybook/test";

import { ApiKeyTable } from "@/components/api-keys/api-key-table";
import { demoApiKeys } from "@/mocks/data";

const meta = {
  title: "Security/ApiKeyTable",
  component: ApiKeyTable,
  tags: ["autodocs"],
  args: {
    apiKeys: demoApiKeys,
    latestSecret: null,
    onCreate: fn(),
    onRevoke: fn(),
  },
} satisfies Meta<typeof ApiKeyTable>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    await userEvent.type(canvas.getByLabelText("名称"), "CI bot");
    await userEvent.click(canvas.getByRole("button", { name: "生成 Key" }));
    await expect(args.onCreate).toHaveBeenCalledWith({
      name: "CI bot",
      scopes: ["mailboxes:write", "messages:read"],
    });
  },
};

export const WithLatestSecret: Story = {
  args: {
    latestSecret: "cfm_demo_latest_secret_once",
  },
};
