import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

import { demoDomainCatalog, demoSessionUser } from "@/mocks/data";
import { DomainsPage, DomainsPageView } from "@/pages/domains-page";

const domainsHookState = {
  catalog: demoDomainCatalog,
  error: null as Error | null,
  refetch: vi.fn(),
  role: "admin" as "admin" | "member",
  cloudflareDomainBindingEnabled: true,
  cloudflareDomainLifecycleEnabled: true,
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
  useDomainCatalogQuery: () => ({
    data: domainsHookState.catalog,
    error: domainsHookState.error,
    refetch: domainsHookState.refetch,
  }),
  useBindDomainMutation: () => ({
    isPending: false,
    mutateAsync: vi.fn(),
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
  domainsHookState.role = "admin";
  domainsHookState.cloudflareDomainBindingEnabled = true;
  domainsHookState.cloudflareDomainLifecycleEnabled = true;
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

    expect(
      await screen.findByText("Mailbox domain already exists"),
    ).toBeInTheDocument();
    await waitFor(() =>
      expect(onBind).toHaveBeenCalledWith({
        rootDomain: "bound.example.org",
      }),
    );
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
