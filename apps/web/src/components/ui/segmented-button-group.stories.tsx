import type { Meta, StoryObj } from "@storybook/react-vite";
import * as React from "react";
import { expect, fn, userEvent, within } from "storybook/test";

import { SegmentedButtonGroup } from "@/components/ui/segmented-button-group";

const meta = {
  title: "UI/SegmentedButtonGroup",
  component: SegmentedButtonGroup,
  tags: ["autodocs"],
  parameters: {
    layout: "centered",
  },
  decorators: [
    (Story) => (
      <div className="flex min-h-[180px] items-center justify-center rounded-2xl border border-border bg-card p-8">
        <Story />
      </div>
    ),
  ],
  args: {
    ariaLabel: "邮箱视图",
    onValueChange: fn(),
    options: [
      { value: "active", label: "工作区" },
      { value: "trash", label: "回收站", badge: 1 },
    ],
    value: "trash",
  },
} satisfies Meta<typeof SegmentedButtonGroup>;

export default meta;

type Story = StoryObj<typeof meta>;

export const SelectedWithBadge: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);

    await expect(
      canvas.getByRole("radio", { name: "回收站 1" }),
    ).toHaveAttribute("aria-checked", "true");
    await expect(canvas.getByRole("radio", { name: "工作区" })).toHaveAttribute(
      "aria-checked",
      "false",
    );
  },
};

export const Switchable: Story = {
  render: function Render(args) {
    const [value, setValue] = React.useState<"active" | "trash">("active");

    return (
      <SegmentedButtonGroup
        {...args}
        onValueChange={(nextValue) => {
          setValue(nextValue as "active" | "trash");
          args.onValueChange?.(nextValue);
        }}
        value={value}
      />
    );
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);

    await expect(canvas.getByRole("radio", { name: "工作区" })).toHaveAttribute(
      "aria-checked",
      "true",
    );
    await userEvent.click(canvas.getByRole("radio", { name: "回收站 1" }));
    await expect(
      canvas.getByRole("radio", { name: "回收站 1" }),
    ).toHaveAttribute("aria-checked", "true");
  },
};
