import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

import { buildPublicDocsLinks } from "@/lib/public-docs";
import { demoDomainCatalog, demoSessionUser } from "@/mocks/data";
import { DomainsPage, DomainsPageView } from "@/pages/domains-page";

const queryClientState = {
  setQueryData: vi.fn(),
};

const domainsHookState = {
  catalog: demoDomainCatalog,
  error: null as Error | null,
  refetch: vi.fn(),
  bindMutateAsync: vi.fn(),
  role: "admin" as "admin" | "member",
  cloudflareDomainBindingEnabled: true,
  cloudflareDomainLifecycleEnabled: true,
};

vi.mock("@tanstack/react-query", async () => {
  const actual = await vi.importActual<typeof import("@tanstack/react-query")>(
    "@tanstack/react-query",
  );
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
    },
  }),
}));

vi.mock("@/hooks/use-domains", () => ({
  domainCatalogQueryKey: ["domains", "catalog"],
  useDomainCatalogQuery: () => ({
    data: domainsHookState.catalog,
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
  useRetryDomainMutation: () => ({
    mutateAsync: vi.fn(),
  }),
}));

afterEach(() => {
  domainsHookState.catalog = demoDomainCatalog;
  domainsHookState.error = null;
  domainsHookState.refetch = vi.fn();
  domainsHookState.bindMutateAsync = vi.fn();
  domainsHookState.role = "admin";
  domainsHookState.cloudflareDomainBindingEnabled = true;
  domainsHookState.cloudflareDomainLifecycleEnabled = true;
  queryClientState.setQueryData.mockReset();
});

const docsLinks = buildPublicDocsLinks("https://docs.example.test");

if (!docsLinks) {
  throw new Error("docs links are required for domains tests");
}

describe("domains page view", () => {
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
          onDisable={vi.fn()}
          onDelete={onDelete}
          onRetry={vi.fn()}
        />
      </MemoryRouter>,
    );

    expect(
      screen.getByRole("heading", { name: "绑定新域名" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "绑定到 Cloudflare" }),
    ).toBeInTheDocument();
    const bindGuide = screen.getByTestId("domain-bind-delegation-guide");
    expect(bindGuide).toHaveTextContent(
      "直绑后若停在 pending / provisioning_error：先改 NS，再重试。",
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
      "有 1 个项目直绑域名待完成 NS 委派；先改 NS，再点“重试接入”。",
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
    expect(rowGuide).toHaveTextContent("待委派");
    expect(rowGuide).toHaveTextContent("改 NS 后重试。");
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
    expect(detailsDialog).toHaveTextContent("先改 NS，再重试接入");
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

  it("uses a gapped inline layout for Cloudflare status badges", () => {
    render(
      <MemoryRouter>
        <DomainsPageView
          domains={demoDomainCatalog}
          isDomainBindingEnabled
          isDomainLifecycleEnabled
          onBind={vi.fn()}
          onEnable={vi.fn()}
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
          onDisable={vi.fn()}
          onDelete={vi.fn()}
          onRetry={vi.fn()}
        />
      </MemoryRouter>,
    );

    const form = screen.getByTestId("domain-bind-form");
    const error = screen.getByTestId("domain-bind-error");
    const submitSlot = screen.getByTestId("domain-bind-submit-slot");
    const input = screen.getByLabelText("根域名");
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
      await screen.findByText("请输入有效根域名，例如 example.com"),
    ).toBeInTheDocument();
    expect(onBind).not.toHaveBeenCalled();

    fireEvent.change(input, { target: { value: "bound.example.org" } });
    fireEvent.click(submitButton);

    expect(await screen.findByText("这个域名已经在项目里")).toBeInTheDocument();
    expect(
      screen.queryByText(/Mailbox domain already exists/),
    ).not.toBeInTheDocument();
    await waitFor(() =>
      expect(onBind).toHaveBeenCalledWith({
        rootDomain: "bound.example.org",
      }),
    );
  });

  it("seeds fallback catalog polling when bind succeeds before the catalog catches up", async () => {
    domainsHookState.bindMutateAsync = vi.fn(async () => ({
      id: "dom_bound",
      rootDomain: "fallback.example.dev",
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
      data: demoDomainCatalog,
    }));

    render(
      <MemoryRouter>
        <DomainsPage />
      </MemoryRouter>,
    );

    fireEvent.change(screen.getByLabelText("根域名"), {
      target: { value: "fallback.example.dev" },
    });
    fireEvent.click(screen.getByRole("button", { name: "绑定到 Cloudflare" }));

    const dialog = await screen.findByTestId(
      "domain-bind-success-guide-dialog",
    );
    expect(dialog).toHaveTextContent("还差一步：完成域名委派");
    expect(queryClientState.setQueryData).toHaveBeenCalledWith(
      ["domains", "catalog"],
      expect.any(Function),
    );

    const setQueryDataUpdater =
      queryClientState.setQueryData.mock.calls[0]?.[1];
    if (typeof setQueryDataUpdater !== "function") {
      throw new Error("expected setQueryData updater");
    }

    expect(setQueryDataUpdater(demoDomainCatalog)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          rootDomain: "fallback.example.dev",
          cloudflareStatus: "pending",
          projectStatus: "provisioning_error",
        }),
      ]),
    );
  });

  it("opens a next-steps dialog immediately after a successful direct bind", async () => {
    const onBind = vi.fn(async () => ({
      id: "dom_bound",
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

    render(
      <MemoryRouter>
        <DomainsPageView
          domains={demoDomainCatalog}
          isDomainBindingEnabled
          isDomainLifecycleEnabled
          docsLinks={docsLinks}
          onBind={onBind}
          onEnable={vi.fn()}
          onDisable={vi.fn()}
          onDelete={vi.fn()}
          onRetry={vi.fn()}
        />
      </MemoryRouter>,
    );

    fireEvent.change(screen.getByLabelText("根域名"), {
      target: { value: "fkoai.site" },
    });
    fireEvent.click(screen.getByRole("button", { name: "绑定到 Cloudflare" }));

    const dialog = await screen.findByTestId(
      "domain-bind-success-guide-dialog",
    );
    expect(dialog).toHaveTextContent("还差一步：完成域名委派");
    expect(dialog).toHaveTextContent(
      "fkoai.site。Cloudflare 已分配 nameserver。",
    );
    expect(dialog).toHaveTextContent(
      "将当前域名的 NS 改成下面显示的 Cloudflare nameserver。",
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
      rootDomain: "fallback.example.dev",
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
          onDisable={vi.fn()}
          onDelete={vi.fn()}
          onRetry={vi.fn()}
        />
      </MemoryRouter>,
    );

    fireEvent.change(screen.getByLabelText("根域名"), {
      target: { value: "fallback.example.dev" },
    });
    fireEvent.click(screen.getByRole("button", { name: "绑定到 Cloudflare" }));

    const dialog = await screen.findByTestId(
      "domain-bind-success-guide-dialog",
    );
    expect(dialog).toHaveTextContent("还差一步：完成域名委派");
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

  it("refreshes the next-steps dialog when the domain catalog status changes", async () => {
    const onBind = vi.fn(async () => ({
      id: "dom_bound",
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
          onDisable={vi.fn()}
          onDelete={vi.fn()}
          onRetry={vi.fn()}
        />
      </MemoryRouter>,
    );

    fireEvent.change(screen.getByLabelText("根域名"), {
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
              rootDomain: "fkoai.site",
              zoneId: "zone_fkoaisite",
              bindingSource: "project_bind",
              cloudflareAvailability: "available",
              cloudflareStatus: "active",
              nameServers: ["amy.ns.cloudflare.com", "kai.ns.cloudflare.com"],
              projectStatus: "active",
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
          onDisable={vi.fn()}
          onDelete={vi.fn()}
          onRetry={vi.fn()}
        />
      </MemoryRouter>,
    );

    fireEvent.change(screen.getByLabelText("根域名"), {
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
              rootDomain: "fkoai.site",
              zoneId: "zone_fkoaisite",
              bindingSource: "project_bind",
              cloudflareAvailability: "available",
              cloudflareStatus: "active",
              nameServers: ["amy.ns.cloudflare.com", "kai.ns.cloudflare.com"],
              projectStatus: "provisioning_error",
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

  it("does not show nameserver delegation steps for non-delegation provisioning errors", async () => {
    const onBind = vi.fn(async () => ({
      id: "dom_rate_limit",
      rootDomain: "retry.example.dev",
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
          onDisable={vi.fn()}
          onDelete={vi.fn()}
          onRetry={vi.fn()}
        />
      </MemoryRouter>,
    );

    fireEvent.change(screen.getByLabelText("根域名"), {
      target: { value: "retry.example.dev" },
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
          onDisable={vi.fn()}
          onDelete={vi.fn()}
          onRetry={vi.fn()}
        />
      </MemoryRouter>,
    );

    expect(
      screen.queryByRole("heading", { name: "绑定新域名" }),
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
          onDisable={vi.fn()}
          onDelete={vi.fn()}
          onRetry={vi.fn()}
        />
      </MemoryRouter>,
    );

    fireEvent.change(screen.getByLabelText("根域名"), {
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
    expect(screen.queryByText(/Requires permission/)).not.toBeInTheDocument();
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
          onDisable={vi.fn()}
          onDelete={vi.fn()}
          onRetry={vi.fn()}
        />
      </MemoryRouter>,
    );

    fireEvent.change(screen.getByLabelText("根域名"), {
      target: { value: "existing-zone.example.dev" },
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
          onDisable={vi.fn()}
          onDelete={vi.fn()}
          onRetry={vi.fn()}
        />
      </MemoryRouter>,
    );

    fireEvent.change(screen.getByLabelText("根域名"), {
      target: { value: "mystery.example.dev" },
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
          onDisable={vi.fn()}
          onDelete={vi.fn()}
          onRetry={vi.fn()}
        />
      </MemoryRouter>,
    );

    fireEvent.change(screen.getByLabelText("根域名"), {
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
          onDisable={vi.fn()}
          onDelete={vi.fn()}
          onRetry={vi.fn()}
        />
      </MemoryRouter>,
    );

    fireEvent.change(screen.getByLabelText("根域名"), {
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
