import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import { RegisterPage } from "@/pages/register-page";

const apiMockState = vi.hoisted(() => ({
  startProviderRegistration: vi.fn(() => new Promise<never>(() => undefined)),
}));

vi.mock("@/hooks/use-session", () => ({
  useSessionQuery: () => ({
    data: null,
  }),
}));

vi.mock("@/hooks/use-passkeys", () => ({
  usePasskeySupport: () => ({
    supported: true,
    message: null,
  }),
}));

vi.mock("@/lib/api", async () => {
  const actual = await vi.importActual<typeof import("@/lib/api")>("@/lib/api");
  return {
    ...actual,
    apiClient: {
      ...actual.apiClient,
      listAuthProviders: vi.fn(async () => [
        {
          provider: "github",
          configured: true,
          loginEnabled: true,
          registrationMode: "open",
          dailyLimit: 5,
          dailyUsed: 0,
          dailyRemaining: 5,
        },
      ]),
      startProviderRegistration: apiMockState.startProviderRegistration,
    },
  };
});

const renderRegisterPage = () => {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={["/register"]}>
        <Routes>
          <Route path="/register" element={<RegisterPage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
};

describe("RegisterPage", () => {
  it("starts provider registration with the workspace redirect target", async () => {
    renderRegisterPage();

    fireEvent.click(
      await screen.findByRole("button", { name: "使用 GitHub 继续" }),
    );

    await waitFor(() => {
      expect(apiMockState.startProviderRegistration).toHaveBeenCalledWith(
        "github",
        {
          inviteCode: "",
          returnTo: "/workspace",
        },
      );
    });
  });
});
