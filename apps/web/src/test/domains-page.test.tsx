import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

import { demoDomainCatalog, demoSessionUser } from "@/mocks/data";
import { DomainsPage, DomainsPageView } from "@/pages/domains-page";

const domainsHookState = {
  catalog: demoDomainCatalog,
  error: null as Error | null,
  refetch: vi.fn(),
  role: "admin" as "admin" | "member",
};

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

vi.mock("@/hooks/use-domains", () => ({
  useDomainCatalogQuery: () => ({
    data: domainsHookState.catalog,
    error: domainsHookState.error,
    refetch: domainsHookState.refetch,
  }),
  useCreateDomainMutation: () => ({
    isPending: false,
    mutateAsync: vi.fn(),
  }),
  useDisableDomainMutation: () => ({
    mutate: vi.fn(),
  }),
  useRetryDomainMutation: () => ({
    mutate: vi.fn(),
  }),
}));

afterEach(() => {
  domainsHookState.catalog = demoDomainCatalog;
  domainsHookState.error = null;
  domainsHookState.refetch = vi.fn();
  domainsHookState.role = "admin";
});

describe("domains page view", () => {
  it("renders binding controls, statuses, and delete actions", async () => {
    const onDelete = vi.fn(async () => undefined);

    render(
      <MemoryRouter>
        <DomainsPageView
          domains={demoDomainCatalog}
          isDomainBindingEnabled
          isDomainLifecycleEnabled
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
    expect(screen.getByText("relay.example.test")).toBeInTheDocument();
    expect(screen.getAllByText("project_bind")).toHaveLength(2);
    expect(screen.getByText("provisioning_error")).toBeInTheDocument();
    expect(screen.getByText("Zone access denied")).toBeInTheDocument();
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

  it("hides Cloudflare lifecycle actions when runtime management is off", () => {
    render(
      <MemoryRouter>
        <DomainsPageView
          domains={demoDomainCatalog}
          isDomainBindingEnabled={false}
          isDomainLifecycleEnabled={false}
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
          error={{
            variant: "recoverable",
            title: "域名目录暂时加载失败",
            description: "Cloudflare 域名目录目前不可用。",
            details: '{"error":"Authentication error"}',
          }}
          onReload={vi.fn()}
          onEnable={vi.fn()}
          onDisable={vi.fn()}
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
