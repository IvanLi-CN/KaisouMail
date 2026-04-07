import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, userEvent, waitFor, within } from "storybook/test";

import { AppShell } from "@/components/layout/app-shell";
import { PageHeader } from "@/components/shared/page-header";
import { StatGrid } from "@/components/shared/stat-grid";
import { projectMeta } from "@/lib/project-meta";
import { demoSessionUser, demoVersion } from "@/mocks/data";

const desktopViewport = {
  viewport: { value: "kaisouDesktop", isRotated: false },
} as const;

const tabletViewport = {
  viewport: { value: "kaisouTablet", isRotated: false },
} as const;

const mobileViewport = {
  viewport: { value: "kaisouMobile", isRotated: false },
} as const;

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
    onLogout: () => undefined,
    defaultAccountPopoverOpen: false,
    defaultMobileNavOpen: false,
  },
  render: (args) => (
    <AppShell {...args}>
      <div className="space-y-6 p-2">
        <PageHeader
          eyebrow="Overview"
          title="Cloudflare 临时邮箱台"
          description="宽平板开始让主导航贴到站点标题右边；小屏幕则收进汉堡菜单。"
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

export const DesktopInlineNav: Story = {
  globals: desktopViewport,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const body = within(canvasElement.ownerDocument.body);
    const accountTrigger = canvas.getByRole("button", {
      name: demoSessionUser.name,
    });

    await expect(
      canvas.getByRole("navigation", { name: "主导航" }),
    ).toBeInTheDocument();
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
      canvas.queryByRole("button", { name: "打开主导航" }),
    ).not.toBeInTheDocument();
    await expect(accountTrigger).toHaveAttribute("aria-expanded", "false");
    await expect(
      body.queryByText(demoSessionUser.email),
    ).not.toBeInTheDocument();
    await expect(body.queryByText(/^admin$/i)).not.toBeInTheDocument();

    await userEvent.hover(accountTrigger);

    await expect(await body.findByText(demoSessionUser.email)).toBeVisible();
    await expect(body.getByText(/^admin$/i)).toBeVisible();

    await userEvent.unhover(accountTrigger);

    await waitFor(() => {
      expect(body.queryByText(demoSessionUser.email)).not.toBeInTheDocument();
    });

    accountTrigger.focus();

    await waitFor(() => {
      expect(body.getByText(demoSessionUser.email)).toBeVisible();
    });

    await userEvent.keyboard("{Escape}");

    await waitFor(() => {
      expect(body.queryByText(demoSessionUser.email)).not.toBeInTheDocument();
    });
  },
};

export const TabletInlineNav: Story = {
  globals: tabletViewport,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);

    await expect(
      canvas.getByRole("navigation", { name: "主导航" }),
    ).toBeInTheDocument();
    await expect(
      canvas.getByRole("link", { name: /API Keys/i }),
    ).toBeInTheDocument();
    await expect(
      canvas.queryByRole("button", { name: "打开主导航" }),
    ).not.toBeInTheDocument();
    await expect(
      canvas.getByRole("button", { name: demoSessionUser.name }),
    ).toBeInTheDocument();
  },
};

export const MobileMenuOpen: Story = {
  args: {
    defaultMobileNavOpen: true,
  },
  globals: mobileViewport,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const body = within(canvasElement.ownerDocument.body);

    await expect(
      canvas.getByRole("button", { name: "关闭主导航" }),
    ).toBeInTheDocument();

    const mobileNav = body.getByRole("navigation", { name: "移动主导航" });
    await expect(
      within(mobileNav).getByRole("link", { name: /工作台/i }),
    ).toBeInTheDocument();
    await expect(
      within(mobileNav).getByRole("link", { name: /用户/i }),
    ).toBeInTheDocument();
  },
};

export const MobileMenuAccountSwitch: Story = {
  args: {
    defaultMobileNavOpen: true,
  },
  globals: mobileViewport,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const body = within(canvasElement.ownerDocument.body);
    const accountTrigger = canvas.getByRole("button", {
      name: demoSessionUser.name,
    });

    await expect(
      canvas.getByRole("button", { name: "关闭主导航" }),
    ).toBeInTheDocument();

    const mobileNav = body.getByRole("navigation", { name: "移动主导航" });
    await expect(
      within(mobileNav).getByRole("link", { name: /工作台/i }),
    ).toBeInTheDocument();

    await userEvent.click(accountTrigger);

    await waitFor(() => {
      expect(
        body.queryByRole("navigation", { name: "移动主导航" }),
      ).not.toBeInTheDocument();
    });
    await expect(await body.findByText(demoSessionUser.email)).toBeVisible();
  },
};

export const DetailsOpen: Story = {
  args: {
    defaultAccountPopoverOpen: true,
  },
  globals: desktopViewport,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const body = within(canvasElement.ownerDocument.body);

    await expect(
      canvas.getByRole("button", { name: demoSessionUser.name }),
    ).toHaveAttribute("aria-expanded", "true");
    await expect(await body.findByText(demoSessionUser.email)).toBeVisible();
    await expect(body.getByText(/^admin$/i)).toBeVisible();
  },
};

export const FooterMetadata: Story = {
  globals: desktopViewport,
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
