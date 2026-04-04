import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook } from "@testing-library/react";
import type { PropsWithChildren } from "react";
import { describe, expect, it, vi } from "vitest";

import { useQueryRefresh } from "@/hooks/use-query-refresh";

describe("useQueryRefresh", () => {
  it("refetches each deduped target only once", async () => {
    const queryClient = new QueryClient({
      defaultOptions: {
        queries: {
          retry: false,
        },
      },
    });
    const refetchQueries = vi
      .spyOn(queryClient, "refetchQueries")
      .mockResolvedValue();

    const { result } = renderHook(
      () =>
        useQueryRefresh([
          { queryKey: ["messages"], exact: false },
          { queryKey: ["messages"], exact: false },
          { queryKey: ["message", "msg_alpha"] },
        ]),
      {
        wrapper: ({ children }: PropsWithChildren) => (
          <QueryClientProvider client={queryClient}>
            {children}
          </QueryClientProvider>
        ),
      },
    );

    await act(async () => {
      await result.current.refresh();
    });

    expect(refetchQueries).toHaveBeenCalledTimes(2);
    expect(refetchQueries).toHaveBeenNthCalledWith(1, {
      queryKey: ["messages"],
      exact: false,
      type: "active",
    });
    expect(refetchQueries).toHaveBeenNthCalledWith(2, {
      queryKey: ["message", "msg_alpha"],
      exact: true,
      type: "active",
    });
  });
});
