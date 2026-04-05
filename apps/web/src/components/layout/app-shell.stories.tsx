import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, userEvent, waitFor, within } from "storybook/test";

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
    defaultAccountPopoverOpen: false,
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

export const Collapsed: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const body = within(canvasElement.ownerDocument.body);
    const accountTrigger = canvas.getByRole("button", {
      name: demoSessionUser.name,
    });

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

    await userEvent.click(accountTrigger);

    await expect(await body.findByText(demoSessionUser.email)).toBeVisible();
    await expect(accountTrigger).toHaveAttribute("aria-expanded", "true");

    await userEvent.click(
      canvas.getByRole("heading", { name: /cloudflare 临时邮箱台/i }),
    );

    await waitFor(() => {
      expect(body.queryByText(demoSessionUser.email)).not.toBeInTheDocument();
    });
  },
};

export const DetailsOpen: Story = {
  args: {
    defaultAccountPopoverOpen: true,
  },
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
