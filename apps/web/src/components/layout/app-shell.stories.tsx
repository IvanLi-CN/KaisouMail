import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, fn, userEvent, within } from "storybook/test";

import { AppShell } from "@/components/layout/app-shell";
import { PageHeader } from "@/components/shared/page-header";
import { StatGrid } from "@/components/shared/stat-grid";
import { projectMeta } from "@/lib/project-meta";
import { demoSessionUser, demoVersion } from "@/mocks/data";
import { projectViewportGlobals } from "@/storybook/viewports";

const meta = {
  title: "Layout/AppShell",
  component: AppShell,
  tags: ["autodocs"],
  parameters: {
    layout: "fullscreen",
    disableStoryPadding: true,
  },
  args: {
    user: demoSessionUser,
    version: demoVersion,
    onLogout: fn(),
    defaultAccountPopoverOpen: false,
    defaultMobileNavOpen: false,
  },
  render: (args) => (
    <AppShell {...args}>
      <div className="space-y-6 p-2">
        <PageHeader
          eyebrow="Overview"
          title="Cloudflare 临时邮箱台"
          description="查看收件概览与系统状态。"
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
const accountDetailsButtonName = `${demoSessionUser.nickname} 账号详情`;

export const DesktopOverview: Story = {
  globals: projectViewportGlobals.desktop,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const body = within(canvasElement.ownerDocument.body);

    await userEvent.hover(
      canvas.getByRole("button", { name: accountDetailsButtonName }),
    );

    await expect(
      await body.findByText(`@${demoSessionUser.username}`),
    ).toBeVisible();
    await expect(body.getByText(/^admin$/i)).toBeVisible();
  },
};

export const MobileDrawer: Story = {
  args: {
    defaultMobileNavOpen: true,
  },
  globals: projectViewportGlobals.mobile,
  play: async ({ canvasElement }) => {
    const body = within(canvasElement.ownerDocument.body);
    const drawer = body.getByRole("dialog", { name: "菜单" });

    await expect(
      within(drawer).getByText(`@${demoSessionUser.username}`),
    ).toBeVisible();
    await expect(
      within(drawer).getByRole("button", { name: "退出登录" }),
    ).toBeVisible();
  },
};

export const FooterMetadata: Story = {
  globals: projectViewportGlobals.desktop,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const footer = canvas.getByRole("contentinfo");

    await expect(
      within(footer).getByRole("link", { name: projectMeta.repositoryLabel }),
    ).toHaveAttribute("href", projectMeta.repositoryUrl);
  },
};
