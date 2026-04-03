import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { MemoryRouter, Navigate, Route, Routes } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

import { AppShell } from "@/components/layout/app-shell";
import { appRoutes, latestApiKeySecretQueryKey } from "@/lib/routes";
import {
  demoApiKeys,
  demoMeta,
  demoSessionUser,
  demoVersion,
} from "@/mocks/data";
import { ApiKeysDocsPage } from "@/pages/api-keys-docs-page";
import { ApiKeysPage, ApiKeysPageView } from "@/pages/api-keys-page";

const sessionHookState = {
  user: demoSessionUser,
};

vi.mock("@/hooks/use-api-keys", () => ({
  useApiKeysQuery: () => ({ data: demoApiKeys }),
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

vi.mock("@/hooks/use-session", () => ({
  useSessionQuery: () => ({
    data: sessionHookState.user ? { user: sessionHookState.user } : null,
  }),
}));

afterEach(() => {
  sessionHookState.user = demoSessionUser;
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
            element={
              <ApiKeysPageView
                apiKeys={demoApiKeys}
                latestSecret={null}
                onCreate={vi.fn()}
                onRevoke={vi.fn()}
              />
            }
          />
          <Route path={appRoutes.apiKeysDocs} element={<ApiKeysDocsPage />} />
        </Routes>
      </AppShell>
    </MemoryRouter>,
    queryClient,
  );

describe("api key integration docs", () => {
  it("renders the api keys header CTA and navigates to the docs page", async () => {
    renderApiKeysRoutes();

    fireEvent.click(screen.getByRole("link", { name: "对接文档" }));

    await waitFor(() => {
      expect(
        screen.getByRole("heading", { name: "API 对接文档", level: 1 }),
      ).toBeInTheDocument();
    });
    expect(screen.getByRole("link", { name: "API Keys" })).toHaveClass(
      "bg-secondary",
    );
    expect(screen.getByText("Session Auth")).toBeInTheDocument();
    expect(screen.getByText("/api/api-keys/:id/revoke")).toBeInTheDocument();
    expect(screen.getByText("/api/meta")).toBeInTheDocument();
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
        screen.getByRole("heading", { name: "API 对接文档", level: 1 }),
      ).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("link", { name: "回到 API Keys" }));
    await waitFor(() => {
      expect(
        screen.getByRole("heading", { name: "API Keys", level: 1 }),
      ).toBeInTheDocument();
    });
    expect(
      screen.getByText("cfm_full_secret_returned_once"),
    ).toBeInTheDocument();
  });
});
