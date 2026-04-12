import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, fn, userEvent, waitFor, within } from "storybook/test";

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
const accountDetailsButtonName = `${demoSessionUser.name} 账号详情`;

export const ResponsiveCanvas: Story = {};

export const DesktopInlineNav: Story = {
  globals: projectViewportGlobals.desktop,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const body = within(canvasElement.ownerDocument.body);
    const navRow = canvasElement.querySelector('[data-slot="shell-nav-row"]');
    const brandRow = canvasElement.querySelector(
      '[data-slot="shell-brand-row"]',
    );
    const accountTrigger = canvas.getByRole("button", {
      name: accountDetailsButtonName,
    });
    const logoutButton = canvas.getByRole("button", { name: "退出登录" });
    const desktopNav = canvas.getByRole("navigation", { name: "主导航" });

    await expect(desktopNav).toBeInTheDocument();
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
      canvas.queryByRole("button", { name: "打开导航抽屉" }),
    ).not.toBeInTheDocument();
    await expect(navRow).toContainElement(desktopNav);
    await expect(brandRow).toContainElement(accountTrigger);
    await expect(brandRow).toContainElement(logoutButton);
    await expect(navRow).not.toContainElement(accountTrigger);
    await expect(accountTrigger).toHaveAttribute("aria-expanded", "false");
    await expect(
      canvas.queryByText(demoSessionUser.name),
    ).not.toBeInTheDocument();
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
  globals: projectViewportGlobals.tablet,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const navRow = canvasElement.querySelector('[data-slot="shell-nav-row"]');
    const brandRow = canvasElement.querySelector(
      '[data-slot="shell-brand-row"]',
    );
    const accountTrigger = canvas.getByRole("button", {
      name: accountDetailsButtonName,
    });
    const logoutButton = canvas.getByRole("button", { name: "退出登录" });
    const desktopNav = canvas.getByRole("navigation", { name: "主导航" });

    await expect(desktopNav).toBeInTheDocument();
    await expect(
      canvas.getByRole("link", { name: /API Keys/i }),
    ).toBeInTheDocument();
    await expect(
      canvas.queryByRole("button", { name: "打开导航抽屉" }),
    ).not.toBeInTheDocument();
    await expect(navRow).toContainElement(desktopNav);
    await expect(brandRow).toContainElement(accountTrigger);
    await expect(brandRow).toContainElement(logoutButton);
    await expect(navRow).not.toContainElement(accountTrigger);
    await expect(accountTrigger).toBeInTheDocument();
    await expect(
      canvas.queryByText(demoSessionUser.name),
    ).not.toBeInTheDocument();
    await expect(
      canvas.getByRole("button", { name: "退出登录" }),
    ).toBeInTheDocument();
  },
};

export const MobileHeaderCollapsed: Story = {
  globals: projectViewportGlobals.mobile,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const body = within(canvasElement.ownerDocument.body);
    const brandRow = canvasElement.querySelector(
      '[data-slot="shell-brand-row"]',
    );
    const drawerTrigger = canvas.getByRole("button", {
      name: "打开导航抽屉",
    });

    await expect(drawerTrigger).toBeInTheDocument();
    await expect(brandRow).toContainElement(drawerTrigger);
    await expect(
      canvasElement.querySelector('[data-slot="shell-mobile-trigger"]'),
    ).toBe(drawerTrigger);
    await expect(
      body.queryByRole("dialog", { name: "菜单" }),
    ).not.toBeInTheDocument();
  },
};

export const MobileDrawerOpen: Story = {
  args: {
    defaultMobileNavOpen: true,
  },
  globals: projectViewportGlobals.mobile,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const body = within(canvasElement.ownerDocument.body);

    await expect(
      canvas.getByRole("button", { name: "收起导航抽屉" }),
    ).toBeInTheDocument();

    const drawer = body.getByRole("dialog", { name: "菜单" });
    const mobileNav = within(drawer).getByRole("navigation", {
      name: "移动主导航",
    });

    await expect(
      within(drawer).getAllByText(demoSessionUser.email).at(0),
    ).toBeVisible();
    await expect(within(drawer).getByText(/^admin$/i)).toBeVisible();
    await expect(
      within(mobileNav).getByRole("link", { name: /工作台/i }),
    ).toBeInTheDocument();
    await expect(
      within(mobileNav).getByRole("link", { name: /用户/i }),
    ).toBeInTheDocument();
    await expect(
      within(drawer).getByRole("button", { name: "退出登录" }),
    ).toBeInTheDocument();
  },
};

export const ResponsiveDrawerOpen: Story = {
  args: {
    defaultMobileNavOpen: true,
  },
};

export const MobileDrawerToggle: Story = {
  globals: projectViewportGlobals.mobile,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const body = within(canvasElement.ownerDocument.body);
    const brandRow = canvasElement.querySelector(
      '[data-slot="shell-brand-row"]',
    );
    const drawerTrigger = canvas.getByRole("button", { name: "打开导航抽屉" });

    await expect(brandRow).toContainElement(drawerTrigger);
    await expect(
      canvasElement.querySelector('[data-slot="shell-mobile-trigger"]'),
    ).toBe(drawerTrigger);

    await userEvent.click(drawerTrigger);

    const drawer = await body.findByRole("dialog", { name: "菜单" });
    await expect(
      within(drawer).getAllByText(demoSessionUser.email).at(0),
    ).toBeVisible();

    await userEvent.click(
      within(drawer).getByRole("button", { name: "关闭导航抽屉" }),
    );

    await waitFor(() => {
      expect(
        body.queryByRole("dialog", { name: "菜单" }),
      ).not.toBeInTheDocument();
    });
  },
};

export const DetailsOpen: Story = {
  args: {
    defaultAccountPopoverOpen: true,
    onLogout: fn(),
  },
  globals: projectViewportGlobals.desktop,
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement);
    const body = within(canvasElement.ownerDocument.body);
    const logoutButton = canvas.getByRole("button", { name: "退出登录" });

    await expect(
      canvas.getByRole("button", { name: accountDetailsButtonName }),
    ).toHaveAttribute("aria-expanded", "true");
    await expect(await body.findByText(demoSessionUser.email)).toBeVisible();
    await expect(body.getByText(/^admin$/i)).toBeVisible();

    await userEvent.click(logoutButton);

    await expect(args.onLogout).toHaveBeenCalledTimes(1);
  },
};

export const FooterMetadata: Story = {
  globals: projectViewportGlobals.desktop,
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
