import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { ApiKeyTable } from "@/components/api-keys/api-key-table";
import { demoApiKeys } from "@/mocks/data";

const renderApiKeyTable = (apiKeys = demoApiKeys) =>
  render(
    <ApiKeyTable
      apiKeys={apiKeys}
      latestSecret={null}
      onCreate={vi.fn()}
      onRevoke={vi.fn()}
    />,
  );

const getRenderedKeyNames = () =>
  screen
    .getAllByRole("row")
    .slice(1)
    .map((row) => {
      const [nameCell] = within(row).getAllByRole("cell");
      return nameCell?.querySelector("p")?.textContent ?? "";
    });

describe("api key table", () => {
  it("sorts api keys by most recent use and paginates 10 rows per page", () => {
    renderApiKeyTable();

    expect(screen.getByText("第 1 / 2 页")).toBeInTheDocument();
    expect(getRenderedKeyNames()).toEqual([
      "Support Bridge",
      "Webhook Mirror",
      "ivan",
      "Docs Robot",
      "Deploy Bot",
      "Ops Console",
      "Nightly Sync",
      "Smoke Test Key",
      "Recovery API Key",
      "Audit Trail",
    ]);

    fireEvent.click(screen.getByRole("button", { name: "下一页" }));

    expect(screen.getByText("第 2 / 2 页")).toBeInTheDocument();
    expect(getRenderedKeyNames()).toEqual([
      "Subdomain Sync",
      "CI Robot",
      "Bootstrap Admin",
    ]);
    expect(screen.getByRole("button", { name: "下一页" })).toBeDisabled();
  });

  it("hides pagination when the table fits on a single page", () => {
    renderApiKeyTable(demoApiKeys.slice(0, 8));

    expect(
      screen.queryByRole("button", { name: "上一页" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "下一页" }),
    ).not.toBeInTheDocument();
  });

  it("clamps the current page when refreshed data removes the last page", () => {
    const { rerender } = renderApiKeyTable();

    fireEvent.click(screen.getByRole("button", { name: "下一页" }));
    expect(screen.getByText("第 2 / 2 页")).toBeInTheDocument();

    rerender(
      <ApiKeyTable
        apiKeys={demoApiKeys.filter(
          ({ id }) =>
            !["key_bootstrap", "key_ci", "key_sync", "key_audit"].includes(id),
        )}
        latestSecret={null}
        onCreate={vi.fn()}
        onRevoke={vi.fn()}
      />,
    );

    expect(screen.queryByText("第 2 / 2 页")).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "下一页" }),
    ).not.toBeInTheDocument();
    expect(getRenderedKeyNames()).toContain("Support Bridge");
  });

  it("returns to the first page when refreshed data changes the visible ordering", () => {
    const { rerender } = renderApiKeyTable();

    fireEvent.click(screen.getByRole("button", { name: "下一页" }));
    expect(screen.getByText("第 2 / 2 页")).toBeInTheDocument();

    rerender(
      <ApiKeyTable
        apiKeys={[
          {
            id: "key_new",
            name: "Brand New Key",
            prefix: "cfm_new___1a",
            scopes: ["messages:read"],
            createdAt: "2026-04-04T06:20:00.000Z",
            lastUsedAt: null,
            revokedAt: null,
          },
          ...demoApiKeys,
        ]}
        latestSecret={null}
        onCreate={vi.fn()}
        onRevoke={vi.fn()}
      />,
    );

    expect(screen.getByText("第 1 / 2 页")).toBeInTheDocument();
    expect(getRenderedKeyNames()).toContain("Brand New Key");
  });

  it("keeps the current page when a refetch returns the same ordering", () => {
    const { rerender } = renderApiKeyTable();

    fireEvent.click(screen.getByRole("button", { name: "下一页" }));
    expect(screen.getByText("第 2 / 2 页")).toBeInTheDocument();

    rerender(
      <ApiKeyTable
        apiKeys={demoApiKeys.map((apiKey) => ({ ...apiKey }))}
        latestSecret={null}
        onCreate={vi.fn()}
        onRevoke={vi.fn()}
      />,
    );

    expect(screen.getByText("第 2 / 2 页")).toBeInTheDocument();
    expect(getRenderedKeyNames()).toEqual([
      "Subdomain Sync",
      "CI Robot",
      "Bootstrap Admin",
    ]);
  });
});
