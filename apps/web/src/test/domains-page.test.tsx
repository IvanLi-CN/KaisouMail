import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";

import { demoDomainCatalog } from "@/mocks/data";
import { DomainsPageView } from "@/pages/domains-page";

describe("domains page view", () => {
  it("renders catalog statuses and provisioning errors", () => {
    render(
      <MemoryRouter>
        <DomainsPageView
          domains={demoDomainCatalog}
          onEnable={vi.fn()}
          onDisable={vi.fn()}
          onRetry={vi.fn()}
        />
      </MemoryRouter>,
    );

    expect(screen.getByText("707979.xyz")).toBeInTheDocument();
    expect(screen.getByText("provisioning_error")).toBeInTheDocument();
    expect(screen.getByText("Zone access denied")).toBeInTheDocument();
    expect(screen.getByText("not_enabled")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "启用域名" }),
    ).toBeInTheDocument();
  });
});
