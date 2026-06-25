import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { useState } from "react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";

import { AppShell } from "@/components/layout/app-shell";
import {
  demoApiKeys,
  demoExternalAccounts,
  demoPasskeys,
  demoSessionUser,
  demoUsers,
  demoVersion,
} from "@/mocks/data";
import { ApiKeysPageView, type IdentityAuthTab } from "@/pages/api-keys-page";

const ApiKeysPageViewHarness = ({
  defaultTab = "account",
}: {
  defaultTab?: IdentityAuthTab;
}) => {
  const [activeTab, setActiveTab] = useState<IdentityAuthTab>(defaultTab);
  const [nicknameDraft, setNicknameDraft] = useState(
    demoUsers[0]?.nickname ?? "",
  );

  return (
    <ApiKeysPageView
      account={demoUsers[0] ?? null}
      externalAccounts={demoExternalAccounts.filter(
        (account) => account.id === "ext_github_owner",
      )}
      apiKeys={demoApiKeys}
      passkeys={demoPasskeys}
      activeTab={activeTab}
      nicknameDraft={nicknameDraft}
      passkeyEmptyMessage={null}
      passkeySupported
      passkeyError={null}
      passkeyPending={false}
      latestSecret={null}
      accountPending={false}
      deletingAccount={false}
      externalAccountPendingId={null}
      accountError={null}
      onNicknameDraftChange={setNicknameDraft}
      onAccountSave={vi.fn()}
      onAccountDelete={vi.fn()}
      onUnlinkExternalAccount={vi.fn()}
      onBindProvider={vi.fn()}
      onRetry={vi.fn()}
      onRetryPasskeys={vi.fn()}
      onActiveTabChange={setActiveTab}
      onCreate={vi.fn()}
      onRevoke={vi.fn()}
      onCreatePasskey={vi.fn()}
      onRevokePasskey={vi.fn()}
    />
  );
};

const renderIdentityPage = (defaultTab: IdentityAuthTab = "account") =>
  render(
    <MemoryRouter>
      <AppShell user={demoSessionUser} version={demoVersion} onLogout={vi.fn()}>
        <ApiKeysPageViewHarness defaultTab={defaultTab} />
      </AppShell>
    </MemoryRouter>,
  );

describe("identity page view", () => {
  it("renders account tab by default", () => {
    renderIdentityPage();

    expect(
      screen.getByRole("heading", { name: "身份认证", level: 1 }),
    ).toBeInTheDocument();
    expect(screen.getByDisplayValue("@ivan")).toBeInTheDocument();
    expect(screen.getByDisplayValue("Ivan Owner")).toBeInTheDocument();
  });

  it("switches to passkeys and renders passkey management", async () => {
    renderIdentityPage();

    const passkeysTab = screen.getByRole("tab", { name: /Passkeys/i });
    fireEvent.mouseDown(passkeysTab);
    fireEvent.click(passkeysTab);

    expect(
      screen.getByRole("heading", { name: "注册 Passkey", level: 2 }),
    ).toBeInTheDocument();
  });

  it("switches to api keys and paginates rows", async () => {
    renderIdentityPage("api-keys");

    expect(
      screen.getByRole("heading", { name: "创建 API Key", level: 2 }),
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "下一页" }));

    await waitFor(() => {
      expect(screen.getAllByText("Bootstrap Admin").length).toBeGreaterThan(0);
    });
  });

  it("shows connected accounts", async () => {
    renderIdentityPage("connected-accounts");

    expect(screen.getByText("@ivanli-cn")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "绑定 GitHub" }),
    ).toBeInTheDocument();
  });
});
