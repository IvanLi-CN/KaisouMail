import type { Meta, StoryObj } from "@storybook/react-vite";
import * as React from "react";
import { expect, userEvent, within } from "storybook/test";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ButtonGroup } from "@/components/ui/button-group";
import { cn } from "@/lib/utils";

const meta = {
  title: "UI/ButtonGroup",
  component: ButtonGroup,
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
} satisfies Meta<typeof ButtonGroup>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Basic: Story = {
  render: () => (
    <ButtonGroup aria-label="消息操作">
      <Button variant="outline">Archive</Button>
      <Button variant="outline">Report</Button>
      <Button variant="outline">Snooze</Button>
    </ButtonGroup>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);

    await expect(
      canvas.getByRole("group", { name: "消息操作" }),
    ).toBeInTheDocument();
    await expect(
      canvas.getByRole("button", { name: "Archive" }),
    ).toBeInTheDocument();
  },
};

export const WorkspaceViewSwitch: Story = {
  render: function Render() {
    const [view, setView] = React.useState<"active" | "trash">("trash");
    const options = [
      { value: "active" as const, label: "工作区" },
      { value: "trash" as const, label: "回收站", badge: 1 },
    ];

    return (
      <ButtonGroup aria-label="邮箱视图">
        {options.map((option) => {
          const selected = view === option.value;

          return (
            <Button
              aria-pressed={selected}
              className={cn(
                "h-9 cursor-pointer text-xs font-semibold transition-[background-color,border-color,color,box-shadow] duration-200",
                selected &&
                  "z-10 border-[#93c5fd] bg-[#60a5fa] text-[#07111f] shadow-[inset_0_0_0_1px_rgba(7,17,31,0.14),0_0_0_1px_rgba(147,197,253,0.42),0_0_14px_rgba(96,165,250,0.24)] hover:bg-[#60a5fa]",
              )}
              key={option.value}
              onClick={() => setView(option.value)}
              size="sm"
              variant={selected ? "default" : "outline"}
            >
              {option.label}
              {option.badge !== undefined ? (
                <Badge
                  className={cn(
                    "ml-1 min-w-5 justify-center px-1.5 py-0 text-[0.625rem] leading-4 tracking-normal",
                    selected
                      ? "border-[#07111f]/20 bg-[#07111f]/10 text-[#07111f]"
                      : "bg-background/60 text-muted-foreground",
                  )}
                >
                  {option.badge}
                </Badge>
              ) : null}
            </Button>
          );
        })}
      </ButtonGroup>
    );
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);

    await expect(
      canvas.getByRole("group", { name: "邮箱视图" }),
    ).toBeInTheDocument();
    await expect(
      canvas.getByRole("button", { name: "回收站 1" }),
    ).toHaveAttribute("aria-pressed", "true");
    await userEvent.click(canvas.getByRole("button", { name: "工作区" }));
    await expect(
      canvas.getByRole("button", { name: "工作区" }),
    ).toHaveAttribute("aria-pressed", "true");
  },
};
