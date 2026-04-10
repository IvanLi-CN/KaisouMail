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

    fireEvent.click(screen.getByRole("button", { name: "复制验证码 842911" }));

    await waitFor(() => {
      expect(writeText).toHaveBeenCalledWith("842911");
      expect(execCommand).toHaveBeenCalledWith("copy");
    });
    expect(screen.getByText("已复制")).toBeInTheDocument();
  });
});
