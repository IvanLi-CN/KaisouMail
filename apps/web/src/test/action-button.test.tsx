import { render, screen } from "@testing-library/react";
import { Download } from "lucide-react";
import { describe, expect, it } from "vitest";

import { ActionButton } from "@/components/ui/action-button";

describe("ActionButton", () => {
  it("renders icon + label outside dense layouts", () => {
    render(
      <ActionButton
        density="default"
        icon={Download}
        label="下载 Raw EML"
        variant="outline"
      />,
    );

    expect(screen.getByText("下载 Raw EML")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "下载 Raw EML" }),
    ).toHaveAttribute("data-icon-only", "false");
  });

  it("collapses secondary dense actions into icon buttons while keeping an accessible label", () => {
    render(
      <ActionButton
        density="dense"
        icon={Download}
        label="下载 Raw EML"
        tooltipDelayDuration={0}
        variant="outline"
      />,
    );

    const button = screen.getByRole("button", { name: "下载 Raw EML" });

    expect(button).toHaveAttribute("data-icon-only", "true");
    expect(button).toHaveClass("h-9", "w-9", "whitespace-nowrap");
  });

  it("can restore dense labels at the desktop breakpoint without changing the accessible name", () => {
    render(
      <ActionButton
        density="dense"
        forceIconOnly
        icon={Download}
        label="打开邮箱管理"
        labelVisibility="desktop"
        variant="outline"
      />,
    );

    const button = screen.getByRole("button", { name: "打开邮箱管理" });
    const label = screen.getByText("打开邮箱管理");

    expect(button).toHaveAttribute("data-icon-only", "desktop");
    expect(button).toHaveAttribute("data-label-visibility", "desktop");
    expect(label).toHaveClass("sr-only", "lg:not-sr-only", "lg:inline");
  });
});
