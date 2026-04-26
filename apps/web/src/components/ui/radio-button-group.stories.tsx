import type { Meta, StoryObj } from "@storybook/react-vite";
import * as React from "react";
import { expect, fn, userEvent, within } from "storybook/test";

import { RadioButtonGroup } from "@/components/ui/radio-button-group";

const meta = {
  title: "UI/RadioButtonGroup",
  component: RadioButtonGroup,
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
    name: "mailbox-view-story",
    onValueChange: fn(),
    options: [
      { value: "active", label: "工作区" },
      { value: "trash", label: "回收站", badge: 1 },
    ],
    value: "trash",
  },
} satisfies Meta<typeof RadioButtonGroup>;

export default meta;

type Story = StoryObj<typeof meta>;

export const SelectedWithBadge: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);

    await expect(canvas.getByRole("radio", { name: "回收站 1" })).toBeChecked();
    await expect(
      canvas.getByRole("radio", { name: "工作区" }),
    ).not.toBeChecked();
  },
};

export const Switchable: Story = {
  render: function Render(args) {
    const [value, setValue] = React.useState<"active" | "trash">("active");

    return (
      <RadioButtonGroup
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

    await expect(canvas.getByRole("radio", { name: "工作区" })).toBeChecked();
    await userEvent.click(canvas.getByRole("radio", { name: "回收站 1" }));
    await expect(canvas.getByRole("radio", { name: "回收站 1" })).toBeChecked();
  },
};
