import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import type { PropsWithChildren } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { useLogoutMutation } from "@/hooks/use-session";
import { apiClient } from "@/lib/api";
import { latestApiKeySecretQueryKey } from "@/lib/routes";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("useLogoutMutation", () => {
  it("clears the persisted api key secret after logout succeeds", async () => {
    vi.spyOn(apiClient, "logout").mockResolvedValue(undefined);
    const queryClient = new QueryClient({
      defaultOptions: {
        queries: {
          retry: false,
        },
      },
    });
    queryClient.setQueryData(
      latestApiKeySecretQueryKey,
      "cfm_full_secret_returned_once",
    );

    const { result } = renderHook(() => useLogoutMutation(), {
      wrapper: ({ children }: PropsWithChildren) => (
        <QueryClientProvider client={queryClient}>
          {children}
        </QueryClientProvider>
      ),
    });

    result.current.mutate();

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });
    expect(
      queryClient.getQueryData(latestApiKeySecretQueryKey),
    ).toBeUndefined();
  });
});
