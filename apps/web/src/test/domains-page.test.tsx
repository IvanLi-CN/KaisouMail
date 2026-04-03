import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";

import { demoDomains } from "@/mocks/data";
import { DomainsPageView } from "@/pages/domains-page";

describe("domains page view", () => {
  it("renders domain statuses and provisioning errors", () => {
    render(
      <MemoryRouter>
        <DomainsPageView
          domains={demoDomains}
          onCreate={vi.fn()}
          onDisable={vi.fn()}
          onRetry={vi.fn()}
        />
      </MemoryRouter>,
    );

    expect(screen.getByText("707979.xyz")).toBeInTheDocument();
    expect(screen.getByText("provisioning_error")).toBeInTheDocument();
    expect(screen.getByText("Zone access denied")).toBeInTheDocument();
  });
});
