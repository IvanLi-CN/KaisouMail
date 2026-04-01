import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { LoginCard } from "@/components/auth/login-card";

describe("LoginCard", () => {
  it("submits the api key payload", async () => {
    const onSubmit = vi.fn();

    render(<LoginCard onSubmit={onSubmit} />);

    fireEvent.change(screen.getByLabelText("API Key"), {
      target: { value: "cfm_demo_secret_123456" },
    });
    fireEvent.click(screen.getByRole("button", { name: "登录控制台" }));

    await waitFor(() => {
      expect(onSubmit).toHaveBeenCalledWith({
        apiKey: "cfm_demo_secret_123456",
      });
    });
  });
});
