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

  it("shows feedback immediately after passkey click", async () => {
    let resolvePasskeySubmit: () => void = () => {};
    const onPasskeySubmit = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          resolvePasskeySubmit = resolve;
        }),
    );

    renderLoginCard(
      <LoginCard onPasskeySubmit={onPasskeySubmit} passkeySupported />,
    );

    fireEvent.click(screen.getByRole("button", { name: "使用 Passkey 登录" }));

    const button = await screen.findByRole("button", {
      name: "正在唤起 Passkey…",
    });
    expect(button).toHaveAttribute("aria-busy", "true");
    expect(button).toHaveAttribute("data-auth-state", "loading");

    resolvePasskeySubmit();
  });

  it("ignores rapid repeated passkey clicks", async () => {
    let resolvePasskeySubmit: () => void = () => {};
    const onPasskeySubmit = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          resolvePasskeySubmit = resolve;
        }),
    );

    renderLoginCard(
      <LoginCard onPasskeySubmit={onPasskeySubmit} passkeySupported />,
    );

    const button = screen.getByRole("button", { name: "使用 Passkey 登录" });
    fireEvent.click(button);
    fireEvent.click(button);

    await waitFor(() => {
      expect(onPasskeySubmit).toHaveBeenCalledTimes(1);
    });

    resolvePasskeySubmit();
  });

  it("shows provider login feedback and ignores repeated clicks", async () => {
    let resolveProviderLogin: () => void = () => {};
    const onProviderLogin = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          resolveProviderLogin = resolve;
        }),
    );

    renderLoginCard(
      <LoginCard
        onProviderLogin={onProviderLogin}
        passkeySupported
        providers={demoAuthProviders}
      />,
    );

    const button = screen.getByRole("button", { name: "使用 GitHub 登录" });
    fireEvent.click(button);
    fireEvent.click(button);

    const pendingButton = await screen.findByRole("button", {
      name: "正在跳转 GitHub…",
    });
    expect(pendingButton).toHaveAttribute("aria-busy", "true");
    expect(pendingButton).toHaveAttribute("data-auth-state", "loading");
    expect(onProviderLogin).toHaveBeenCalledTimes(1);

    resolveProviderLogin();
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
