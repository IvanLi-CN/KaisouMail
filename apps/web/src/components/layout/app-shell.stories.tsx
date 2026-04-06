import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, within } from "storybook/test";

import { AppShell } from "@/components/layout/app-shell";
import { PageHeader } from "@/components/shared/page-header";
import { StatGrid } from "@/components/shared/stat-grid";
import { projectMeta } from "@/lib/project-meta";
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
          description="顶部横向导航 + 三栏邮件工作台的默认壳层。"
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

export const Default: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(
      canvas.getByRole("link", { name: /工作台/i }),
    ).toBeInTheDocument();
    await expect(
      canvas.getByRole("link", { name: /邮箱管理/i }),
    ).toBeInTheDocument();
    await expect(
      canvas.getByRole("link", { name: /域名/i }),
    ).toBeInTheDocument();
    await expect(
      canvas.getByRole("button", { name: "退出登录" }),
    ).toBeInTheDocument();
  },
};

export const FooterMetadata: Story = {
  render: (args) => (
    <AppShell {...args}>
      <div className="space-y-4 p-2">
        <PageHeader
          eyebrow="Overview"
          title="认证态页脚验收"
          description="短页面下的壳层会把项目元信息页脚稳定压到视口底部。"
        />
      </div>
    </AppShell>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const footer = canvas.getByRole("contentinfo");

    await expect(footer).toBeInTheDocument();
    await expect(
      within(footer).getByRole("link", { name: projectMeta.repositoryLabel }),
    ).toHaveAttribute("href", projectMeta.repositoryUrl);
    await expect(
      within(footer).getByRole("link", { name: projectMeta.developerName }),
    ).toHaveAttribute("href", projectMeta.developerUrl);
    await expect(
      within(footer).getByRole("link", {
        name: `Version ${demoVersion.version}`,
      }),
    ).toHaveAttribute("href", projectMeta.versionUrl);
    await expect(
      canvas.queryByText("Manage inbox lifecycle, messages, and API access."),
    ).not.toBeInTheDocument();
    await expect(
      canvas.queryByText(demoVersion.commitSha),
    ).not.toBeInTheDocument();
    await expect(
      canvas.queryByText(demoVersion.branch),
    ).not.toBeInTheDocument();
  },
};
