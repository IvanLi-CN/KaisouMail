import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";

import { LoginCard } from "@/components/auth/login-card";
import { demoAuthProviders } from "@/mocks/data";

const renderLoginCard = (ui: React.ReactElement) =>
  render(<MemoryRouter>{ui}</MemoryRouter>);

describe("LoginCard", () => {
  it("renders the api key login entry as a peer action", () => {
    renderLoginCard(
      <LoginCard passkeySupported providers={demoAuthProviders} />,
    );

    expect(
      screen.getByRole("button", { name: "使用 API Key 登录" }),
    ).toBeInTheDocument();
  });

  it("triggers passkey sign-in from the dedicated action", async () => {
    const onPasskeySubmit = vi.fn();

    renderLoginCard(
      <LoginCard
        onPasskeySubmit={onPasskeySubmit}
        onProviderLogin={vi.fn()}
        passkeySupported
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "使用 Passkey 登录" }));

    await waitFor(() => {
      expect(onPasskeySubmit).toHaveBeenCalled();
    });
  });

  it("shows passkey support reason in a tooltip and blocks the action with soft-disabled state", async () => {
    const onPasskeySubmit = vi.fn();

    renderLoginCard(
      <LoginCard
        onPasskeySubmit={onPasskeySubmit}
        onProviderLogin={vi.fn()}
        passkeySupported={false}
        passkeySupportMessage="当前页面来源未加入 WEB_APP_ORIGIN / WEB_APP_ORIGINS；请切换到受信控制台域名后再使用 Passkey。"
        providers={demoAuthProviders}
      />,
    );

    const button = screen.getByRole("button", { name: "使用 Passkey 登录" });

    expect(button).toHaveAttribute("aria-disabled", "true");

    fireEvent.click(button);

    await waitFor(() => {
      expect(screen.getByRole("tooltip")).toHaveTextContent(
        "当前页面来源未加入 WEB_APP_ORIGIN / WEB_APP_ORIGINS；请切换到受信控制台域名后再使用 Passkey。",
      );
    });

    expect(onPasskeySubmit).not.toHaveBeenCalled();
  });
});
