import type { Meta, StoryObj } from "@storybook/react-vite";

import { AppShell } from "@/components/layout/app-shell";
import { PageHeader } from "@/components/shared/page-header";
import { StatGrid } from "@/components/shared/stat-grid";
import { demoSessionUser, demoVersion } from "@/mocks/data";

const meta = {
  title: "Layout/AppShell",
  component: AppShell,
  tags: ["autodocs"],
  parameters: {
    layout: "fullscreen",
  },
  args: {
    user: demoSessionUser,
    version: demoVersion,
    onLogout: () => undefined,
  },
  render: (args) => (
    <AppShell {...args}>
      <div className="space-y-6 p-2">
        <PageHeader
          eyebrow="Overview"
          title="Cloudflare 临时邮箱台"
          description="Worker + D1 + R2 + Pages 的默认控制台布局。"
        />
        <StatGrid
          stats={[
            { label: "活跃邮箱", value: "2", hint: "当前还在收信" },
            { label: "待清理任务", value: "1", hint: "scheduled 会回收" },
            { label: "最近邮件", value: "12", hint: "含详情解析" },
          ]}
        />
      </div>
    </AppShell>
  ),
} satisfies Meta<typeof AppShell>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {};
