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

const getRenderedKeyNames = (canvas: ReturnType<typeof within>) =>
  canvas
    .getAllByRole("row")
    .slice(1)
    .map((row: HTMLElement) => {
      const [nameCell] = within(row).getAllByRole("cell");
      return nameCell?.querySelector("p")?.textContent ?? "";
    });

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

export const PaginatedByLastUsed: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);

    await expect(canvas.getByText("第 1 / 2 页")).toBeInTheDocument();
    expect(getRenderedKeyNames(canvas)).toEqual([
      "Support Bridge",
      "Webhook Mirror",
      "ivan",
      "Docs Robot",
      "Deploy Bot",
      "Ops Console",
      "Nightly Sync",
      "Smoke Test Key",
      "Recovery API Key",
      "Audit Trail",
    ]);

    await userEvent.click(canvas.getByRole("button", { name: "下一页" }));

    await expect(canvas.getByText("第 2 / 2 页")).toBeInTheDocument();
    expect(getRenderedKeyNames(canvas)).toEqual([
      "Subdomain Sync",
      "CI Robot",
      "Bootstrap Admin",
    ]);
    await expect(canvas.getByRole("button", { name: "下一页" })).toBeDisabled();
  },
};

export const WithLatestSecret: Story = {
  args: {
    latestSecret: "cfm_demo_latest_secret_once",
  },
};
