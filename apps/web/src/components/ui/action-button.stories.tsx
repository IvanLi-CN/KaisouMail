import type { Meta, StoryObj } from "@storybook/react-vite";
import { Download, PanelsTopLeft, Trash2 } from "lucide-react";
import { expect, fn, userEvent, within } from "storybook/test";

import { ActionButton } from "@/components/ui/action-button";

const meta = {
  title: "UI/ActionButton",
  component: ActionButton,
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
    icon: PanelsTopLeft,
    label: "打开工作台",
    onClick: fn(),
    priority: "secondary",
    variant: "outline",
  },
} satisfies Meta<typeof ActionButton>;

export default meta;

type Story = StoryObj<typeof meta>;

export const RegularLabelButton: Story = {
  args: {
    density: "default",
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(
      canvas.getByRole("button", { name: "打开工作台" }),
    ).toBeInTheDocument();
  },
};

export const DenseIconButton: Story = {
  args: {
    density: "dense",
    icon: Download,
    label: "下载 Raw EML",
    size: "sm",
    tooltipDelayDuration: 0,
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const button = canvas.getByRole("button", { name: "下载 Raw EML" });

    await userEvent.hover(button);

    await expect(
      await within(canvasElement.ownerDocument.body).findByRole("tooltip"),
    ).toHaveTextContent("下载 Raw EML");
  },
};

export const DenseDestructiveIconButton: Story = {
  args: {
    density: "dense",
    icon: Trash2,
    label: "销毁邮箱",
    tooltipDelayDuration: 0,
    variant: "destructive",
  },
};

export const IntentShowcase: Story = {
  parameters: {
    layout: "fullscreen",
  },
  render: () => (
    <div className="min-h-screen bg-background px-8 py-10 text-foreground">
      <div className="mx-auto max-w-5xl space-y-8 rounded-[28px] border border-border bg-card/90 p-8">
        <div className="space-y-3">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">
            Button Intent Guide
          </p>
          <div className="space-y-2">
            <h1 className="text-3xl font-semibold tracking-tight">
              高级按钮的使用意图
            </h1>
            <p className="max-w-3xl text-sm leading-6 text-muted-foreground">
              默认用图标 +
              文字表达主要动作；在工具栏、表格行和高密度列表里，次级动作收敛为图标按钮，并用
              tooltip
              补足语义。危险动作始终保持高辨识度，不和普通次级动作混在一起。
            </p>
          </div>
        </div>

        <div className="grid gap-4 xl:grid-cols-3">
          <section className="space-y-4 rounded-2xl border border-border bg-muted/10 p-5">
            <div className="space-y-2">
              <h2 className="text-base font-semibold">主路径动作</h2>
              <p className="text-sm leading-6 text-muted-foreground">
                页面级主入口和关键跳转，优先使用图标 + 文字，避免用户猜测。
              </p>
            </div>
            <div className="flex flex-wrap gap-3">
              <ActionButton
                density="default"
                icon={PanelsTopLeft}
                label="打开工作台"
                priority="secondary"
                variant="outline"
              />
              <ActionButton
                density="default"
                icon={Trash2}
                label="销毁邮箱"
                priority="primary"
                variant="destructive"
              />
            </div>
          </section>

          <section className="space-y-4 rounded-2xl border border-border bg-muted/10 p-5">
            <div className="space-y-2">
              <h2 className="text-base font-semibold">高密度次级动作</h2>
              <p className="text-sm leading-6 text-muted-foreground">
                表格行、三栏工作台和紧凑工具区只保留图标按钮，语义通过悬浮 /
                长按 tooltip 补齐。
              </p>
            </div>
            <div className="flex min-h-[104px] flex-wrap items-end gap-3 pt-8">
              <ActionButton
                density="dense"
                icon={Download}
                label="下载 Raw EML"
                priority="secondary"
                size="sm"
                tooltipDelayDuration={0}
                variant="outline"
              />
              <ActionButton
                density="dense"
                icon={PanelsTopLeft}
                label="在工作台打开"
                priority="secondary"
                size="sm"
                tooltipDelayDuration={0}
                variant="outline"
              />
            </div>
          </section>

          <section className="space-y-4 rounded-2xl border border-border bg-muted/10 p-5">
            <div className="space-y-2">
              <h2 className="text-base font-semibold">受限与危险动作</h2>
              <p className="text-sm leading-6 text-muted-foreground">
                不可用状态也要保留意图提示；危险操作在高密度下仍允许
                icon-only，但必须有 tooltip。
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <ActionButton
                density="dense"
                disabled
                icon={PanelsTopLeft}
                label="已销毁邮箱不可打开"
                priority="secondary"
                size="sm"
                tooltipDelayDuration={0}
                variant="outline"
              />
              <ActionButton
                density="dense"
                icon={Trash2}
                label="销毁邮箱"
                priority="secondary"
                size="sm"
                tooltipDelayDuration={0}
                variant="destructive"
              />
            </div>
          </section>
        </div>
      </div>
    </div>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.hover(canvas.getByRole("button", { name: "下载 Raw EML" }));
    await expect(
      await within(canvasElement.ownerDocument.body).findByRole("tooltip"),
    ).toHaveTextContent("下载 Raw EML");
  },
};
