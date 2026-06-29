import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";

import { RegisterCard } from "@/components/auth/register-card";
import { demoAuthProviders } from "@/mocks/data";

const renderRegisterCard = (ui: React.ReactElement) =>
  render(<MemoryRouter>{ui}</MemoryRouter>);

describe("RegisterCard", () => {
  it("submits provider registration with the shared invite field", async () => {
    const onProviderRegister = vi.fn();

    renderRegisterCard(
      <RegisterCard
        onProviderRegister={onProviderRegister}
        onPasskeyStart={vi.fn()}
        passkeySupported
        providers={demoAuthProviders}
      />,
    );

    fireEvent.change(screen.getByLabelText("邀请码（如需）"), {
      target: { value: "km_demo_invite_1" },
    });
    fireEvent.click(screen.getByRole("button", { name: "使用 GitHub 继续" }));

    await waitFor(() => {
      expect(onProviderRegister).toHaveBeenCalledWith("github", {
        inviteCode: "km_demo_invite_1",
      });
    });
  });

  it("starts passkey registration from the shared action list", async () => {
    const onPasskeyStart = vi.fn();

    renderRegisterCard(
      <RegisterCard
        onProviderRegister={vi.fn()}
        onPasskeyStart={onPasskeyStart}
        passkeySupported
        providers={demoAuthProviders}
      />,
    );

    fireEvent.change(screen.getByLabelText("邀请码（如需）"), {
      target: { value: "km_passkey_invite" },
    });
    fireEvent.click(screen.getByRole("button", { name: "使用 Passkey 继续" }));

    await waitFor(() => {
      expect(onPasskeyStart).toHaveBeenCalledWith({
        inviteCode: "km_passkey_invite",
      });
    });
  });

  it("uses soft-disabled passkey state so tooltip still works while clicks are blocked", async () => {
    const onPasskeyStart = vi.fn();

    renderRegisterCard(
      <RegisterCard
        onProviderRegister={vi.fn()}
        onPasskeyStart={onPasskeyStart}
        passkeySupported={false}
        passkeySupportMessage="当前页面来源未加入 WEB_APP_ORIGIN / WEB_APP_ORIGINS；请切换到受信控制台域名后再使用 Passkey。"
        providers={demoAuthProviders}
      />,
    );

    const button = screen.getByRole("button", { name: "使用 Passkey 继续" });

    expect(button).toHaveAttribute("aria-disabled", "true");

    fireEvent.click(button);

    await waitFor(() => {
      expect(screen.getByRole("tooltip")).toHaveTextContent(
        "当前页面来源未加入 WEB_APP_ORIGIN / WEB_APP_ORIGINS；请切换到受信控制台域名后再使用 Passkey。",
      );
    });

    expect(onPasskeyStart).not.toHaveBeenCalled();
  });
});
