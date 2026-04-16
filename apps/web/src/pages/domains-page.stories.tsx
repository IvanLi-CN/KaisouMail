import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, fn, userEvent, within } from "storybook/test";

import { AppShell } from "@/components/layout/app-shell";
import type { CloudflareSync, DomainCatalogItem } from "@/lib/contracts";
import { buildPublicDocsLinks } from "@/lib/public-docs";
import { demoDomainCatalog, demoSessionUser, demoVersion } from "@/mocks/data";
import { DomainsPageView } from "@/pages/domains-page";

const docsLinks = buildPublicDocsLinks("https://docs.example.test");

if (!docsLinks) {
  throw new Error("docs links are required for domains stories");
}

const pendingBindResult: DomainCatalogItem = {
  id: "dom_bound",
  mailDomain: "mail.customer.com",
  rootDomain: "mail.customer.com",
  zoneId: "zone_mail_customer_com",
  bindingSource: "project_bind",
  cloudflareAvailability: "available",
  cloudflareStatus: "pending",
  nameServers: ["amy.ns.cloudflare.com", "kai.ns.cloudflare.com"],
  projectStatus: "provisioning_error",
  catchAllEnabled: false,
  lastProvisionError:
    "Zone is pending activation in Cloudflare; retry after nameservers are delegated",
  createdAt: "2026-04-10T08:00:00.000Z",
  updatedAt: "2026-04-10T08:00:00.000Z",
  lastProvisionedAt: null,
  disabledAt: null,
};

const existingChildZoneCatalogDomain: DomainCatalogItem = {
  id: null,
  mailDomain: "mail.customer.com",
  rootDomain: "mail.customer.com",
  zoneId: "zone_mail_customer_com",
  bindingSource: null,
  cloudflareAvailability: "available",
  cloudflareStatus: "active",
  nameServers: ["amy.ns.cloudflare.com", "kai.ns.cloudflare.com"],
  projectStatus: "not_enabled",
  catchAllEnabled: false,
  lastProvisionError: null,
  createdAt: null,
  updatedAt: null,
  lastProvisionedAt: null,
  disabledAt: null,
};

const longZoneDialogDomain: DomainCatalogItem = {
  id: "dom_long_zone",
  mailDomain: "long-zone.example.dev",
  rootDomain: "long-zone.example.dev",
  zoneId: "4a2d7f0e9c1b8a6d5e4f3c2b1a09ffeeddccbbaa99887766554433221100aa55",
  bindingSource: "project_bind",
  cloudflareAvailability: "available",
  cloudflareStatus: "pending",
  nameServers: ["amy.ns.cloudflare.com", "kai.ns.cloudflare.com"],
  projectStatus: "provisioning_error",
  catchAllEnabled: false,
  lastProvisionError:
    "Zone is pending activation in Cloudflare; retry after nameservers are delegated",
  createdAt: "2026-04-10T08:00:00.000Z",
  updatedAt: "2026-04-10T08:00:00.000Z",
  lastProvisionedAt: null,
  disabledAt: null,
};

const rateLimitedCloudflareSync: CloudflareSync = {
  status: "rate_limited",
  retryAfter: "2026-04-14T10:00:00.000Z",
  retryAfterSeconds: 120,
  rateLimitContext: {
    triggeredAt: "2026-04-14T09:58:00.000Z",
    projectOperation: "mailboxes.ensure",
    projectRoute: "POST /api/mailboxes/ensure",
    cloudflareMethod: "POST",
    cloudflarePath: "/zones/zone_primary/email/routing/rules",
    lastBlockedAt: null,
    lastBlockedBy: null,
  },
};

const meta = {
  title: "Pages/Domains",
  component: DomainsPageView,
  tags: ["autodocs"],
  parameters: {
    docs: {
      description: {
        component:
          "Covers both direct Cloudflare binding and catalog enablement for apex domains and delegated child zones. Child-zone onboarding keeps the project row visible until the parent zone finishes NS delegation.",
      },
    },
  },
  args: {
    domains: demoDomainCatalog,
    isDomainBindingEnabled: true,
    isDomainLifecycleEnabled: true,
    docsLinks,
    isBindPending: false,
    isEnablePending: false,
    isCatchAllPending: false,
    onBind: fn(),
    onEnable: fn(),
    onEnableCatchAll: fn(),
    onDisableCatchAll: fn(),
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

export const BindSubmitError: Story = {
  args: {
    onBind: fn(async () => {
      throw new Error("Mailbox domain already exists");
    }),
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.type(canvas.getByLabelText("邮箱域名"), "fkoai.site");
    await userEvent.click(
      canvas.getByRole("button", { name: "绑定到 Cloudflare" }),
    );
    await canvas.findByText("这个域名已经在项目里");
  },
};

export const BindPermissionHelp: Story = {
  args: {
    onBind: fn(async () => {
      throw new Error(
        'Requires permission "com.cloudflare.api.account.zone.create" to create zones for the selected account',
      );
    }),
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.type(canvas.getByLabelText("邮箱域名"), "fkoai.site");
    await userEvent.click(
      canvas.getByRole("button", { name: "绑定到 Cloudflare" }),
    );
    await canvas.findByText("缺少 zone.create 权限");
    await expect(
      canvas.getByRole("link", { name: "查看处理步骤" }),
    ).toHaveAttribute(
      "href",
      "https://docs.example.test/zh/project-domain-binding#missing-zone-create-permission",
    );
  },
};

export const BindNextStepsDialog: Story = {
  args: {
    onBind: fn(async () => pendingBindResult),
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.type(
      canvas.getByLabelText("邮箱域名"),
      "mail.customer.com",
    );
    await userEvent.click(
      canvas.getByRole("button", { name: "绑定到 Cloudflare" }),
    );
    const dialog = await within(canvasElement.ownerDocument.body).findByTestId(
      "domain-bind-success-guide-dialog",
    );
    await expect(dialog).toHaveTextContent("还差一步：完成域名委派");
    await expect(dialog).toHaveTextContent(
      "mail.customer.com。Cloudflare 已分配 nameserver。",
    );
    await expect(dialog).toHaveTextContent(
      "请到父域 DNS 中为该子域添加下面的 NS",
    );
    await expect(dialog).toHaveTextContent(
      "例如要接入 mail.example.com，就去 example.com 当前的 DNS 管理处，为子域标签 mail 添加下面这组 NS。",
    );
    await expect(dialog).toHaveTextContent("amy.ns.cloudflare.com");
    await expect(dialog).toHaveTextContent("kai.ns.cloudflare.com");
    const amyInput = within(dialog).getByRole("textbox", {
      name: "Nameserver amy.ns.cloudflare.com",
    });
    const kaiInput = within(dialog).getByRole("textbox", {
      name: "Nameserver kai.ns.cloudflare.com",
    });
    await expect(amyInput).toHaveAttribute("readonly");
    await expect(kaiInput).toHaveAttribute("readonly");
    await expect(
      within(dialog).getByRole("button", {
        name: "复制 amy.ns.cloudflare.com",
      }),
    ).toBeInTheDocument();
    await expect(
      within(dialog).getByRole("button", {
        name: "复制 kai.ns.cloudflare.com",
      }),
    ).toBeInTheDocument();
    await expect(dialog).toHaveTextContent(
      "保持当前页面打开，系统会自动刷新状态；等 Cloudflare 从 pending 变成 active。",
    );
  },
};

export const ChildZoneCatalogEnableFlow: Story = {
  args: {
    domains: [
      existingChildZoneCatalogDomain,
      ...demoDomainCatalog.filter(
        (domain) => domain.zoneId !== "zone_available",
      ),
    ],
  },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText("mail.customer.com")).toBeInTheDocument();
    await expect(
      canvas.getAllByText("已存在于 Cloudflare，可直接启用到项目").length,
    ).toBeGreaterThan(0);
    await userEvent.click(canvas.getByRole("button", { name: "启用域名" }));
    await expect(args.onEnable).toHaveBeenCalledWith({
      mailDomain: "mail.customer.com",
      zoneId: "zone_mail_customer_com",
    });
  },
};

export const BindFlow: Story = {
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    await userEvent.type(
      canvas.getByLabelText("邮箱域名"),
      "bound.example.org",
    );
    await userEvent.click(
      canvas.getByRole("button", { name: "绑定到 Cloudflare" }),
    );
    await expect(args.onBind).toHaveBeenCalledWith({
      mailDomain: "bound.example.org",
    });
  },
};

export const EnableFlow: Story = {
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole("button", { name: "启用域名" }));
    await expect(args.onEnable).toHaveBeenCalledWith({
      mailDomain: "ops.example.org",
      zoneId: "zone_available",
    });
  },
};

export const CatchAllToggle: Story = {
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    await userEvent.click(
      canvas.getByRole("button", { name: "关闭 Catch All" }),
    );
    await expect(args.onDisableCatchAll).toHaveBeenCalledWith("dom_secondary");
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
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(
      canvas.getByTestId("domain-bind-delegation-guide"),
    ).toHaveTextContent(
      "直绑 apex 或子域后若停在 pending / provisioning_error：先完成 NS 委派，再重试。",
    );
    await expect(
      canvas.getByTestId("domain-catalog-delegation-guide"),
    ).toHaveTextContent(
      "有 1 个项目直绑域名待完成 NS 委派；先完成父区 NS 委派，再点“重试接入”。",
    );
    await expect(
      canvas.getByTestId("domain-row-delegation-guide-dom_failed"),
    ).toHaveTextContent("待委派");
    await expect(
      canvas.getByTestId("domain-row-delegation-guide-dom_failed"),
    ).toHaveTextContent("完成父区 NS 委派后重试。");
    await expect(
      within(
        canvas.getByTestId("domain-row-delegation-guide-dom_failed"),
      ).getByRole("link", { name: "步骤" }),
    ).toHaveAttribute(
      "href",
      "https://docs.example.test/zh/project-domain-binding#zone-pending-or-nameserver-not-delegated",
    );
    await expect(
      canvas.getByRole("button", { name: "查看详情" }),
    ).toHaveAttribute("data-icon-only", "true");
  },
};

export const RateLimitedCatalog: Story = {
  args: {
    domains: demoDomainCatalog.filter((domain) => domain.id !== null),
    cloudflareSync: rateLimitedCloudflareSync,
    onReload: fn(),
  },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    await expect(
      canvas.getByTestId("domain-catalog-rate-limit-banner"),
    ).toHaveTextContent("Cloudflare 域名目录正在冷却");
    await expect(
      canvas.getByRole("button", { name: "立即重试" }),
    ).toBeInTheDocument();
    await userEvent.click(canvas.getByRole("button", { name: "立即重试" }));
    await expect(args.onReload).toHaveBeenCalled();
  },
};

export const ZoneDetailsDialog: Story = {
  args: {
    domains: demoDomainCatalog.filter(
      (domain) =>
        domain.projectStatus !== "active" ||
        domain.rootDomain !== "mail.example.net",
    ),
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(
      canvas.getByTestId("domain-details-trigger-dom_failed"),
    );
    const dialog = await within(canvasElement.ownerDocument.body).findByTestId(
      "domain-details-dialog",
    );
    await expect(dialog).toHaveTextContent("staging.example.dev");
    await expect(
      within(dialog).getByRole("textbox", {
        name: "Zone staging.example.dev",
      }),
    ).toHaveValue("zone_failed");
    await expect(
      within(dialog).getByRole("textbox", {
        name: "Nameserver amy.ns.cloudflare.com",
      }),
    ).toHaveValue("amy.ns.cloudflare.com");
    await expect(
      within(dialog).getByRole("textbox", {
        name: "Nameserver kai.ns.cloudflare.com",
      }),
    ).toHaveValue("kai.ns.cloudflare.com");
    await expect(dialog).toHaveTextContent("先改 NS，再重试接入");
  },
};

export const ZoneDetailsDialogLongZoneId: Story = {
  args: {
    domains: [
      longZoneDialogDomain,
      ...demoDomainCatalog.filter(
        (domain) =>
          domain.id !== "dom_failed" &&
          domain.rootDomain !== "mail.example.net",
      ),
    ],
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(
      canvas.getByTestId("domain-details-trigger-dom_long_zone"),
    );
    const dialog = await within(canvasElement.ownerDocument.body).findByTestId(
      "domain-details-dialog",
    );
    await expect(
      within(dialog).getByRole("textbox", {
        name: "Zone long-zone.example.dev",
      }),
    ).toHaveValue(longZoneDialogDomain.zoneId ?? "");
    await expect(dialog).toHaveTextContent("点击输入框可全选");
    await expect(
      within(dialog).getByRole("button", {
        name: `复制 zone ${longZoneDialogDomain.zoneId}`,
      }),
    ).toBeInTheDocument();
  },
};

export const MissingInCloudflare: Story = {
  args: {
    domains: [
      ...demoDomainCatalog,
      {
        id: "dom_missing",
        mailDomain: "orphaned.example.io",
        rootDomain: "orphaned.example.io",
        zoneId: "zone_missing",
        bindingSource: "catalog",
        cloudflareAvailability: "missing",
        cloudflareStatus: null,
        nameServers: [],
        projectStatus: "disabled",
        catchAllEnabled: false,
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
