import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { LoginCard } from "@/components/auth/login-card";

describe("LoginCard", () => {
  it("submits the api key payload", async () => {
    const onSubmit = vi.fn();

    render(<LoginCard onSubmit={onSubmit} passkeySupported />);

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

  it("triggers passkey sign-in from the dedicated action", async () => {
    const onPasskeySubmit = vi.fn();

    render(
      <LoginCard
        onSubmit={vi.fn()}
        onPasskeySubmit={onPasskeySubmit}
        passkeySupported
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "使用 Passkey 登录" }));

    await waitFor(() => {
      expect(onPasskeySubmit).toHaveBeenCalled();
    });
  });
});
