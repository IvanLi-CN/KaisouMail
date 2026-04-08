import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import type { PropsWithChildren } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { passkeyListKey, usePasskeysQuery } from "@/hooks/use-passkeys";
import { sessionKeys } from "@/hooks/use-session";
import { apiClient } from "@/lib/api";
import type { SessionResponse } from "@/lib/contracts";

afterEach(() => {
  vi.restoreAllMocks();
});

const createQueryClient = () =>
  new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
    },
  });

const sessionFor = (userId: string): SessionResponse => ({
  authenticatedAt: "2026-04-08T19:00:00.000Z",
  user: {
    id: userId,
    email: `${userId}@example.com`,
    name: userId,
    role: "admin",
  },
});

describe("usePasskeysQuery", () => {
  it("scopes the query key to the authenticated user", async () => {
    vi.spyOn(apiClient, "listPasskeys").mockResolvedValue([]);
    const queryClient = createQueryClient();
    queryClient.setQueryData(sessionKeys.all, sessionFor("usr_a"));

    const { result, rerender } = renderHook(() => usePasskeysQuery(), {
      wrapper: ({ children }: PropsWithChildren) => (
        <QueryClientProvider client={queryClient}>
          {children}
        </QueryClientProvider>
      ),
    });

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });
    expect(
      queryClient.getQueryCache().find({ queryKey: passkeyListKey("usr_a") }),
    ).toBeDefined();

    queryClient.setQueryData(sessionKeys.all, sessionFor("usr_b"));
    rerender();

    await waitFor(() => {
      expect(
        queryClient.getQueryCache().find({ queryKey: passkeyListKey("usr_b") }),
      ).toBeDefined();
    });
  });

  it("stays disabled when no authenticated user is present", () => {
    const listPasskeysSpy = vi
      .spyOn(apiClient, "listPasskeys")
      .mockResolvedValue([]);
    const queryClient = createQueryClient();
    queryClient.setQueryData(sessionKeys.all, null);

    const { result } = renderHook(() => usePasskeysQuery(), {
      wrapper: ({ children }: PropsWithChildren) => (
        <QueryClientProvider client={queryClient}>
          {children}
        </QueryClientProvider>
      ),
    });

    expect(
      queryClient.getQueryCache().find({ queryKey: passkeyListKey(null) }),
    ).toBeDefined();
    expect(result.current.fetchStatus).toBe("idle");
    expect(listPasskeysSpy).not.toHaveBeenCalled();
  });
});
