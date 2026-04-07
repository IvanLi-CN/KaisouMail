import { render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

import { RootLayout } from "@/app/root-layout";
import { ApiClientError } from "@/lib/api";
import { demoSessionUser, demoVersion } from "@/mocks/data";

const logoutMutate = vi.fn();
const sessionHookState = {
  data: { user: demoSessionUser } as
    | { user: typeof demoSessionUser }
    | null
    | undefined,
  error: null as Error | null,
  isLoading: false,
  refetch: vi.fn(),
};

vi.mock("@/hooks/use-session", () => ({
  useSessionQuery: () => ({
    data: sessionHookState.data,
    error: sessionHookState.error,
    isLoading: sessionHookState.isLoading,
    refetch: sessionHookState.refetch,
  }),
  useVersionQuery: () => ({
    data: demoVersion,
  }),
  useLogoutMutation: () => ({
    mutate: logoutMutate,
  }),
}));

vi.mock("@/components/layout/app-shell", () => ({
  AppShell: ({
    children,
    user,
  }: {
    children: ReactNode;
    user: { email: string };
  }) => (
    <div>
      <div data-testid="shell-user">{user.email}</div>
      {children}
    </div>
  ),
}));

afterEach(() => {
  sessionHookState.data = { user: demoSessionUser };
  sessionHookState.error = null;
  sessionHookState.isLoading = false;
  sessionHookState.refetch = vi.fn();
  logoutMutate.mockReset();
});

describe("root layout", () => {
  it("keeps the authenticated shell visible when session refetch fails over cached data", () => {
    sessionHookState.data = { user: demoSessionUser };
    sessionHookState.error = new Error("session refetch failed");

    render(
      <MemoryRouter initialEntries={["/workspace"]}>
        <Routes>
          <Route path="/" element={<RootLayout />}>
            <Route path="workspace" element={<div>workspace child</div>} />
          </Route>
        </Routes>
      </MemoryRouter>,
    );

    expect(screen.getByTestId("shell-user")).toHaveTextContent(
      demoSessionUser.email,
    );
    expect(screen.getByText("workspace child")).toBeInTheDocument();
    expect(
      screen.queryByRole("heading", { name: "会话恢复失败" }),
    ).not.toBeInTheDocument();
  });

  it("shows the recovery state when no session payload exists and restoration fails", () => {
    sessionHookState.data = undefined;
    sessionHookState.error = new Error("session restore failed");

    render(
      <MemoryRouter initialEntries={["/workspace"]}>
        <Routes>
          <Route path="/" element={<RootLayout />}>
            <Route path="workspace" element={<div>workspace child</div>} />
          </Route>
        </Routes>
      </MemoryRouter>,
    );

    expect(
      screen.getByRole("heading", { name: "会话恢复失败" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "重新恢复会话" }),
    ).toBeInTheDocument();
  });

  it("redirects unauthenticated session responses back to login", () => {
    sessionHookState.data = undefined;
    sessionHookState.error = new ApiClientError(
      "Authentication required",
      null,
      401,
    );

    render(
      <MemoryRouter initialEntries={["/workspace"]}>
        <Routes>
          <Route path="/login" element={<div>login page</div>} />
          <Route path="/" element={<RootLayout />}>
            <Route path="workspace" element={<div>workspace child</div>} />
          </Route>
        </Routes>
      </MemoryRouter>,
    );

    expect(screen.getByText("login page")).toBeInTheDocument();
    expect(
      screen.queryByRole("heading", { name: "会话恢复失败" }),
    ).not.toBeInTheDocument();
  });
});
