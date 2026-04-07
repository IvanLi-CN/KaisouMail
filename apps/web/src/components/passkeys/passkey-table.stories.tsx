import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, fn, userEvent, within } from "storybook/test";

import { PasskeyTable } from "@/components/passkeys/passkey-table";
import { demoPasskeys } from "@/mocks/data";

const meta = {
  title: "Security/PasskeyTable",
  component: PasskeyTable,
  tags: ["autodocs"],
  args: {
    passkeys: demoPasskeys,
    passkeySupported: true,
    isPending: false,
    error: null,
    onCreate: fn(),
    onRevoke: fn(),
  },
} satisfies Meta<typeof PasskeyTable>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    await userEvent.type(canvas.getByLabelText("设备名称"), "QA Mac mini");
    await userEvent.click(canvas.getByRole("button", { name: "注册当前设备" }));
    await expect(args.onCreate).toHaveBeenCalledWith("QA Mac mini");
  },
};

export const Unsupported: Story = {
  args: {
    passkeySupported: false,
  },
};
