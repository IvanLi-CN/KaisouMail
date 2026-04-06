import type { Meta, StoryObj } from "@storybook/react-vite";
import { RefreshCw } from "lucide-react";
import { expect, fn, userEvent, within } from "storybook/test";

import { ErrorState } from "@/components/shared/error-state";
import { Button } from "@/components/ui/button";

const meta = {
  title: "Shared/ErrorState",
  component: ErrorState,
  tags: ["autodocs"],
  args: {
    variant: "recoverable",
    title: "运行时数据暂时不可用",
    description:
      "控制台已经把这次失败从空状态里分离出来，你可以直接重试，而不是面对一片误导性的空白。",
    details:
      '{\n  "error": "Request failed",\n  "details": {\n    "traceId": "trace_demo_404"\n  }\n}',
    primaryAction: (
      <Button onClick={fn()}>
        <RefreshCw className="mr-2 h-4 w-4" />
        重新尝试
      </Button>
    ),
    secondaryAction: <Button variant="outline">返回稳定入口</Button>,
  },
} satisfies Meta<typeof ErrorState>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Recoverable: Story = {};

export const NotFoundFullScreen: Story = {
  args: {
    variant: "not-found",
    layout: "fullScreen",
    title: "这个地址不存在",
    description:
      "控制台没有找到对应页面，但你还可以立刻跳回工作台继续处理邮件。",
  },
};

export const Permission: Story = {
  args: {
    variant: "permission",
    title: "当前身份没有访问权限",
    description: "请切回可访问页面，或使用具备权限的 API Key 重新登录。",
  },
};

export const FatalWithDetails: Story = {
  args: {
    variant: "fatal",
    layout: "fullScreen",
    title: "页面渲染异常已被拦截",
    description:
      "这次异常没有继续落到 React Router 默认错误页里，技术详情默认折叠，主视觉保持克制。",
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByText("查看技术详情"));
    await expect(canvas.getByText(/trace_demo_404/i)).toBeInTheDocument();
  },
};
