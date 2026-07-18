import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AUTH_NAVIGATION_DWELL_MS } from "@/lib/auth-feedback";
import { LoginPage } from "@/pages/login-page";

const loginPageMockState = vi.hoisted(() => ({
  getProviderStartUrl: vi.fn(
    () => "https://github.example.test/login/start?intent=login",
  ),
  mutateAsync: vi.fn(),
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
    buttonLabel: "使用 Passkey 登录",
  }),
  usePasskeyLoginMutation: () => ({
    isPending: false,
    mutateAsync: loginPageMockState.mutateAsync,
  }),
}));

vi.mock("@/lib/api", async () => {
  const actual = await vi.importActual<typeof import("@/lib/api")>("@/lib/api");
  return {
    ...actual,
    apiClient: {
      ...actual.apiClient,
      getProviderStartUrl: loginPageMockState.getProviderStartUrl,
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
        {
          provider: "linuxdo",
          configured: true,
          loginEnabled: true,
          registrationMode: "open",
          dailyLimit: 5,
          dailyUsed: 0,
          dailyRemaining: 5,
        },
      ]),
    },
  };
});

const renderLoginPage = () => {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={["/login"]}>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/login/api-key" element={<p>API Key Route</p>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
};

describe("LoginPage", () => {
  afterEach(() => {
    vi.clearAllTimers();
    vi.clearAllMocks();
    vi.useRealTimers();
  });

  it("keeps provider feedback visible before the external login handoff starts", async () => {
    renderLoginPage();

    const githubButton = await screen.findByRole("button", {
      name: "使用 GitHub 登录",
    });
    vi.useFakeTimers();
    fireEvent.click(githubButton);

    await act(async () => {
      await Promise.resolve();
    });

    const pendingButton = screen.getByRole("button", {
      name: "正在跳转 GitHub…",
    });
    expect(pendingButton).toHaveAttribute("aria-busy", "true");
    expect(loginPageMockState.getProviderStartUrl).not.toHaveBeenCalled();

    await act(async () => {
      vi.advanceTimersByTime(AUTH_NAVIGATION_DWELL_MS - 1);
    });

    expect(pendingButton).toBeInTheDocument();
    expect(screen.queryByText("API Key Route")).not.toBeInTheDocument();
  });

  it("shows api key pending feedback before routing to the api key page", async () => {
    renderLoginPage();

    const apiKeyButton = await screen.findByRole("button", {
      name: "使用 API Key 登录",
    });
    vi.useFakeTimers();
    fireEvent.click(apiKeyButton);

    await act(async () => {
      await Promise.resolve();
    });

    const pendingButton = screen.getByRole("button", {
      name: "正在前往 API Key 登录…",
    });
    expect(pendingButton).toHaveAttribute("aria-busy", "true");

    await act(async () => {
      vi.advanceTimersByTime(AUTH_NAVIGATION_DWELL_MS - 1);
    });

    expect(pendingButton).toBeInTheDocument();
    expect(screen.queryByText("API Key Route")).not.toBeInTheDocument();

    await act(async () => {
      vi.advanceTimersByTime(1);
      await Promise.resolve();
    });

    expect(screen.getByText("API Key Route")).toBeInTheDocument();
  });
});
