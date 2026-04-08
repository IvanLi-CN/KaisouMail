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
  demoMeta,
  demoPasskeys,
  demoSessionUser,
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
  defaultTab = "api-keys",
}: {
  defaultTab?: IdentityAuthTab;
}) => {
  const [activeTab, setActiveTab] = useState<IdentityAuthTab>(defaultTab);

  return (
    <ApiKeysPageView
      apiKeys={demoApiKeys}
      passkeys={demoPasskeys}
      activeTab={activeTab}
      passkeyEmptyMessage={null}
      passkeySupported
      passkeyError={null}
      passkeyPending={false}
      latestSecret={null}
      onCreate={vi.fn()}
      onRevoke={vi.fn()}
      onActiveTabChange={setActiveTab}
      onCreatePasskey={vi.fn()}
      onRevokePasskey={vi.fn()}
    />
  );
};

const renderApiKeysRoutes = (queryClient = createQueryClient()) =>
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
            element={<ApiKeysPageViewHarness />}
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
  it("switches between API Keys and Passkey tabs on the identity page", async () => {
    renderApiKeysRoutes();

    const passkeyTab = screen.getByRole("tab", { name: /Passkey/i });

    expect(
      screen.getByRole("heading", { name: "身份认证", level: 1 }),
    ).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: /API Keys/i })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    expect(
      screen.getByRole("heading", { name: "创建 API Key", level: 2 }),
    ).toBeInTheDocument();

    fireEvent.mouseDown(passkeyTab);
    fireEvent.click(passkeyTab);

    await waitFor(() => {
      expect(passkeyTab).toHaveAttribute("aria-selected", "true");
    });
    expect(
      screen.getByRole("heading", { name: "注册 Passkey", level: 2 }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "已注册 Passkeys", level: 2 }),
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
  });

  it("restores the one-time secret after navigating away and back", async () => {
    const queryClient = createQueryClient();
    queryClient.setQueryData(
      latestApiKeySecretQueryKey,
      "cfm_full_secret_returned_once",
    );

    renderWithQueryClient(
      <MemoryRouter initialEntries={[appRoutes.apiKeys]}>
        <AppShell
          user={demoSessionUser}
          version={demoVersion}
          onLogout={vi.fn()}
        >
          <Routes>
            <Route
              path="/"
              element={<Navigate to={appRoutes.apiKeys} replace />}
            />
            <Route path={appRoutes.apiKeys} element={<ApiKeysPage />} />
            <Route path={appRoutes.apiKeysDocs} element={<ApiKeysDocsPage />} />
          </Routes>
        </AppShell>
      </MemoryRouter>,
      queryClient,
    );

    expect(
      await screen.findByText("cfm_full_secret_returned_once"),
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole("link", { name: "对接文档" }));
    await waitFor(() => {
      expect(
        screen.getByRole("heading", { name: "API 对接速查", level: 1 }),
      ).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("link", { name: "回到身份认证" }));
    await waitFor(() => {
      expect(
        screen.getByRole("heading", { name: "身份认证", level: 1 }),
      ).toBeInTheDocument();
    });
    expect(
      screen.getByText("cfm_full_secret_returned_once"),
    ).toBeInTheDocument();
  });

  it("shows a recoverable error on the Passkey tab when the list cannot load", async () => {
    passkeysHookState.data = undefined;
    passkeysHookState.error = new Error("Passkey backend offline");

    const queryClient = createQueryClient();
    renderWithQueryClient(
      <MemoryRouter initialEntries={[`${appRoutes.apiKeys}?tab=passkey`]}>
        <AppShell
          user={demoSessionUser}
          version={demoVersion}
          onLogout={vi.fn()}
        >
          <Routes>
            <Route
              path="/"
              element={<Navigate to={appRoutes.apiKeys} replace />}
            />
            <Route path={appRoutes.apiKeys} element={<ApiKeysPage />} />
            <Route path={appRoutes.apiKeysDocs} element={<ApiKeysDocsPage />} />
          </Routes>
        </AppShell>
      </MemoryRouter>,
      queryClient,
    );

    expect(
      await screen.findByRole("heading", {
        name: "Passkeys 暂时加载失败",
        level: 2,
      }),
    ).toBeInTheDocument();
    expect(
      screen.queryByText("当前还没有注册任何 passkey。"),
    ).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "重新加载 Passkeys" }));
    expect(passkeysHookState.refetch).toHaveBeenCalledTimes(1);
  });

  it("keeps the passkey tab disabled instead of showing a fetch error when backend capability is off", async () => {
    passkeysHookState.data = undefined;
    passkeysHookState.error = new Error("Passkey backend offline");
    passkeySupportState.backendConfigured = false;
    passkeySupportState.buttonLabel = "当前环境未启用 Passkey";
    passkeySupportState.managementMessage =
      "当前环境未启用 Passkey，请先配置 WEB_APP_ORIGIN / WEB_APP_ORIGINS。";
    passkeySupportState.message =
      "当前环境未启用 Passkey，请先配置 WEB_APP_ORIGIN / WEB_APP_ORIGINS。";
    passkeySupportState.supported = false;

    const queryClient = createQueryClient();
    renderWithQueryClient(
      <MemoryRouter initialEntries={[`${appRoutes.apiKeys}?tab=passkey`]}>
        <AppShell
          user={demoSessionUser}
          version={demoVersion}
          onLogout={vi.fn()}
        >
          <Routes>
            <Route
              path="/"
              element={<Navigate to={appRoutes.apiKeys} replace />}
            />
            <Route path={appRoutes.apiKeys} element={<ApiKeysPage />} />
            <Route path={appRoutes.apiKeysDocs} element={<ApiKeysDocsPage />} />
          </Routes>
        </AppShell>
      </MemoryRouter>,
      queryClient,
    );

    expect(
      screen.queryByRole("heading", {
        name: "Passkeys 暂时加载失败",
        level: 2,
      }),
    ).not.toBeInTheDocument();
    expect(
      await screen.findAllByText(
        "当前环境未启用 Passkey，请先配置 WEB_APP_ORIGIN / WEB_APP_ORIGINS。",
      ),
    ).toHaveLength(2);
  });
});
