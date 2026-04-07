import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, fn, userEvent, within } from "storybook/test";

import { AppShell } from "@/components/layout/app-shell";
import { demoDomainCatalog, demoSessionUser, demoVersion } from "@/mocks/data";
import { DomainsPageView } from "@/pages/domains-page";

const meta = {
  title: "Pages/Domains",
  component: DomainsPageView,
  tags: ["autodocs"],
  args: {
    domains: demoDomainCatalog,
    isDomainBindingEnabled: true,
    isDomainLifecycleEnabled: true,
    isBindPending: false,
    isEnablePending: false,
    onBind: fn(),
    onEnable: fn(),
    onDisable: fn(),
    onDelete: fn(),
    onRetry: fn(),
  },
  render: (args) => (
    <AppShell user={demoSessionUser} version={demoVersion} onLogout={fn()}>
      <DomainsPageView {...args} />
    </AppShell>
  ),
} satisfies Meta<typeof DomainsPageView>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Overview: Story = {};

export const BindFlow: Story = {
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    await userEvent.type(canvas.getByLabelText("根域名"), "bound.example.org");
    await userEvent.click(
      canvas.getByRole("button", { name: "绑定到 Cloudflare" }),
    );
    await expect(args.onBind).toHaveBeenCalledWith({
      rootDomain: "bound.example.org",
    });
  },
};

export const EnableFlow: Story = {
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole("button", { name: "启用域名" }));
    await expect(args.onEnable).toHaveBeenCalledWith({
      rootDomain: "ops.example.org",
      zoneId: "zone_available",
    });
  },
};

export const DeleteConfirmation: Story = {
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole("button", { name: "删除域名" }));
    await within(canvasElement.ownerDocument.body).findByText(
      "确认删除 mail.example.net？",
    );
    await userEvent.click(
      within(canvasElement.ownerDocument.body).getByRole("button", {
        name: "确认删除",
      }),
    );
    await expect(args.onDelete).toHaveBeenCalledWith("dom_secondary");
  },
};

export const ProvisioningError: Story = {
  args: {
    domains: demoDomainCatalog.filter(
      (domain) =>
        domain.projectStatus !== "active" ||
        domain.rootDomain !== "mail.example.net",
    ),
  },
};

export const MissingInCloudflare: Story = {
  args: {
    domains: [
      ...demoDomainCatalog,
      {
        id: "dom_missing",
        rootDomain: "orphaned.example.io",
        zoneId: "zone_missing",
        bindingSource: "catalog",
        cloudflareAvailability: "missing",
        cloudflareStatus: null,
        nameServers: [],
        projectStatus: "disabled",
        lastProvisionError: null,
        createdAt: "2026-04-01T08:45:00.000Z",
        updatedAt: "2026-04-01T08:50:00.000Z",
        lastProvisionedAt: "2026-04-01T08:47:00.000Z",
        disabledAt: "2026-04-01T08:50:00.000Z",
      },
    ],
  },
};

export const LifecycleManagementDisabled: Story = {
  args: {
    isDomainBindingEnabled: false,
    isDomainLifecycleEnabled: false,
  },
};

export const CatalogLoadError: Story = {
  args: {
    domains: [],
    error: {
      variant: "recoverable",
      title: "域名目录暂时加载失败",
      description: "暂时无法获取域名目录，请重试后再继续操作。",
      details:
        '{\n  "error": "Authentication error",\n  "details": "Token missing Zone:Read"\n}',
    },
    onReload: fn(),
  },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    await userEvent.click(
      canvas.getByRole("button", { name: "重新加载域名目录" }),
    );
    await expect(args.onReload).toHaveBeenCalled();
  },
};
