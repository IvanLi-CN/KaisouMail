import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

import { RegisterCompletePage } from "@/pages/register-complete-page";

const apiMockState = vi.hoisted(() => ({
  getPendingRegistration: vi.fn(),
  completeExternalRegistration: vi.fn(),
}));

vi.mock("@/hooks/use-session", () => ({
  useSessionQuery: () => ({
    data: null,
  }),
}));

vi.mock("@/lib/api", async () => {
  const actual = await vi.importActual<typeof import("@/lib/api")>("@/lib/api");
  return {
    ...actual,
    apiClient: {
      ...actual.apiClient,
      getPendingRegistration: apiMockState.getPendingRegistration,
      completeExternalRegistration: apiMockState.completeExternalRegistration,
    },
  };
});

const pendingRegistration = {
  registration: {
    token: "pending_github",
    method: "github" as const,
    sourceIntent: "register" as const,
    redirectTo: "/workspace",
    inviteRequired: false,
    invitePrevalidated: false,
    canComplete: true,
    suggestedNickname: "Ivan Owner",
    error: null,
  },
};

const createQueryClient = () =>
  new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });

const renderRegisterCompletePage = () =>
  render(
    <QueryClientProvider client={createQueryClient()}>
      <MemoryRouter
        initialEntries={["/register/complete?token=pending_github"]}
      >
        <Routes>
          <Route path="/register/complete" element={<RegisterCompletePage />} />
          <Route path="/workspace" element={<div>workspace</div>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );

afterEach(() => {
  vi.clearAllMocks();
});

describe("RegisterCompletePage", () => {
  it("hydrates the suggested nickname after the pending registration query resolves", async () => {
    let resolvePendingRegistration: (
      value: typeof pendingRegistration,
    ) => void = () => undefined;
    apiMockState.getPendingRegistration.mockReturnValueOnce(
      new Promise((resolve) => {
        resolvePendingRegistration = resolve;
      }),
    );

    renderRegisterCompletePage();

    const nicknameInput = await screen.findByLabelText("昵称");
    expect(nicknameInput).toHaveValue("");

    resolvePendingRegistration(pendingRegistration);

    await waitFor(() => {
      expect(screen.getByLabelText("昵称")).toHaveValue("Ivan Owner");
    });
  });

  it("keeps the typed nickname when the suggestion resolves later", async () => {
    let resolvePendingRegistration: (
      value: typeof pendingRegistration,
    ) => void = () => undefined;
    apiMockState.getPendingRegistration.mockReturnValueOnce(
      new Promise((resolve) => {
        resolvePendingRegistration = resolve;
      }),
    );

    renderRegisterCompletePage();

    const nicknameInput = await screen.findByLabelText("昵称");
    fireEvent.change(nicknameInput, {
      target: { value: "Manual Nickname" },
    });

    resolvePendingRegistration(pendingRegistration);

    await waitFor(() => {
      expect(screen.getByLabelText("昵称")).toHaveValue("Manual Nickname");
    });
  });

  it("submits the edited nickname instead of the suggested default", async () => {
    apiMockState.getPendingRegistration.mockResolvedValueOnce(
      pendingRegistration,
    );
    apiMockState.completeExternalRegistration.mockResolvedValueOnce({
      user: {
        id: "usr_1",
        username: "ivan-owner",
        nickname: "Koha",
        role: "member",
      },
      authenticatedAt: "2026-07-18T12:00:00.000Z",
    });

    renderRegisterCompletePage();

    const nicknameInput = await screen.findByLabelText("昵称");
    await waitFor(() => {
      expect(nicknameInput).toHaveValue("Ivan Owner");
    });

    fireEvent.change(nicknameInput, {
      target: { value: "Koha" },
    });
    fireEvent.click(screen.getByRole("button", { name: "创建账号" }));

    await waitFor(() => {
      expect(apiMockState.completeExternalRegistration).toHaveBeenCalledWith({
        token: "pending_github",
        nickname: "Koha",
        inviteCode: "",
      });
    });
  });
});
