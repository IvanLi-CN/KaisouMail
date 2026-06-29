import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { IdentityAuthTabsList } from "@/components/identity/identity-auth-tabs";
import { Tabs } from "@/components/ui/tabs";

describe("IdentityAuthTabsList", () => {
  it("keeps a visible selected-state treatment on the active tab", () => {
    render(
      <Tabs value="api-keys">
        <IdentityAuthTabsList />
      </Tabs>,
    );

    const activeTab = screen.getByRole("tab", { name: "API Keys" });
    const inactiveTab = screen.getByRole("tab", { name: "Passkey" });

    expect(activeTab).toHaveAttribute("aria-selected", "true");
    expect(activeTab).toHaveAttribute("data-state", "active");
    expect(activeTab).toHaveClass("data-[state=active]:bg-white/10");
    expect(activeTab).toHaveClass(
      "data-[state=active]:shadow-[inset_0_0_0_1px_rgba(255,255,255,0.14),0_1px_1px_rgba(0,0,0,0.18)]",
    );
    expect(inactiveTab).toHaveAttribute("aria-selected", "false");
    expect(inactiveTab).toHaveAttribute("data-state", "inactive");
  });
});
