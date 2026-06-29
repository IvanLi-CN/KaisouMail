import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { type ReactNode, useState } from "react";
import { MemoryRouter, Navigate, Route, Routes } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

import { AppShell } from "@/components/layout/app-shell";
import { buildPublicDocsLinks } from "@/lib/public-docs";
import { appRoutes, latestApiKeySecretQueryKey } from "@/lib/routes";
import {
  demoApiKeys,
  demoExternalAccounts,
  demoMeta,
  demoPasskeys,
  demoSessionUser,
  demoUsers,
  demoVersion,
} from "@/mocks/data";
import {
  ApiKeysDocsPage,
  ApiKeysDocsPageView,
} from "@/pages/api-keys-docs-page";
import {
  ApiKeysPage,
  ApiKeysPageView,
  type IdentityAuthTab,
} from "@/pages/api-keys-page";

const sessionHookState = {
  user: demoSessionUser,
};
const apiKeysHookState = {
  data: demoApiKeys as typeof demoApiKeys | undefined,
  error: null as Error | null,
  refetch: vi.fn(),
};
const passkeysHookState = {
  data: demoPasskeys as typeof demoPasskeys | undefined,
  error: null as Error | null,
  refetch: vi.fn(),
};
const passkeySupportState = {
  backendConfigured: true,
  buttonLabel: "使用 Passkey 登录",
  managementMessage: null as string | null,
  message: " ",
  supported: true,
};

const docsLinks = buildPublicDocsLinks(
  "https://ivanli-cn.github.io/KaisouMail",
);

vi.mock("@/hooks/use-api-keys", () => ({
  useApiKeysQuery: () => ({
    data: apiKeysHookState.data,
    error: apiKeysHookState.error,
    refetch: apiKeysHookState.refetch,
  }),
  useCreateApiKeyMutation: () => ({
    mutateAsync: vi.fn(),
  }),
  useRevokeApiKeyMutation: () => ({
    mutate: vi.fn(),
  }),
}));

vi.mock("@/hooks/use-meta", () => ({
  useMetaQuery: () => ({
    data: demoMeta,
    isLoading: false,
  }),
}));

vi.mock("@/hooks/use-passkeys", () => ({
  usePasskeysQuery: () => ({
    data: passkeysHookState.data,
    error: passkeysHookState.error,
    refetch: passkeysHookState.refetch,
  }),
  useCreatePasskeyMutation: () => ({
    mutateAsync: vi.fn(),
    error: null,
    isPending: false,
  }),
  useRevokePasskeyMutation: () => ({
    mutate: vi.fn(),
  }),
  usePasskeySupport: () => passkeySupportState,
}));

vi.mock("@/hooks/use-session", () => ({
  useSessionQuery: () => ({
    data: sessionHookState.user ? { user: sessionHookState.user } : null,
  }),
  useAccountQuery: () => ({
    data: sessionHookState.user ? { user: sessionHookState.user } : null,
  }),
  useUpdateAccountMutation: () => ({
    mutateAsync: vi.fn(),
  }),
  useDeleteAccountMutation: () => ({
    mutateAsync: vi.fn(),
  }),
}));

afterEach(() => {
  sessionHookState.user = demoSessionUser;
  apiKeysHookState.data = demoApiKeys;
  apiKeysHookState.error = null;
  apiKeysHookState.refetch.mockReset();
  passkeysHookState.data = demoPasskeys;
  passkeysHookState.error = null;
  passkeysHookState.refetch.mockReset();
  passkeySupportState.backendConfigured = true;
  passkeySupportState.buttonLabel = "使用 Passkey 登录";
  passkeySupportState.managementMessage = null;
  passkeySupportState.message = " ";
  passkeySupportState.supported = true;
});

const createQueryClient = () =>
  new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
    },
  });

const renderWithQueryClient = (ui: ReactNode, queryClient: QueryClient) =>
  render(<QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>);

const ApiKeysPageViewHarness = ({
  defaultTab = "account",
  onTabChange = vi.fn(),
}: {
  defaultTab?: IdentityAuthTab;
  onTabChange?: (tab: IdentityAuthTab) => void;
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
      onNicknameDraftChange={setNicknameDraft}
      onAccountSave={vi.fn()}
      onAccountDelete={vi.fn()}
      onUnlinkExternalAccount={vi.fn()}
      onBindProvider={vi.fn()}
      passkeyEmptyMessage={null}
      passkeySupported
      passkeyError={null}
      passkeyPending={false}
      latestSecret={null}
      accountPending={false}
      deletingAccount={false}
      externalAccountPendingId={null}
      accountError={null}
      onCreate={vi.fn()}
      onRevoke={vi.fn()}
      onActiveTabChange={(tab) => {
        onTabChange(tab);
        setActiveTab(tab);
      }}
      onCreatePasskey={vi.fn()}
      onRevokePasskey={vi.fn()}
    />
  );
};

const renderApiKeysRoutes = (
  queryClient = createQueryClient(),
  onTabChange?: (tab: IdentityAuthTab) => void,
) =>
  renderWithQueryClient(
    <MemoryRouter initialEntries={[appRoutes.apiKeys]}>
      <AppShell user={demoSessionUser} version={demoVersion} onLogout={vi.fn()}>
        <Routes>
          <Route
            path="/"
            element={<Navigate to={appRoutes.apiKeys} replace />}
          />
          <Route
            path={appRoutes.apiKeys}
            element={<ApiKeysPageViewHarness onTabChange={onTabChange} />}
          />
          <Route
            path={appRoutes.apiKeysDocs}
            element={
              <ApiKeysDocsPageView meta={demoMeta} docsLinks={docsLinks} />
            }
          />
        </Routes>
      </AppShell>
    </MemoryRouter>,
    queryClient,
  );

describe("api key integration docs", () => {
  it("switches between identity tabs on the identity page", async () => {
    renderApiKeysRoutes();

    const accountTab = screen.getByRole("tab", { name: "Account" });
    const connectedAccountsTab = screen.getByRole("tab", {
      name: "Connected Accounts",
    });
    const passkeysTab = screen.getByRole("tab", { name: "Passkeys" });
    const apiKeysTab = screen.getByRole("tab", { name: "API Keys" });

    expect(
      screen.getByRole("heading", { name: "身份认证", level: 1 }),
    ).toBeInTheDocument();
    expect(accountTab).toHaveAttribute("aria-selected", "true");
    expect(accountTab).toHaveClass("data-[state=active]:bg-white/10");
    expect(connectedAccountsTab).toHaveAttribute("aria-selected", "false");
    expect(passkeysTab).toHaveAttribute("aria-selected", "false");
    expect(apiKeysTab).toHaveAttribute("aria-selected", "false");
    expect(
      screen.getByRole("heading", { name: "Account", level: 2 }),
    ).toBeInTheDocument();

    fireEvent.mouseDown(connectedAccountsTab);
    fireEvent.click(connectedAccountsTab);

    await waitFor(() => {
      expect(
        screen.getByRole("tab", { name: "Connected Accounts" }),
      ).toHaveAttribute("aria-selected", "true");
    });
    expect(screen.getByRole("tab", { name: "Connected Accounts" })).toHaveClass(
      "data-[state=active]:bg-white/10",
    );
    expect(
      screen.getByRole("heading", { name: "Connected Accounts", level: 2 }),
    ).toBeInTheDocument();

    fireEvent.mouseDown(passkeysTab);
    fireEvent.click(passkeysTab);

    await waitFor(() => {
      expect(passkeysTab).toHaveAttribute("aria-selected", "true");
    });
    expect(passkeysTab).toHaveClass("data-[state=active]:bg-white/10");
    expect(
      screen.getByRole("heading", { name: "注册 Passkey", level: 2 }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "已注册 Passkeys", level: 2 }),
    ).toBeInTheDocument();

    fireEvent.mouseDown(apiKeysTab);
    fireEvent.click(apiKeysTab);

    await waitFor(() => {
      expect(apiKeysTab).toHaveAttribute("aria-selected", "true");
    });
    expect(apiKeysTab).toHaveClass("data-[state=active]:bg-white/10");
    expect(
      screen.getByRole("heading", { name: "创建 API Key", level: 2 }),
    ).toBeInTheDocument();
  });

  it("renders the api keys header CTA and navigates to the docs page", async () => {
    renderApiKeysRoutes();

    fireEvent.click(screen.getByRole("link", { name: "对接文档" }));

    await waitFor(() => {
      expect(
        screen.getByRole("heading", { name: "API 对接速查", level: 1 }),
      ).toBeInTheDocument();
    });
    expect(screen.getByRole("link", { name: "身份认证" })).toHaveClass(
      "bg-secondary/90",
    );
    expect(screen.getByText("Session Auth")).toBeInTheDocument();
    expect(screen.getByText("/api/api-keys/:id/revoke")).toBeInTheDocument();
    expect(screen.getByText("/api/meta")).toBeInTheDocument();
    expect(
      screen.getAllByRole("link", { name: "公开文档站" })[0],
    ).toHaveAttribute("href", "https://ivanli-cn.github.io/KaisouMail/zh/");
  });

  it("documents the implemented auth and message contracts", () => {
    renderWithQueryClient(
      <MemoryRouter>
        <ApiKeysDocsPage />
      </MemoryRouter>,
      createQueryClient(),
    );

    expect(screen.getByText("Automation / Agent")).toBeInTheDocument();
    expect(screen.getByText("Browser Session")).toBeInTheDocument();
    expect(screen.getByText("/api/mailboxes/ensure")).toBeInTheDocument();
    expect(
      screen.getByText("/api/mailboxes/resolve?address=<mailbox>"),
    ).toBeInTheDocument();
    expect(screen.getByText("/api/messages/:id/raw")).toBeInTheDocument();
    expect(screen.getByText("ApiError Envelope")).toBeInTheDocument();
    expect(screen.getByText("Auth Failure")).toBeInTheDocument();
    expect(
      screen.getAllByText(/仅 .*kaisoumail_session.* cookie/)[0],
    ).toBeInTheDocument();
  });

  it("restores the one-time secret after navigating away and back", async () => {
    const queryClient = createQueryClient();
    queryClient.setQueryData(
      latestApiKeySecretQueryKey,
      "cfm_full_secret_returned_once",
    );

    renderWithQueryClient(
      <MemoryRouter initialEntries={[`${appRoutes.apiKeys}?tab=api-keys`]}>
        <AppShell
          user={demoSessionUser}
          version={demoVersion}
          onLogout={vi.fn()}
        >
          <Routes>
            <Route path={appRoutes.apiKeys} element={<ApiKeysPage />} />
            <Route
              path={appRoutes.apiKeysDocs}
              element={
                <ApiKeysDocsPageView meta={demoMeta} docsLinks={docsLinks} />
              }
            />
          </Routes>
        </AppShell>
      </MemoryRouter>,
      queryClient,
    );

    await waitFor(() => {
      expect(
        screen.getByRole("heading", { name: "创建 API Key", level: 2 }),
      ).toBeInTheDocument();
    });
    expect(
      screen.getByText("cfm_full_secret_returned_once"),
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole("link", { name: "对接文档" }));

    await waitFor(() => {
      expect(
        screen.getByRole("heading", { name: "API 对接速查", level: 1 }),
      ).toBeInTheDocument();
    });
    fireEvent.click(screen.getByRole("link", { name: "身份认证" }));

    await waitFor(() => {
      expect(
        screen.getByRole("heading", { name: "身份认证", level: 1 }),
      ).toBeInTheDocument();
    });
    fireEvent.mouseDown(screen.getByRole("tab", { name: "API Keys" }));
    fireEvent.click(screen.getByRole("tab", { name: "API Keys" }));
    await waitFor(() => {
      expect(
        screen.getByRole("heading", { name: "创建 API Key", level: 2 }),
      ).toBeInTheDocument();
    });
    expect(
      screen.getByText("cfm_full_secret_returned_once"),
    ).toBeInTheDocument();
  });
});
