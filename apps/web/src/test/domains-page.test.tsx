import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ApiClientError } from "@/lib/api";
import { buildPublicDocsLinks } from "@/lib/public-docs";
import { demoDomainCatalog, demoSessionUser } from "@/mocks/data";
import { DomainsPage, DomainsPageView } from "@/pages/domains-page";

const queryClientState = {
  setQueryData: vi.fn(),
};

const domainsHookState = {
  catalog: demoDomainCatalog,
  cloudflareSync: {
    status: "live" as const,
    retryAfter: null,
    retryAfterSeconds: null,
    rateLimitContext: null,
  },
  error: null as Error | null,
  refetch: vi.fn(),
  bindMutateAsync: vi.fn(),
  role: "admin" as "admin" | "member",
  cloudflareDomainBindingEnabled: true,
  cloudflareDomainLifecycleEnabled: true,
  cloudflareCatchAllManagementEnabled: true,
  cloudflareCatchAllEnablementEnabled: true,
};

vi.mock("@tanstack/react-query", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@tanstack/react-query")>();
  return {
    ...actual,
    useQueryClient: () => queryClientState,
  };
});

vi.mock("@/hooks/use-session", () => ({
  useSessionQuery: () => ({
    data: {
      user: {
        ...demoSessionUser,
        role: domainsHookState.role,
      },
    },
  }),
}));

vi.mock("@/hooks/use-meta", () => ({
  useMetaQuery: () => ({
    data: {
      cloudflareDomainBindingEnabled:
        domainsHookState.cloudflareDomainBindingEnabled,
      cloudflareDomainLifecycleEnabled:
        domainsHookState.cloudflareDomainLifecycleEnabled,
      cloudflareCatchAllManagementEnabled:
        domainsHookState.cloudflareCatchAllManagementEnabled,
      cloudflareCatchAllEnablementEnabled:
        domainsHookState.cloudflareCatchAllEnablementEnabled,
    },
  }),
}));

vi.mock("@/hooks/use-domains", () => ({
  domainCatalogQueryKey: ["domains", "catalog"],
  useDomainCatalogQuery: () => ({
    data: {
      domains: domainsHookState.catalog,
      cloudflareSync: domainsHookState.cloudflareSync,
    },
    error: domainsHookState.error,
    refetch: domainsHookState.refetch,
  }),
  useBindDomainMutation: () => ({
    isPending: false,
    mutateAsync: domainsHookState.bindMutateAsync,
  }),
  useCreateDomainMutation: () => ({
    isPending: false,
    mutateAsync: vi.fn(),
  }),
  useDisableDomainMutation: () => ({
    mutateAsync: vi.fn(),
  }),
  useDeleteDomainMutation: () => ({
    mutateAsync: vi.fn(),
  }),
  useEnableDomainCatchAllMutation: () => ({
    isPending: false,
    mutateAsync: vi.fn(),
  }),
  useDisableDomainCatchAllMutation: () => ({
    isPending: false,
    mutateAsync: vi.fn(),
  }),
  useRetryDomainMutation: () => ({
    mutateAsync: vi.fn(),
  }),
}));

afterEach(() => {
  domainsHookState.catalog = demoDomainCatalog;
  domainsHookState.cloudflareSync = {
    status: "live",
    retryAfter: null,
    retryAfterSeconds: null,
    rateLimitContext: null,
  };
  domainsHookState.error = null;
  domainsHookState.refetch = vi.fn();
  domainsHookState.bindMutateAsync = vi.fn();
  domainsHookState.role = "admin";
  domainsHookState.cloudflareDomainBindingEnabled = true;
  domainsHookState.cloudflareDomainLifecycleEnabled = true;
  domainsHookState.cloudflareCatchAllManagementEnabled = true;
  domainsHookState.cloudflareCatchAllEnablementEnabled = true;
  queryClientState.setQueryData.mockReset();
});

const docsLinks = buildPublicDocsLinks("https://docs.example.test");

if (!docsLinks) {
  throw new Error("docs links are required for domains tests");
}

describe("domains page view", () => {
  it("renders a non-blocking Cloudflare cooldown banner with manual retry", () => {
    const onReload = vi.fn();

    render(
      <MemoryRouter>
        <DomainsPageView
          domains={demoDomainCatalog.filter((domain) => domain.id !== null)}
          cloudflareSync={{
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
          }}
          isDomainBindingEnabled
          isDomainLifecycleEnabled
          docsLinks={docsLinks}
          onBind={vi.fn()}
          onEnable={vi.fn()}
          onEnableCatchAll={vi.fn()}
          onDisableCatchAll={vi.fn()}
          onDisable={vi.fn()}
          onDelete={vi.fn()}
          onRetry={vi.fn()}
          onReload={onReload}
        />
      </MemoryRouter>,
    );

    const banner = screen.getByTestId("domain-catalog-rate-limit-banner");
    expect(banner).toHaveTextContent("Cloudflare 域名目录正在冷却");
    expect(banner).toHaveTextContent("当前先展示项目内已知域名");
    expect(banner).toHaveTextContent(
      "最近一次冷却来自 确保邮箱存在（POST /api/mailboxes/ensure）先触发了 Cloudflare POST /zones/zone_primary/email/routing/rules",
    );
    fireEvent.click(screen.getByRole("button", { name: "立即重试" }));
    expect(onReload).toHaveBeenCalledTimes(1);
  });

  it("renders binding controls, statuses, and delete actions", async () => {
    const onDelete = vi.fn(async () => undefined);

    render(
      <MemoryRouter>
        <DomainsPageView
          domains={demoDomainCatalog}
          isDomainBindingEnabled
          isDomainLifecycleEnabled
          docsLinks={docsLinks}
          onBind={vi.fn()}
          onEnable={vi.fn()}
          onEnableCatchAll={vi.fn()}
          onDisableCatchAll={vi.fn()}
          onDisable={vi.fn()}
          onDelete={onDelete}
          onRetry={vi.fn()}
        />
      </MemoryRouter>,
    );

    expect(
      screen.getByRole("heading", { name: "绑定邮箱域名" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "绑定到 Cloudflare" }),
    ).toBeInTheDocument();
    const bindGuide = screen.getByTestId("domain-bind-delegation-guide");
    expect(bindGuide).toHaveTextContent(
      "apex 直绑若停在 pending / provisioning_error：先完成权威 NS 切换，再重试。",
    );
    expect(
      within(bindGuide).getByRole("link", { name: "查看步骤" }),
    ).toHaveAttribute(
      "href",
      "https://docs.example.test/zh/project-domain-binding#zone-pending-or-nameserver-not-delegated",
    );
    expect(
      screen.queryByRole("columnheader", { name: "详情" }),
    ).not.toBeInTheDocument();
    expect(screen.getByText("relay.example.test")).toBeInTheDocument();
    expect(screen.getAllByText("project_bind")).toHaveLength(2);
    expect(screen.getAllByText("provisioning_error").length).toBeGreaterThan(0);
    expect(
      screen.getByText(
        "Zone activation is pending until nameserver delegation is complete",
      ),
    ).toBeInTheDocument();
    expect(screen.queryByText("zone_failed")).not.toBeInTheDocument();
    expect(screen.queryByText("amy.ns.cloudflare.com")).not.toBeInTheDocument();
    const catalogGuide = screen.getByTestId("domain-catalog-delegation-guide");
    expect(catalogGuide).toHaveTextContent(
      "有 1 个项目域名待完成 Cloudflare NS 配置；请按域名详情里的当前指引处理后，再点“重试接入”。",
    );
    expect(
      within(catalogGuide).getByRole("link", { name: "查看步骤" }),
    ).toHaveAttribute(
      "href",
      "https://docs.example.test/zh/project-domain-binding#zone-pending-or-nameserver-not-delegated",
    );
    const rowGuide = screen.getByTestId(
      "domain-row-delegation-guide-dom_failed",
    );
    expect(rowGuide).toHaveTextContent("待配置 NS");
    expect(rowGuide).toHaveTextContent("完成现有委派配置后重试。");
    expect(rowGuide).toHaveClass("flex");
    expect(rowGuide).not.toHaveClass("rounded-full");
    const detailsTrigger = screen.getByTestId(
      "domain-details-trigger-dom_failed",
    );
    expect(detailsTrigger).toHaveAttribute("aria-label", "查看详情");
    expect(detailsTrigger).toHaveAttribute("data-icon-only", "true");
    expect(
      within(rowGuide).getByRole("link", { name: "步骤" }),
    ).toHaveAttribute(
      "href",
      "https://docs.example.test/zh/project-domain-binding#zone-pending-or-nameserver-not-delegated",
    );
    fireEvent.click(detailsTrigger);
    const detailsDialog = await screen.findByTestId("domain-details-dialog");
    expect(detailsDialog).toHaveTextContent("staging.example.dev");
    expect(
      within(detailsDialog).getByRole("textbox", {
        name: "Zone staging.example.dev",
      }),
    ).toHaveValue("zone_failed");
    expect(
      within(detailsDialog).getByRole("textbox", {
        name: "Nameserver amy.ns.cloudflare.com",
      }),
    ).toHaveValue("amy.ns.cloudflare.com");
    expect(detailsDialog).toHaveTextContent("先完成现有子域委派，再重试接入");
    expect(detailsDialog).toHaveTextContent(
      "这是已有子域 zone 记录。若你继续维护它，请去父域 example.dev 的 DNS 管理处，为子域标签 staging 添加下面这组 NS。",
    );
    fireEvent.click(
      within(detailsDialog).getByRole("button", { name: "我知道了" }),
    );
    await waitFor(() =>
      expect(
        screen.queryByTestId("domain-details-dialog"),
      ).not.toBeInTheDocument(),
    );
    expect(screen.getByText("not_enabled")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "启用域名" }),
    ).toBeInTheDocument();

    const deleteButtons = screen.getAllByRole("button", { name: "删除域名" });
    expect(deleteButtons.length).toBeGreaterThan(0);
    fireEvent.click(deleteButtons[0]);
    expect(
      await screen.findByText("确认删除 mail.example.net？"),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByText("确认删除", { selector: "button" }));
    await waitFor(() => expect(onDelete).toHaveBeenCalledWith("dom_secondary"));
  });

  it("enables an existing catalog zone without recreating the zone", async () => {
    const onEnable = vi.fn();

    render(
      <MemoryRouter>
        <DomainsPageView
          domains={[
            {
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
            },
            ...demoDomainCatalog.filter(
              (domain) => domain.zoneId !== "zone_available",
            ),
          ]}
          isDomainBindingEnabled
          isDomainLifecycleEnabled
          docsLinks={docsLinks}
          onBind={vi.fn()}
          onEnable={onEnable}
          onEnableCatchAll={vi.fn()}
          onDisableCatchAll={vi.fn()}
          onDisable={vi.fn()}
          onDelete={vi.fn()}
          onRetry={vi.fn()}
        />
      </MemoryRouter>,
    );

    expect(screen.getByText("mail.customer.com")).toBeInTheDocument();
    expect(
      screen.getAllByText("Cloudflare 中已发现该 zone，可按当前记录启用到项目")
        .length,
    ).toBeGreaterThan(0);

    fireEvent.click(screen.getByRole("button", { name: "启用域名" }));

    await waitFor(() =>
      expect(onEnable).toHaveBeenCalledWith({
        mailDomain: "mail.customer.com",
        zoneId: "zone_mail_customer_com",
      }),
    );
  });

  it("hides Catch All actions when runtime management is unavailable", () => {
    render(
      <MemoryRouter>
        <DomainsPageView
          domains={demoDomainCatalog}
          isDomainBindingEnabled
          isDomainLifecycleEnabled
          isCatchAllManagementEnabled={false}
          docsLinks={docsLinks}
          onBind={vi.fn()}
          onEnable={vi.fn()}
          onEnableCatchAll={vi.fn()}
          onDisableCatchAll={vi.fn()}
          onDisable={vi.fn()}
          onDelete={vi.fn()}
          onRetry={vi.fn()}
        />
      </MemoryRouter>,
    );

    expect(
      screen.queryByRole("button", { name: "开启 Catch All" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "关闭 Catch All" }),
    ).not.toBeInTheDocument();
    expect(
      screen.getAllByText("当前运行时未启用 Catch All 管理能力。").length,
    ).toBeGreaterThan(0);
  });

  it("keeps Catch All disable visible when worker routing config is missing", () => {
    const scopedDomains = [
      {
        ...demoDomainCatalog[0],
        mailDomain: "enabled.example.dev",
        rootDomain: "enabled.example.dev",
        zoneId: "zone_enabled",
        projectStatus: "active" as const,
        catchAllEnabled: true,
      },
      {
        ...demoDomainCatalog[1],
        mailDomain: "disabled.example.dev",
        rootDomain: "disabled.example.dev",
        zoneId: "zone_disabled",
        projectStatus: "active" as const,
        catchAllEnabled: false,
      },
    ];

    render(
      <MemoryRouter>
        <DomainsPageView
          domains={scopedDomains}
          isDomainBindingEnabled
          isDomainLifecycleEnabled
          isCatchAllManagementEnabled
          isCatchAllEnablementEnabled={false}
          docsLinks={docsLinks}
          onBind={vi.fn()}
          onEnable={vi.fn()}
          onEnableCatchAll={vi.fn()}
          onDisableCatchAll={vi.fn()}
          onDisable={vi.fn()}
          onDelete={vi.fn()}
          onRetry={vi.fn()}
        />
      </MemoryRouter>,
    );

    const enabledRow = screen.getByText("enabled.example.dev").closest("tr");
    const disabledRow = screen.getByText("disabled.example.dev").closest("tr");
    expect(enabledRow).not.toBeNull();
    expect(disabledRow).not.toBeNull();

    expect(
      within(enabledRow as HTMLTableRowElement).getByRole("button", {
        name: "关闭 Catch All",
      }),
    ).toBeInTheDocument();
    expect(
      within(enabledRow as HTMLTableRowElement).queryByRole("button", {
        name: "开启 Catch All",
      }),
    ).not.toBeInTheDocument();
    expect(
      within(disabledRow as HTMLTableRowElement).queryByRole("button", {
        name: "开启 Catch All",
      }),
    ).not.toBeInTheDocument();
    expect(
      screen.getAllByText(
        "当前运行时缺少 EMAIL_WORKER_NAME，暂不能开启 Catch All。",
      ).length,
    ).toBeGreaterThan(0);
  });

  it("hides Catch All actions for active domains outside the current Cloudflare token scope", () => {
    const scopedDomains = [
      {
        ...demoDomainCatalog[0],
        mailDomain: "out-of-scope.example.dev",
        rootDomain: "out-of-scope.example.dev",
        cloudflareAvailability: "missing" as const,
        zoneId: "zone_out_of_scope",
        projectStatus: "active" as const,
        catchAllEnabled: true,
      },
    ];

    render(
      <MemoryRouter>
        <DomainsPageView
          domains={scopedDomains}
          isDomainBindingEnabled
          isDomainLifecycleEnabled
          isCatchAllManagementEnabled
          docsLinks={docsLinks}
          onBind={vi.fn()}
          onEnable={vi.fn()}
          onEnableCatchAll={vi.fn()}
          onDisableCatchAll={vi.fn()}
          onDisable={vi.fn()}
          onDelete={vi.fn()}
          onRetry={vi.fn()}
        />
      </MemoryRouter>,
    );

    const row = screen.getByText("out-of-scope.example.dev").closest("tr");
    expect(row).not.toBeNull();
    expect(
      within(row as HTMLTableRowElement).queryByRole("button", {
        name: "开启 Catch All",
      }),
    ).not.toBeInTheDocument();
    expect(
      within(row as HTMLTableRowElement).queryByRole("button", {
        name: "关闭 Catch All",
      }),
    ).not.toBeInTheDocument();
  });

  it("uses a gapped inline layout for Cloudflare status badges", () => {
    render(
      <MemoryRouter>
        <DomainsPageView
          domains={demoDomainCatalog}
          isDomainBindingEnabled
          isDomainLifecycleEnabled
          onBind={vi.fn()}
          onEnable={vi.fn()}
          onEnableCatchAll={vi.fn()}
          onDisableCatchAll={vi.fn()}
          onDisable={vi.fn()}
          onDelete={vi.fn()}
          onRetry={vi.fn()}
        />
      </MemoryRouter>,
    );

    const badgeGroup = screen.getByTestId(
      "cloudflare-status-group-relay.example.test",
    );

    expect(badgeGroup).toHaveClass("flex", "flex-wrap", "gap-2");
    expect(within(badgeGroup).getByText("available")).toBeInTheDocument();
    expect(within(badgeGroup).getByText("active")).toBeInTheDocument();
  });

  it("keeps the bind form layout stable for validation and submit errors", async () => {
    const onBind = vi.fn(async () => {
      throw new Error("Mailbox domain already exists");
    });

    render(
      <MemoryRouter>
        <DomainsPageView
          domains={demoDomainCatalog}
          isDomainBindingEnabled
          isDomainLifecycleEnabled
          docsLinks={docsLinks}
          onBind={onBind}
          onEnable={vi.fn()}
          onEnableCatchAll={vi.fn()}
          onDisableCatchAll={vi.fn()}
          onDisable={vi.fn()}
          onDelete={vi.fn()}
          onRetry={vi.fn()}
        />
      </MemoryRouter>,
    );

    const form = screen.getByTestId("domain-bind-form");
    const error = screen.getByTestId("domain-bind-error");
    const submitSlot = screen.getByTestId("domain-bind-submit-slot");
    const input = screen.getByLabelText("邮箱域名");
    const submitButton = screen.getByRole("button", {
      name: "绑定到 Cloudflare",
    });

    expect(form).toHaveClass(
      "grid",
      "gap-x-4",
      "gap-y-2",
      "md:grid-cols-[minmax(0,1fr)_auto]",
      "md:grid-rows-[auto_auto]",
    );
    expect(error).toHaveClass("min-h-5", "md:col-start-1", "md:row-start-2");
    expect(submitSlot).toHaveClass(
      "md:col-start-2",
      "md:row-start-1",
      "md:items-end",
    );

    fireEvent.change(input, { target: { value: "bad" } });
    fireEvent.click(submitButton);

    expect(
      await screen.findByText("请输入有效邮箱域名，例如 example.com"),
    ).toBeInTheDocument();
    expect(onBind).not.toHaveBeenCalled();

    fireEvent.change(input, { target: { value: "example.org" } });
    fireEvent.click(submitButton);

    expect(await screen.findByText("这个域名已经在项目里")).toBeInTheDocument();
    expect(
      screen.getByText(/Mailbox domain already exists/),
    ).toBeInTheDocument();
    await waitFor(() =>
      expect(onBind).toHaveBeenCalledWith({
        mailDomain: "example.org",
      }),
    );
  });

  it("blocks direct subdomain bind locally and recommends apex plus mailbox subdomain", async () => {
    const onBind = vi.fn();

    render(
      <MemoryRouter>
        <DomainsPageView
          domains={demoDomainCatalog}
          isDomainBindingEnabled
          isDomainLifecycleEnabled
          docsLinks={docsLinks}
          onBind={onBind}
          onEnable={vi.fn()}
          onEnableCatchAll={vi.fn()}
          onDisableCatchAll={vi.fn()}
          onDisable={vi.fn()}
          onDelete={vi.fn()}
          onRetry={vi.fn()}
        />
      </MemoryRouter>,
    );

    fireEvent.change(screen.getByLabelText("邮箱域名"), {
      target: { value: "mail.customer.com" },
    });
    fireEvent.click(screen.getByRole("button", { name: "绑定到 Cloudflare" }));

    const errorBubble = await screen.findByTestId("domain-bind-error");
    expect(errorBubble).toHaveTextContent(
      "当前 Cloudflare 账号不支持直接绑定子域",
    );
    expect(errorBubble).toHaveTextContent(
      "请改为绑定 customer.com，再在创建邮箱时把子域填成 mail，即可继续使用 user@mail.customer.com 这类地址。",
    );
    expect(
      within(errorBubble).getByRole("link", { name: "查看处理步骤" }),
    ).toHaveAttribute(
      "href",
      "https://docs.example.test/zh/project-domain-binding#bind-apex-only",
    );
    expect(onBind).not.toHaveBeenCalled();
  });

  it("lets existing subdomain records reach the bind API for reuse flows", async () => {
    const onBind = vi.fn(async () => {
      throw new Error("Mailbox domain already exists");
    });

    render(
      <MemoryRouter>
        <DomainsPageView
          domains={demoDomainCatalog}
          isDomainBindingEnabled
          isDomainLifecycleEnabled
          docsLinks={docsLinks}
          onBind={onBind}
          onEnable={vi.fn()}
          onEnableCatchAll={vi.fn()}
          onDisableCatchAll={vi.fn()}
          onDisable={vi.fn()}
          onDelete={vi.fn()}
          onRetry={vi.fn()}
        />
      </MemoryRouter>,
    );

    fireEvent.change(screen.getByLabelText("邮箱域名"), {
      target: { value: "mail.example.net" },
    });
    fireEvent.click(screen.getByRole("button", { name: "绑定到 Cloudflare" }));

    await waitFor(() =>
      expect(onBind).toHaveBeenCalledWith({
        mailDomain: "mail.example.net",
      }),
    );
    expect(screen.getByTestId("domain-bind-error")).toHaveTextContent(
      "Mailbox domain already exists",
    );
  });

  it("preserves parent-zone NS guidance when bind reuses an existing child zone", async () => {
    const existingNestedChildZone = {
      id: "dom_nested_bind",
      mailDomain: "ops.mail.example.com",
      rootDomain: "ops.mail.example.com",
      zoneId: "zone_ops_mail_example_com",
      bindingSource: "project_bind" as const,
      cloudflareAvailability: "available" as const,
      cloudflareStatus: "pending",
      nameServers: ["amy.ns.cloudflare.com", "kai.ns.cloudflare.com"],
      projectStatus: "provisioning_error" as const,
      catchAllEnabled: false,
      lastProvisionError:
        "Zone is pending activation in Cloudflare; retry after nameservers are delegated",
      createdAt: "2026-04-10T08:00:00.000Z",
      updatedAt: "2026-04-10T08:00:00.000Z",
      lastProvisionedAt: null,
      disabledAt: null,
    };

    const onBind = vi.fn(async () => existingNestedChildZone);

    render(
      <MemoryRouter>
        <DomainsPageView
          domains={[
            existingNestedChildZone,
            {
              id: null,
              mailDomain: "mail.example.com",
              rootDomain: "mail.example.com",
              zoneId: "zone_mail_example_com",
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
            },
            ...demoDomainCatalog,
          ]}
          isDomainBindingEnabled
          isDomainLifecycleEnabled
          docsLinks={docsLinks}
          onBind={onBind}
          onEnable={vi.fn()}
          onEnableCatchAll={vi.fn()}
          onDisableCatchAll={vi.fn()}
          onDisable={vi.fn()}
          onDelete={vi.fn()}
          onRetry={vi.fn()}
        />
      </MemoryRouter>,
    );

    fireEvent.change(screen.getByLabelText("邮箱域名"), {
      target: { value: "ops.mail.example.com" },
    });
    fireEvent.click(screen.getByRole("button", { name: "绑定到 Cloudflare" }));

    const dialog = await screen.findByTestId(
      "domain-bind-success-guide-dialog",
    );
    expect(dialog).toHaveTextContent("还差一步：在父域添加 NS");
    expect(dialog).toHaveTextContent(
      "ops.mail.example.com。Cloudflare 已分配 nameserver。请去父域 mail.example.com 的 DNS 管理处，为子域标签 ops 添加下面这组 NS；完成后再回来重试。",
    );
    expect(dialog).toHaveTextContent(
      "这是已有子域 zone 记录。若你继续维护它，请去父域 mail.example.com 的 DNS 管理处，为子域标签 ops 添加下面这组 NS。",
    );
    expect(dialog).toHaveTextContent(
      "去父域 mail.example.com 的 DNS / 注册商管理处，为子域标签 ops 添加下面显示的 NS 记录。",
    );
    expect(dialog).not.toHaveTextContent("权威 NS 切到下面这组值");
    expect(dialog).not.toHaveTextContent("父域 example.com");
  });

  it("seeds fallback catalog polling when bind succeeds before the catalog catches up", async () => {
    domainsHookState.bindMutateAsync = vi.fn(async () => ({
      id: "dom_bound",
      mailDomain: "example.dev",
      rootDomain: "example.dev",
      zoneId: "zone_fallback",
      bindingSource: "project_bind" as const,
      status: "provisioning_error" as const,
      lastProvisionError:
        "Zone is pending activation in Cloudflare; retry after nameservers are delegated",
      createdAt: "2026-04-10T08:00:00.000Z",
      updatedAt: "2026-04-10T08:00:00.000Z",
      lastProvisionedAt: null,
      disabledAt: null,
    }));
    domainsHookState.refetch = vi.fn(async () => ({
      data: {
        domains: demoDomainCatalog,
        cloudflareSync: domainsHookState.cloudflareSync,
      },
    }));

    render(
      <MemoryRouter>
        <DomainsPage />
      </MemoryRouter>,
    );

    fireEvent.change(screen.getByLabelText("邮箱域名"), {
      target: { value: "example.dev" },
    });
    fireEvent.click(screen.getByRole("button", { name: "绑定到 Cloudflare" }));

    const dialog = await screen.findByTestId(
      "domain-bind-success-guide-dialog",
    );
    expect(dialog).toHaveTextContent("还差一步：切换权威 NS");
    expect(queryClientState.setQueryData).toHaveBeenCalledWith(
      ["domains", "catalog"],
      expect.any(Function),
    );

    const setQueryDataUpdater =
      queryClientState.setQueryData.mock.calls[0]?.[1];
    if (typeof setQueryDataUpdater !== "function") {
      throw new Error("expected setQueryData updater");
    }

    expect(
      setQueryDataUpdater({
        domains: demoDomainCatalog,
        cloudflareSync: domainsHookState.cloudflareSync,
      }),
    ).toEqual(
      expect.objectContaining({
        domains: expect.arrayContaining([
          expect.objectContaining({
            mailDomain: "example.dev",
            rootDomain: "example.dev",
            cloudflareStatus: "pending",
            projectStatus: "provisioning_error",
            catchAllEnabled: false,
          }),
        ]),
      }),
    );
  });

  it("keeps a retryable project-bind row visible when the catalog misses a non-delegation failure", async () => {
    domainsHookState.bindMutateAsync = vi.fn(async () => ({
      id: "dom_runtime_config",
      mailDomain: "retry.dev",
      rootDomain: "retry.dev",
      zoneId: "zone_retry",
      bindingSource: "project_bind" as const,
      status: "provisioning_error" as const,
      lastProvisionError:
        "Email Routing management is enabled but EMAIL_WORKER_NAME is not configured",
      createdAt: "2026-04-10T08:00:00.000Z",
      updatedAt: "2026-04-10T08:00:00.000Z",
      lastProvisionedAt: null,
      disabledAt: null,
    }));
    domainsHookState.refetch = vi.fn(async () => ({
      data: {
        domains: demoDomainCatalog,
        cloudflareSync: domainsHookState.cloudflareSync,
      },
    }));

    render(
      <MemoryRouter>
        <DomainsPage />
      </MemoryRouter>,
    );

    fireEvent.change(screen.getByLabelText("邮箱域名"), {
      target: { value: "retry.dev" },
    });
    fireEvent.click(screen.getByRole("button", { name: "绑定到 Cloudflare" }));

    const dialog = await screen.findByTestId(
      "domain-bind-success-guide-dialog",
    );
    expect(dialog).toHaveTextContent("绑定已提交，稍后再试");
    expect(dialog).toHaveTextContent("这次不需要修改 NS");
    expect(queryClientState.setQueryData).toHaveBeenCalledWith(
      ["domains", "catalog"],
      expect.any(Function),
    );

    const setQueryDataUpdater =
      queryClientState.setQueryData.mock.calls[0]?.[1];
    if (typeof setQueryDataUpdater !== "function") {
      throw new Error("expected setQueryData updater");
    }

    expect(
      setQueryDataUpdater({
        domains: demoDomainCatalog,
        cloudflareSync: domainsHookState.cloudflareSync,
      }),
    ).toEqual(
      expect.objectContaining({
        domains: expect.arrayContaining([
          expect.objectContaining({
            mailDomain: "retry.dev",
            rootDomain: "retry.dev",
            cloudflareStatus: null,
            projectStatus: "provisioning_error",
            catchAllEnabled: false,
            lastProvisionError:
              "Email Routing management is enabled but EMAIL_WORKER_NAME is not configured",
          }),
        ]),
      }),
    );
  });

  it("opens a next-steps dialog immediately after a successful direct bind", async () => {
    const onBind = vi.fn(async () => ({
      id: "dom_bound",
      mailDomain: "customer.com",
      rootDomain: "customer.com",
      zoneId: "zone_customer_com",
      bindingSource: "project_bind" as const,
      cloudflareAvailability: "available" as const,
      cloudflareStatus: "pending",
      nameServers: ["amy.ns.cloudflare.com", "kai.ns.cloudflare.com"],
      projectStatus: "provisioning_error" as const,
      lastProvisionError:
        "Zone is pending activation in Cloudflare; retry after nameservers are delegated",
      createdAt: "2026-04-10T08:00:00.000Z",
      updatedAt: "2026-04-10T08:00:00.000Z",
      lastProvisionedAt: null,
      disabledAt: null,
    }));

    render(
      <MemoryRouter>
        <DomainsPageView
          domains={demoDomainCatalog}
          isDomainBindingEnabled
          isDomainLifecycleEnabled
          docsLinks={docsLinks}
          onBind={onBind}
          onEnable={vi.fn()}
          onEnableCatchAll={vi.fn()}
          onDisableCatchAll={vi.fn()}
          onDisable={vi.fn()}
          onDelete={vi.fn()}
          onRetry={vi.fn()}
        />
      </MemoryRouter>,
    );

    fireEvent.change(screen.getByLabelText("邮箱域名"), {
      target: { value: "customer.com" },
    });
    fireEvent.click(screen.getByRole("button", { name: "绑定到 Cloudflare" }));

    const dialog = await screen.findByTestId(
      "domain-bind-success-guide-dialog",
    );
    expect(dialog).toHaveTextContent("还差一步：切换权威 NS");
    expect(dialog).toHaveTextContent(
      "customer.com。Cloudflare 已分配 nameserver。",
    );
    expect(dialog).toHaveTextContent(
      "请把 customer.com 的权威 NS 切到下面这组值；完成后再回来重试。",
    );
    expect(dialog).toHaveTextContent(
      "这是 apex 接入，请把 customer.com 的权威 NS 切到下面这组值。",
    );
    expect(dialog).toHaveTextContent(
      "保持当前页面打开，系统会自动刷新状态；等 Cloudflare 从 pending 变成 active。",
    );
    const amyInput = within(dialog).getByRole("textbox", {
      name: "Nameserver amy.ns.cloudflare.com",
    }) as HTMLInputElement;
    const kaiInput = within(dialog).getByRole("textbox", {
      name: "Nameserver kai.ns.cloudflare.com",
    }) as HTMLInputElement;
    expect(amyInput).toHaveValue("amy.ns.cloudflare.com");
    expect(kaiInput).toHaveValue("kai.ns.cloudflare.com");
    expect(amyInput).toHaveAttribute("readonly");
    expect(kaiInput).toHaveAttribute("readonly");
    expect(
      within(dialog).getByRole("button", {
        name: "复制 amy.ns.cloudflare.com",
      }),
    ).toBeInTheDocument();
    expect(
      within(dialog).getByRole("button", {
        name: "复制 kai.ns.cloudflare.com",
      }),
    ).toBeInTheDocument();
    fireEvent.click(amyInput);
    expect(amyInput.selectionStart).toBe(0);
    expect(amyInput.selectionEnd).toBe(amyInput.value.length);

    fireEvent.click(within(dialog).getByRole("button", { name: "我知道了" }));
    await waitFor(() =>
      expect(
        screen.queryByTestId("domain-bind-success-guide-dialog"),
      ).not.toBeInTheDocument(),
    );
  });

  it("keeps delegation recovery guidance when the bind result falls back to the raw bind response", async () => {
    const onBind = vi.fn(async () => ({
      id: "dom_bound",
      mailDomain: "example.dev",
      rootDomain: "example.dev",
      zoneId: "zone_fallback",
      bindingSource: "project_bind" as const,
      status: "provisioning_error" as const,
      lastProvisionError:
        "Zone is pending activation in Cloudflare; retry after nameservers are delegated",
      createdAt: "2026-04-10T08:00:00.000Z",
      updatedAt: "2026-04-10T08:00:00.000Z",
      lastProvisionedAt: null,
      disabledAt: null,
    }));

    render(
      <MemoryRouter>
        <DomainsPageView
          domains={demoDomainCatalog}
          isDomainBindingEnabled
          isDomainLifecycleEnabled
          docsLinks={docsLinks}
          onBind={onBind}
          onEnable={vi.fn()}
          onEnableCatchAll={vi.fn()}
          onDisableCatchAll={vi.fn()}
          onDisable={vi.fn()}
          onDelete={vi.fn()}
          onRetry={vi.fn()}
        />
      </MemoryRouter>,
    );

    fireEvent.change(screen.getByLabelText("邮箱域名"), {
      target: { value: "example.dev" },
    });
    fireEvent.click(screen.getByRole("button", { name: "绑定到 Cloudflare" }));

    const dialog = await screen.findByTestId(
      "domain-bind-success-guide-dialog",
    );
    expect(dialog).toHaveTextContent("还差一步：切换权威 NS");
    expect(dialog).toHaveTextContent(
      "Cloudflare 已创建 zone，但 nameserver 还没返回；请先保持当前页面打开，系统会继续刷新。",
    );
    expect(dialog).not.toHaveTextContent("这次不需要修改 NS");
    expect(
      within(dialog).queryByRole("textbox", {
        name: /Nameserver /,
      }),
    ).not.toBeInTheDocument();
  });

  it("keeps row-level delegation guidance visible before nameservers are available", async () => {
    render(
      <MemoryRouter>
        <DomainsPageView
          domains={[
            {
              id: "dom_waiting_ns",
              mailDomain: "waiting-ns.example.dev",
              rootDomain: "waiting-ns.example.dev",
              zoneId: "zone_waiting_ns",
              bindingSource: "project_bind",
              cloudflareAvailability: "available",
              cloudflareStatus: "pending",
              nameServers: [],
              projectStatus: "provisioning_error",
              catchAllEnabled: false,
              lastProvisionError:
                "Zone is pending activation in Cloudflare; retry after nameservers are delegated",
              createdAt: "2026-04-10T08:00:00.000Z",
              updatedAt: "2026-04-10T08:00:00.000Z",
              lastProvisionedAt: null,
              disabledAt: null,
            },
          ]}
          isDomainBindingEnabled
          isDomainLifecycleEnabled
          docsLinks={docsLinks}
          onBind={vi.fn()}
          onEnable={vi.fn()}
          onEnableCatchAll={vi.fn()}
          onDisableCatchAll={vi.fn()}
          onDisable={vi.fn()}
          onDelete={vi.fn()}
          onRetry={vi.fn()}
        />
      </MemoryRouter>,
    );

    expect(
      screen.getByTestId("domain-catalog-delegation-guide"),
    ).toHaveTextContent("有 1 个项目域名待完成 Cloudflare NS 配置");
    const rowGuide = screen.getByTestId(
      "domain-row-delegation-guide-dom_waiting_ns",
    );
    expect(rowGuide).toHaveTextContent("待配置 NS");
    expect(rowGuide).toHaveTextContent("完成现有委派配置后重试。");

    fireEvent.click(
      screen.getByTestId("domain-details-trigger-dom_waiting_ns"),
    );
    const detailsDialog = await screen.findByTestId("domain-details-dialog");
    expect(detailsDialog).toHaveTextContent("先完成现有子域委派，再重试接入");
    expect(detailsDialog).toHaveTextContent(
      "nameserver 暂不可见；这是已有子域 zone 记录，请先保留页面，拿到 nameserver 后去父域 example.dev 的 DNS 管理处，为子域标签 waiting-ns 添加 NS。",
    );
  });

  it("shows apex-specific nameserver guidance for direct binds", async () => {
    const onBind = vi.fn(async () => ({
      id: "dom_apex",
      mailDomain: "example.com",
      rootDomain: "example.com",
      zoneId: "zone_example_com",
      bindingSource: "project_bind" as const,
      cloudflareAvailability: "available" as const,
      cloudflareStatus: "pending",
      nameServers: ["amy.ns.cloudflare.com", "kai.ns.cloudflare.com"],
      projectStatus: "provisioning_error" as const,
      lastProvisionError:
        "Zone is pending activation in Cloudflare; retry after nameservers are delegated",
      createdAt: "2026-04-10T08:00:00.000Z",
      updatedAt: "2026-04-10T08:00:00.000Z",
      lastProvisionedAt: null,
      disabledAt: null,
    }));

    render(
      <MemoryRouter>
        <DomainsPageView
          domains={demoDomainCatalog}
          isDomainBindingEnabled
          isDomainLifecycleEnabled
          docsLinks={docsLinks}
          onBind={onBind}
          onEnable={vi.fn()}
          onEnableCatchAll={vi.fn()}
          onDisableCatchAll={vi.fn()}
          onDisable={vi.fn()}
          onDelete={vi.fn()}
          onRetry={vi.fn()}
        />
      </MemoryRouter>,
    );

    fireEvent.change(screen.getByLabelText("邮箱域名"), {
      target: { value: "example.com" },
    });
    fireEvent.click(screen.getByRole("button", { name: "绑定到 Cloudflare" }));

    const dialog = await screen.findByTestId(
      "domain-bind-success-guide-dialog",
    );
    expect(dialog).toHaveTextContent("还差一步：切换权威 NS");
    expect(dialog).toHaveTextContent(
      "example.com。Cloudflare 已分配 nameserver。请把 example.com 的权威 NS 切到下面这组值；完成后再回来重试。",
    );
    expect(dialog).toHaveTextContent(
      "这是 apex 接入，请把 example.com 的权威 NS 切到下面这组值。",
    );
    expect(dialog).not.toHaveTextContent("父域");
  });

  it("uses the nearest known parent zone for nested existing child zones in the details dialog", async () => {
    render(
      <MemoryRouter>
        <DomainsPageView
          domains={[
            {
              id: "dom_nested",
              mailDomain: "ops.mail.example.com",
              rootDomain: "ops.mail.example.com",
              zoneId: "zone_ops_mail_example_com",
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
            },
            {
              id: null,
              mailDomain: "mail.example.com",
              rootDomain: "mail.example.com",
              zoneId: "zone_mail_example_com",
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
            },
            ...demoDomainCatalog,
          ]}
          isDomainBindingEnabled
          isDomainLifecycleEnabled
          docsLinks={docsLinks}
          onBind={vi.fn()}
          onEnable={vi.fn()}
          onEnableCatchAll={vi.fn()}
          onDisableCatchAll={vi.fn()}
          onDisable={vi.fn()}
          onDelete={vi.fn()}
          onRetry={vi.fn()}
        />
      </MemoryRouter>,
    );

    fireEvent.click(screen.getByTestId("domain-details-trigger-dom_nested"));
    const dialog = await screen.findByTestId("domain-details-dialog");
    expect(dialog).toHaveTextContent(
      "这是已有子域 zone 记录。若你继续维护它，请去父域 mail.example.com 的 DNS 管理处，为子域标签 ops 添加下面这组 NS。",
    );
    expect(dialog).toHaveTextContent(
      "请去父域 mail.example.com 的 DNS 管理处，为子域标签 ops 添加当前页面展示的 NS。",
    );
    expect(dialog).not.toHaveTextContent("子域标签 ops.mail");
    expect(dialog).not.toHaveTextContent("父域 example.com");
  });

  it("shows apex-specific recovery guidance in the catalog details dialog", async () => {
    render(
      <MemoryRouter>
        <DomainsPageView
          domains={[
            {
              id: "dom_apex_waiting",
              mailDomain: "example.com",
              rootDomain: "example.com",
              zoneId: "zone_example_com",
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
            },
          ]}
          isDomainBindingEnabled
          isDomainLifecycleEnabled
          docsLinks={docsLinks}
          onBind={vi.fn()}
          onEnable={vi.fn()}
          onEnableCatchAll={vi.fn()}
          onDisableCatchAll={vi.fn()}
          onDisable={vi.fn()}
          onDelete={vi.fn()}
          onRetry={vi.fn()}
        />
      </MemoryRouter>,
    );

    const rowGuide = screen.getByTestId(
      "domain-row-delegation-guide-dom_apex_waiting",
    );
    expect(rowGuide).toHaveTextContent("待切换 NS，完成权威 NS 切换后重试。");

    fireEvent.click(
      screen.getByTestId("domain-details-trigger-dom_apex_waiting"),
    );
    const detailsDialog = await screen.findByTestId("domain-details-dialog");
    expect(detailsDialog).toHaveTextContent("先切换权威 NS，再重试接入");
    expect(detailsDialog).toHaveTextContent(
      "这是 apex 接入，请把 example.com 的权威 NS 切到下面这组值。",
    );
    expect(detailsDialog).toHaveTextContent(
      "请先把 example.com 的权威 NS 切到当前页面展示的值。等 Cloudflare 变成 active 后，再回到列表点击“重试接入”。",
    );
    expect(detailsDialog).not.toHaveTextContent("父域");
  });

  it("refreshes the next-steps dialog when the domain catalog status changes", async () => {
    const onBind = vi.fn(async () => ({
      id: "dom_bound",
      mailDomain: "fkoai.site",
      rootDomain: "fkoai.site",
      zoneId: "zone_fkoaisite",
      bindingSource: "project_bind" as const,
      cloudflareAvailability: "available" as const,
      cloudflareStatus: "pending",
      nameServers: ["amy.ns.cloudflare.com", "kai.ns.cloudflare.com"],
      projectStatus: "provisioning_error" as const,
      lastProvisionError:
        "Zone is pending activation in Cloudflare; retry after nameservers are delegated",
      createdAt: "2026-04-10T08:00:00.000Z",
      updatedAt: "2026-04-10T08:00:00.000Z",
      lastProvisionedAt: null,
      disabledAt: null,
    }));

    const view = render(
      <MemoryRouter>
        <DomainsPageView
          domains={demoDomainCatalog}
          isDomainBindingEnabled
          isDomainLifecycleEnabled
          docsLinks={docsLinks}
          onBind={onBind}
          onEnable={vi.fn()}
          onEnableCatchAll={vi.fn()}
          onDisableCatchAll={vi.fn()}
          onDisable={vi.fn()}
          onDelete={vi.fn()}
          onRetry={vi.fn()}
        />
      </MemoryRouter>,
    );

    fireEvent.change(screen.getByLabelText("邮箱域名"), {
      target: { value: "fkoai.site" },
    });
    fireEvent.click(screen.getByRole("button", { name: "绑定到 Cloudflare" }));

    const dialog = await screen.findByTestId(
      "domain-bind-success-guide-dialog",
    );
    expect(dialog).toHaveTextContent("Cloudflare：pending");

    view.rerender(
      <MemoryRouter>
        <DomainsPageView
          domains={[
            ...demoDomainCatalog,
            {
              id: "dom_bound",
              mailDomain: "fkoai.site",
              rootDomain: "fkoai.site",
              zoneId: "zone_fkoaisite",
              bindingSource: "project_bind",
              cloudflareAvailability: "available",
              cloudflareStatus: "active",
              nameServers: ["amy.ns.cloudflare.com", "kai.ns.cloudflare.com"],
              projectStatus: "active",
              catchAllEnabled: false,
              lastProvisionError: null,
              createdAt: "2026-04-10T08:00:00.000Z",
              updatedAt: "2026-04-10T08:05:00.000Z",
              lastProvisionedAt: "2026-04-10T08:05:00.000Z",
              disabledAt: null,
            },
          ]}
          isDomainBindingEnabled
          isDomainLifecycleEnabled
          docsLinks={docsLinks}
          onBind={onBind}
          onEnable={vi.fn()}
          onEnableCatchAll={vi.fn()}
          onDisableCatchAll={vi.fn()}
          onDisable={vi.fn()}
          onDelete={vi.fn()}
          onRetry={vi.fn()}
        />
      </MemoryRouter>,
    );

    await waitFor(() =>
      expect(
        screen.getByTestId("domain-bind-success-guide-dialog"),
      ).toHaveTextContent("域名已接入，可继续使用"),
    );
    expect(
      screen.getByTestId("domain-bind-success-guide-dialog"),
    ).toHaveTextContent("Cloudflare：active");
  });

  it("stops asking for NS changes once Cloudflare is active even if the old delegation error is still cached", async () => {
    const onBind = vi.fn(async () => ({
      id: "dom_bound",
      mailDomain: "fkoai.site",
      rootDomain: "fkoai.site",
      zoneId: "zone_fkoaisite",
      bindingSource: "project_bind" as const,
      cloudflareAvailability: "available" as const,
      cloudflareStatus: "pending",
      nameServers: ["amy.ns.cloudflare.com", "kai.ns.cloudflare.com"],
      projectStatus: "provisioning_error" as const,
      lastProvisionError:
        "Zone is pending activation in Cloudflare; retry after nameservers are delegated",
      createdAt: "2026-04-10T08:00:00.000Z",
      updatedAt: "2026-04-10T08:00:00.000Z",
      lastProvisionedAt: null,
      disabledAt: null,
    }));

    const view = render(
      <MemoryRouter>
        <DomainsPageView
          domains={demoDomainCatalog}
          isDomainBindingEnabled
          isDomainLifecycleEnabled
          docsLinks={docsLinks}
          onBind={onBind}
          onEnable={vi.fn()}
          onEnableCatchAll={vi.fn()}
          onDisableCatchAll={vi.fn()}
          onDisable={vi.fn()}
          onDelete={vi.fn()}
          onRetry={vi.fn()}
        />
      </MemoryRouter>,
    );

    fireEvent.change(screen.getByLabelText("邮箱域名"), {
      target: { value: "fkoai.site" },
    });
    fireEvent.click(screen.getByRole("button", { name: "绑定到 Cloudflare" }));

    await screen.findByTestId("domain-bind-success-guide-dialog");

    view.rerender(
      <MemoryRouter>
        <DomainsPageView
          domains={[
            ...demoDomainCatalog,
            {
              id: "dom_bound",
              mailDomain: "fkoai.site",
              rootDomain: "fkoai.site",
              zoneId: "zone_fkoaisite",
              bindingSource: "project_bind",
              cloudflareAvailability: "available",
              cloudflareStatus: "active",
              nameServers: ["amy.ns.cloudflare.com", "kai.ns.cloudflare.com"],
              projectStatus: "provisioning_error",
              catchAllEnabled: false,
              lastProvisionError:
                "Zone is pending activation in Cloudflare; retry after nameservers are delegated",
              createdAt: "2026-04-10T08:00:00.000Z",
              updatedAt: "2026-04-10T08:05:00.000Z",
              lastProvisionedAt: null,
              disabledAt: null,
            },
          ]}
          isDomainBindingEnabled
          isDomainLifecycleEnabled
          docsLinks={docsLinks}
          onBind={onBind}
          onEnable={vi.fn()}
          onEnableCatchAll={vi.fn()}
          onDisableCatchAll={vi.fn()}
          onDisable={vi.fn()}
          onDelete={vi.fn()}
          onRetry={vi.fn()}
        />
      </MemoryRouter>,
    );

    await waitFor(() =>
      expect(
        screen.getByTestId("domain-bind-success-guide-dialog"),
      ).toHaveTextContent("绑定已提交，稍后再试"),
    );
    expect(
      screen.getByTestId("domain-bind-success-guide-dialog"),
    ).toHaveTextContent("这次不需要修改 NS");
    expect(
      screen.getByTestId("domain-bind-success-guide-dialog"),
    ).toHaveTextContent("Cloudflare：active");
    expect(
      screen.getByTestId("domain-bind-success-guide-dialog"),
    ).not.toHaveTextContent("完成域名委派");
  });

  it("refreshes the next-steps dialog when a project-bind row becomes active even if its timestamp lags behind the bind response", async () => {
    const onBind = vi.fn(async () => ({
      id: "dom_bound",
      mailDomain: "fkoai.site",
      rootDomain: "fkoai.site",
      zoneId: "zone_fkoaisite",
      bindingSource: "project_bind" as const,
      cloudflareAvailability: "available" as const,
      cloudflareStatus: "pending",
      nameServers: ["amy.ns.cloudflare.com", "kai.ns.cloudflare.com"],
      projectStatus: "provisioning_error" as const,
      lastProvisionError:
        "Zone is pending activation in Cloudflare; retry after nameservers are delegated",
      createdAt: "2026-04-10T08:00:00.000Z",
      updatedAt: "2026-04-10T08:05:00.000Z",
      lastProvisionedAt: null,
      disabledAt: null,
    }));

    const view = render(
      <MemoryRouter>
        <DomainsPageView
          domains={demoDomainCatalog}
          isDomainBindingEnabled
          isDomainLifecycleEnabled
          docsLinks={docsLinks}
          onBind={onBind}
          onEnable={vi.fn()}
          onEnableCatchAll={vi.fn()}
          onDisableCatchAll={vi.fn()}
          onDisable={vi.fn()}
          onDelete={vi.fn()}
          onRetry={vi.fn()}
        />
      </MemoryRouter>,
    );

    fireEvent.change(screen.getByLabelText("邮箱域名"), {
      target: { value: "fkoai.site" },
    });
    fireEvent.click(screen.getByRole("button", { name: "绑定到 Cloudflare" }));

    await screen.findByTestId("domain-bind-success-guide-dialog");

    view.rerender(
      <MemoryRouter>
        <DomainsPageView
          domains={[
            ...demoDomainCatalog,
            {
              id: "dom_bound",
              mailDomain: "fkoai.site",
              rootDomain: "fkoai.site",
              zoneId: "zone_fkoaisite",
              bindingSource: "project_bind",
              cloudflareAvailability: "available",
              cloudflareStatus: "active",
              nameServers: ["amy.ns.cloudflare.com", "kai.ns.cloudflare.com"],
              projectStatus: "active",
              catchAllEnabled: false,
              lastProvisionError: null,
              createdAt: "2026-04-10T08:00:00.000Z",
              updatedAt: "2026-04-10T08:04:00.000Z",
              lastProvisionedAt: "2026-04-10T08:04:00.000Z",
              disabledAt: null,
            },
          ]}
          isDomainBindingEnabled
          isDomainLifecycleEnabled
          docsLinks={docsLinks}
          onBind={onBind}
          onEnable={vi.fn()}
          onEnableCatchAll={vi.fn()}
          onDisableCatchAll={vi.fn()}
          onDisable={vi.fn()}
          onDelete={vi.fn()}
          onRetry={vi.fn()}
        />
      </MemoryRouter>,
    );

    await waitFor(() =>
      expect(
        screen.getByTestId("domain-bind-success-guide-dialog"),
      ).toHaveTextContent("域名已接入，可继续使用"),
    );
  });

  it("does not show nameserver delegation steps for non-delegation provisioning errors", async () => {
    const onBind = vi.fn(async () => ({
      id: "dom_rate_limit",
      mailDomain: "retry.dev",
      rootDomain: "retry.dev",
      zoneId: "zone_retry",
      bindingSource: "project_bind" as const,
      cloudflareAvailability: "available" as const,
      cloudflareStatus: "active",
      nameServers: ["amy.ns.cloudflare.com", "kai.ns.cloudflare.com"],
      projectStatus: "provisioning_error" as const,
      lastProvisionError: "Cloudflare API rate limit reached; retry later",
      createdAt: "2026-04-10T08:00:00.000Z",
      updatedAt: "2026-04-10T08:00:00.000Z",
      lastProvisionedAt: null,
      disabledAt: null,
    }));

    render(
      <MemoryRouter>
        <DomainsPageView
          domains={demoDomainCatalog}
          isDomainBindingEnabled
          isDomainLifecycleEnabled
          docsLinks={docsLinks}
          onBind={onBind}
          onEnable={vi.fn()}
          onEnableCatchAll={vi.fn()}
          onDisableCatchAll={vi.fn()}
          onDisable={vi.fn()}
          onDelete={vi.fn()}
          onRetry={vi.fn()}
        />
      </MemoryRouter>,
    );

    fireEvent.change(screen.getByLabelText("邮箱域名"), {
      target: { value: "retry.dev" },
    });
    fireEvent.click(screen.getByRole("button", { name: "绑定到 Cloudflare" }));

    const dialog = await screen.findByTestId(
      "domain-bind-success-guide-dialog",
    );
    expect(dialog).toHaveTextContent("绑定已提交，稍后再试");
    expect(dialog).toHaveTextContent("这次不需要修改 NS");
    expect(dialog).not.toHaveTextContent("完成域名委派");
    expect(
      within(dialog).queryByRole("textbox", {
        name: "Nameserver amy.ns.cloudflare.com",
      }),
    ).not.toBeInTheDocument();
  });

  it("hides Cloudflare lifecycle actions when runtime management is off", () => {
    render(
      <MemoryRouter>
        <DomainsPageView
          domains={demoDomainCatalog}
          isDomainBindingEnabled={false}
          isDomainLifecycleEnabled={false}
          docsLinks={docsLinks}
          onBind={vi.fn()}
          onEnable={vi.fn()}
          onEnableCatchAll={vi.fn()}
          onDisableCatchAll={vi.fn()}
          onDisable={vi.fn()}
          onDelete={vi.fn()}
          onRetry={vi.fn()}
        />
      </MemoryRouter>,
    );

    expect(
      screen.queryByRole("heading", { name: "绑定邮箱域名" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "删除域名" }),
    ).not.toBeInTheDocument();
  });

  it("renders a recoverable error state instead of an empty catalog", () => {
    render(
      <MemoryRouter>
        <DomainsPageView
          domains={[]}
          docsLinks={docsLinks}
          error={{
            variant: "recoverable",
            title: "域名目录暂时加载失败",
            description: "Cloudflare 域名目录目前不可用。",
            details: '{"error":"Authentication error"}',
          }}
          onReload={vi.fn()}
          onBind={vi.fn()}
          onEnable={vi.fn()}
          onEnableCatchAll={vi.fn()}
          onDisableCatchAll={vi.fn()}
          onDisable={vi.fn()}
          onDelete={vi.fn()}
          onRetry={vi.fn()}
        />
      </MemoryRouter>,
    );

    expect(
      screen.getByRole("heading", { name: "域名目录暂时加载失败" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "重新加载域名目录" }),
    ).toBeInTheDocument();
    expect(screen.queryByText("relay.example.test")).not.toBeInTheDocument();
  });

  it("renders structured guidance and a docs link for missing zone.create permission", async () => {
    const onBind = vi.fn(async () => {
      throw new Error(
        'Requires permission "com.cloudflare.api.account.zone.create" to create zones for the selected account',
      );
    });

    render(
      <MemoryRouter>
        <DomainsPageView
          domains={demoDomainCatalog}
          isDomainBindingEnabled
          isDomainLifecycleEnabled
          docsLinks={docsLinks}
          onBind={onBind}
          onEnable={vi.fn()}
          onEnableCatchAll={vi.fn()}
          onDisableCatchAll={vi.fn()}
          onDisable={vi.fn()}
          onDelete={vi.fn()}
          onRetry={vi.fn()}
        />
      </MemoryRouter>,
    );

    fireEvent.change(screen.getByLabelText("邮箱域名"), {
      target: { value: "fkoai.site" },
    });
    fireEvent.click(screen.getByRole("button", { name: "绑定到 Cloudflare" }));

    expect(
      await screen.findByText("缺少 zone.create 权限"),
    ).toBeInTheDocument();

    const docsLink = screen.getByRole("link", { name: "查看处理步骤" });
    expect(docsLink).toHaveAttribute(
      "href",
      "https://docs.example.test/zh/project-domain-binding#missing-zone-create-permission",
    );
    expect(docsLink).toHaveAttribute("target", "_blank");
    expect(screen.getByText(/Requires permission/)).toBeInTheDocument();
  });

  it("routes existing Cloudflare zones to the manual bind guide instead of the local duplicate guide", async () => {
    const onBind = vi.fn(async () => {
      throw new Error("A zone with that name already exists");
    });

    render(
      <MemoryRouter>
        <DomainsPageView
          domains={demoDomainCatalog}
          isDomainBindingEnabled
          isDomainLifecycleEnabled
          docsLinks={docsLinks}
          onBind={onBind}
          onEnable={vi.fn()}
          onEnableCatchAll={vi.fn()}
          onDisableCatchAll={vi.fn()}
          onDisable={vi.fn()}
          onDelete={vi.fn()}
          onRetry={vi.fn()}
        />
      </MemoryRouter>,
    );

    fireEvent.change(screen.getByLabelText("邮箱域名"), {
      target: { value: "zone-exists.dev" },
    });
    fireEvent.click(screen.getByRole("button", { name: "绑定到 Cloudflare" }));

    expect(
      await screen.findByText("Cloudflare 里已存在这个域名"),
    ).toBeInTheDocument();
    expect(screen.queryByText("这个域名已经在项目里")).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "查看处理步骤" })).toHaveAttribute(
      "href",
      "https://docs.example.test/zh/domain-catalog-enablement#bind-domain-in-cloudflare",
    );
  });

  it("renders backend subdomain guidance as a structured bind error", async () => {
    const onBind = vi.fn(async () => {
      throw new ApiClientError(
        "Direct subdomain binding is not supported",
        {
          code: "subdomain_direct_bind_not_supported",
          mailDomain: "mail.customer.com",
          recommendedApex: "customer.com",
          recommendedMailboxSubdomain: "mail",
        },
        400,
      );
    });

    render(
      <MemoryRouter>
        <DomainsPageView
          domains={demoDomainCatalog}
          isDomainBindingEnabled
          isDomainLifecycleEnabled
          docsLinks={docsLinks}
          onBind={onBind}
          onEnable={vi.fn()}
          onEnableCatchAll={vi.fn()}
          onDisableCatchAll={vi.fn()}
          onDisable={vi.fn()}
          onDelete={vi.fn()}
          onRetry={vi.fn()}
        />
      </MemoryRouter>,
    );

    fireEvent.change(screen.getByLabelText("邮箱域名"), {
      target: { value: "customer.com" },
    });
    fireEvent.click(screen.getByRole("button", { name: "绑定到 Cloudflare" }));

    const errorBubble = await screen.findByTestId("domain-bind-error");
    expect(errorBubble).toHaveTextContent(
      "当前 Cloudflare 账号不支持直接绑定子域",
    );
    expect(errorBubble).toHaveTextContent(
      "请改为绑定 customer.com，再在创建邮箱时把子域填成 mail，即可继续使用 user@mail.customer.com 这类地址。",
    );
  });

  it("routes existing child zones to the catalog enable flow instead of apex-only guidance", async () => {
    const onBind = vi.fn(async () => {
      throw new ApiClientError(
        "Mailbox domain is already available in Cloudflare",
        {
          code: "subdomain_zone_available_in_catalog",
          mailDomain: "mail.customer.com",
          zoneId: "zone_mail_customer_com",
        },
        409,
      );
    });

    render(
      <MemoryRouter>
        <DomainsPageView
          domains={[
            {
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
            },
            ...demoDomainCatalog,
          ]}
          isDomainBindingEnabled
          isDomainLifecycleEnabled
          docsLinks={docsLinks}
          onBind={onBind}
          onEnable={vi.fn()}
          onEnableCatchAll={vi.fn()}
          onDisableCatchAll={vi.fn()}
          onDisable={vi.fn()}
          onDelete={vi.fn()}
          onRetry={vi.fn()}
        />
      </MemoryRouter>,
    );

    fireEvent.change(screen.getByLabelText("邮箱域名"), {
      target: { value: "mail.customer.com" },
    });
    fireEvent.click(screen.getByRole("button", { name: "绑定到 Cloudflare" }));

    const errorBubble = await screen.findByTestId("domain-bind-error");
    expect(errorBubble).toHaveTextContent("这个子域 zone 已经在 Cloudflare 里");
    expect(errorBubble).toHaveTextContent(
      "请回到域名目录，找到 mail.customer.com 后点击“启用域名”；这条已有 zone 不需要再改走 apex 直绑。",
    );
    expect(errorBubble).not.toHaveTextContent(
      "当前 Cloudflare 账号不支持直接绑定子域",
    );
    expect(
      within(errorBubble).getByRole("link", { name: "查看处理步骤" }),
    ).toHaveAttribute(
      "href",
      "https://docs.example.test/zh/domain-catalog-enablement#enable-zone-in-project",
    );
  });

  it("preserves the backend error text for unclassified bind failures", async () => {
    const onBind = vi.fn(async () => {
      throw new Error("Cloudflare API request failed: plan limit exceeded");
    });

    render(
      <MemoryRouter>
        <DomainsPageView
          domains={demoDomainCatalog}
          isDomainBindingEnabled
          isDomainLifecycleEnabled
          docsLinks={docsLinks}
          onBind={onBind}
          onEnable={vi.fn()}
          onEnableCatchAll={vi.fn()}
          onDisableCatchAll={vi.fn()}
          onDisable={vi.fn()}
          onDelete={vi.fn()}
          onRetry={vi.fn()}
        />
      </MemoryRouter>,
    );

    fireEvent.change(screen.getByLabelText("邮箱域名"), {
      target: { value: "mystery.dev" },
    });
    fireEvent.click(screen.getByRole("button", { name: "绑定到 Cloudflare" }));

    const errorBubble = await screen.findByTestId("domain-bind-error");
    expect(errorBubble).toHaveTextContent("Cloudflare 绑定失败");
    expect(errorBubble).toHaveTextContent(
      "Cloudflare API request failed: plan limit exceeded",
    );
    expect(
      within(errorBubble).queryByRole("link", { name: "查看处理步骤" }),
    ).not.toBeInTheDocument();
  });

  it("classifies missing Email Routing runtime config separately from permission failures", async () => {
    const onBind = vi.fn(async () => {
      throw new Error(
        "Email Routing management is enabled but EMAIL_WORKER_NAME is not configured",
      );
    });

    render(
      <MemoryRouter>
        <DomainsPageView
          domains={demoDomainCatalog}
          isDomainBindingEnabled
          isDomainLifecycleEnabled
          docsLinks={docsLinks}
          onBind={onBind}
          onEnable={vi.fn()}
          onEnableCatchAll={vi.fn()}
          onDisableCatchAll={vi.fn()}
          onDisable={vi.fn()}
          onDelete={vi.fn()}
          onRetry={vi.fn()}
        />
      </MemoryRouter>,
    );

    fireEvent.change(screen.getByLabelText("邮箱域名"), {
      target: { value: "fkoai.site" },
    });
    fireEvent.click(screen.getByRole("button", { name: "绑定到 Cloudflare" }));

    expect(
      await screen.findByText("缺少 Email Routing 运行时配置"),
    ).toBeInTheDocument();
    expect(
      screen.queryByText("缺少 Email Routing 写权限"),
    ).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "查看处理步骤" })).toHaveAttribute(
      "href",
      "https://docs.example.test/zh/project-domain-binding#email-routing-runtime-config-missing",
    );
  });

  it("does not route generic email-routing activation failures to the nameserver delegation guide", async () => {
    const onBind = vi.fn(async () => {
      throw new Error(
        "Email Routing activation failed because the account token cannot manage routes",
      );
    });

    render(
      <MemoryRouter>
        <DomainsPageView
          domains={demoDomainCatalog}
          isDomainBindingEnabled
          isDomainLifecycleEnabled
          docsLinks={docsLinks}
          onBind={onBind}
          onEnable={vi.fn()}
          onEnableCatchAll={vi.fn()}
          onDisableCatchAll={vi.fn()}
          onDisable={vi.fn()}
          onDelete={vi.fn()}
          onRetry={vi.fn()}
        />
      </MemoryRouter>,
    );

    fireEvent.change(screen.getByLabelText("邮箱域名"), {
      target: { value: "fkoai.site" },
    });
    fireEvent.click(screen.getByRole("button", { name: "绑定到 Cloudflare" }));

    expect(
      await screen.findByText("缺少 Email Routing 写权限"),
    ).toBeInTheDocument();
    expect(screen.queryByText("zone 尚未激活")).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "查看处理步骤" })).toHaveAttribute(
      "href",
      "https://docs.example.test/zh/project-domain-binding#email-routing-auth-or-permission-failure",
    );
  });

  it("keeps transient email-routing failures as raw bind errors instead of permission hints", async () => {
    const onBind = vi.fn(async () => {
      throw new Error("Email Routing API request failed: upstream 502");
    });

    render(
      <MemoryRouter>
        <DomainsPageView
          domains={demoDomainCatalog}
          isDomainBindingEnabled
          isDomainLifecycleEnabled
          docsLinks={docsLinks}
          onBind={onBind}
          onEnable={vi.fn()}
          onEnableCatchAll={vi.fn()}
          onDisableCatchAll={vi.fn()}
          onDisable={vi.fn()}
          onDelete={vi.fn()}
          onRetry={vi.fn()}
        />
      </MemoryRouter>,
    );

    fireEvent.change(screen.getByLabelText("邮箱域名"), {
      target: { value: "fkoai.site" },
    });
    fireEvent.click(screen.getByRole("button", { name: "绑定到 Cloudflare" }));

    const errorBubble = await screen.findByTestId("domain-bind-error");
    expect(errorBubble).toHaveTextContent("Cloudflare 绑定失败");
    expect(errorBubble).toHaveTextContent(
      "Email Routing API request failed: upstream 502",
    );
    expect(errorBubble).not.toHaveTextContent("缺少 Email Routing 写权限");
    expect(
      within(errorBubble).queryByRole("link", { name: "查看处理步骤" }),
    ).not.toBeInTheDocument();
  });

  it("keeps structured guidance but hides the docs CTA when docs origin is unavailable", async () => {
    const onBind = vi.fn(async () => {
      throw new Error(
        'Requires permission "com.cloudflare.api.account.zone.create" to create zones for the selected account',
      );
    });

    render(
      <MemoryRouter>
        <DomainsPageView
          domains={demoDomainCatalog}
          isDomainBindingEnabled
          isDomainLifecycleEnabled
          docsLinks={null}
          onBind={onBind}
          onEnable={vi.fn()}
          onEnableCatchAll={vi.fn()}
          onDisableCatchAll={vi.fn()}
          onDisable={vi.fn()}
          onDelete={vi.fn()}
          onRetry={vi.fn()}
        />
      </MemoryRouter>,
    );

    fireEvent.change(screen.getByLabelText("邮箱域名"), {
      target: { value: "fkoai.site" },
    });
    fireEvent.click(screen.getByRole("button", { name: "绑定到 Cloudflare" }));

    expect(
      await screen.findByText("缺少 zone.create 权限"),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("link", { name: "查看处理步骤" }),
    ).not.toBeInTheDocument();
  });

  it("keeps long zone ids inside the details dialog without dropping the copy action", async () => {
    const longZoneId =
      "4a2d7f0e9c1b8a6d5e4f3c2b1a09ffeeddccbbaa99887766554433221100aa55";
    const failedDomain = demoDomainCatalog.find(
      (domain) => domain.id === "dom_failed",
    );

    if (!failedDomain) {
      throw new Error("missing demo domain dom_failed");
    }

    render(
      <MemoryRouter>
        <DomainsPageView
          domains={[
            {
              ...failedDomain,
              id: "dom_long_zone",
              mailDomain: "long-zone.example.dev",
              rootDomain: "long-zone.example.dev",
              zoneId: longZoneId,
            },
            ...demoDomainCatalog.filter((domain) => domain.id !== "dom_failed"),
          ]}
          isDomainBindingEnabled
          isDomainLifecycleEnabled
          docsLinks={docsLinks}
          onBind={vi.fn()}
          onEnable={vi.fn()}
          onEnableCatchAll={vi.fn()}
          onDisableCatchAll={vi.fn()}
          onDisable={vi.fn()}
          onDelete={vi.fn()}
          onRetry={vi.fn()}
        />
      </MemoryRouter>,
    );

    fireEvent.click(screen.getByTestId("domain-details-trigger-dom_long_zone"));
    const detailsDialog = await screen.findByTestId("domain-details-dialog");
    expect(
      within(detailsDialog).getByRole("textbox", {
        name: "Zone long-zone.example.dev",
      }),
    ).toHaveValue(longZoneId);
    expect(detailsDialog).toHaveTextContent("点击输入框可全选");
    expect(
      within(detailsDialog).getByRole("button", {
        name: `复制 zone ${longZoneId}`,
      }),
    ).toBeInTheDocument();
  });

  it("ignores stale catalog matches after bind and keeps the fresh delegation dialog", async () => {
    domainsHookState.catalog = [
      {
        id: "dom_stale",
        mailDomain: "reuse.dev",
        rootDomain: "reuse.dev",
        zoneId: "zone_reuse",
        bindingSource: "catalog",
        cloudflareAvailability: "available",
        cloudflareStatus: "active",
        nameServers: ["amy.ns.cloudflare.com", "kai.ns.cloudflare.com"],
        projectStatus: "disabled",
        catchAllEnabled: false,
        lastProvisionError: null,
        createdAt: "2026-04-10T08:00:00.000Z",
        updatedAt: "2026-04-10T08:00:00.000Z",
        lastProvisionedAt: "2026-04-10T08:00:00.000Z",
        disabledAt: "2026-04-10T08:00:00.000Z",
      },
    ];
    domainsHookState.bindMutateAsync = vi.fn(async () => ({
      id: "dom_stale",
      mailDomain: "reuse.dev",
      rootDomain: "reuse.dev",
      zoneId: "zone_reuse",
      bindingSource: "project_bind" as const,
      status: "provisioning_error" as const,
      lastProvisionError:
        "Zone is pending activation in Cloudflare; retry after nameservers are delegated",
      createdAt: "2026-04-10T08:00:00.000Z",
      updatedAt: "2026-04-10T08:05:00.000Z",
      lastProvisionedAt: null,
      disabledAt: null,
    }));
    domainsHookState.refetch = vi.fn(async () => ({
      data: {
        domains: [
          {
            id: "dom_stale",
            mailDomain: "reuse.dev",
            rootDomain: "reuse.dev",
            zoneId: "zone_reuse",
            bindingSource: "catalog",
            cloudflareAvailability: "available",
            cloudflareStatus: "active",
            nameServers: ["amy.ns.cloudflare.com", "kai.ns.cloudflare.com"],
            projectStatus: "disabled",
            catchAllEnabled: false,
            lastProvisionError: null,
            createdAt: "2026-04-10T08:00:00.000Z",
            updatedAt: "2026-04-10T08:00:00.000Z",
            lastProvisionedAt: "2026-04-10T08:00:00.000Z",
            disabledAt: "2026-04-10T08:00:00.000Z",
          },
        ],
        cloudflareSync: domainsHookState.cloudflareSync,
      },
    }));

    render(
      <MemoryRouter>
        <DomainsPage />
      </MemoryRouter>,
    );

    fireEvent.change(screen.getByLabelText("邮箱域名"), {
      target: { value: "reuse.dev" },
    });
    fireEvent.click(screen.getByRole("button", { name: "绑定到 Cloudflare" }));

    const dialog = await screen.findByTestId(
      "domain-bind-success-guide-dialog",
    );
    expect(dialog).toHaveTextContent("还差一步：切换权威 NS");
    expect(dialog).toHaveTextContent(
      "Cloudflare 已创建 zone，但 nameserver 还没返回；请先保持当前页面打开，系统会继续刷新。",
    );
    expect(queryClientState.setQueryData).toHaveBeenCalledWith(
      ["domains", "catalog"],
      expect.any(Function),
    );
  });

  it("keeps the cached catalog visible when a background refetch fails", () => {
    domainsHookState.catalog = demoDomainCatalog;
    domainsHookState.error = new Error("Cloudflare temporarily unavailable");

    render(
      <MemoryRouter>
        <DomainsPage />
      </MemoryRouter>,
    );

    expect(screen.getByText("relay.example.test")).toBeInTheDocument();
    expect(
      screen.queryByRole("heading", { name: "域名目录暂时加载失败" }),
    ).not.toBeInTheDocument();
  });
});
