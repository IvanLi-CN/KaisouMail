import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { VerificationCopyButton } from "@/components/shared/verification-copy-button";

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("VerificationCopyButton", () => {
  it("falls back to execCommand when navigator.clipboard.writeText rejects", async () => {
    const writeText = vi
      .fn()
      .mockRejectedValue(new DOMException("Permission denied"));
    const execCommand = vi.fn().mockReturnValue(true);

    Object.defineProperty(window.navigator, "clipboard", {
      configurable: true,
      value: { writeText },
    });
    Object.defineProperty(document, "execCommand", {
      configurable: true,
      value: execCommand,
    });

    render(<VerificationCopyButton code="842911" variant="compact" />);

    const copyButton = screen.getByRole("button", {
      name: "复制验证码 842911",
    });

    expect(copyButton).toHaveTextContent("842911");
    expect(copyButton).not.toHaveTextContent("验证码");

    fireEvent.click(copyButton);

    await waitFor(() => {
      expect(writeText).toHaveBeenCalledWith("842911");
      expect(execCommand).toHaveBeenCalledWith("copy");
    });
    expect(copyButton).toHaveAttribute("aria-label", "已复制验证码 842911");
    expect(screen.getAllByText("已复制").length).toBeGreaterThan(0);
  });
});
