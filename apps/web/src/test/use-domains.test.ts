import { describe, expect, it, vi } from "vitest";

const { invalidateQueries, useMutationMock, useQueryMock } = vi.hoisted(() => ({
  invalidateQueries: vi.fn(),
  useMutationMock: vi.fn((options) => options),
  useQueryMock: vi.fn((options) => options),
}));

vi.mock("@tanstack/react-query", () => ({
  useMutation: useMutationMock,
  useQuery: useQueryMock,
  useQueryClient: () => ({
    invalidateQueries,
  }),
}));

vi.mock("@/hooks/use-page-activity", () => ({
  usePageActivity: () => ({
    isDocumentVisible: true,
    isOnline: true,
  }),
}));

vi.mock("@/lib/api", () => ({
  apiClient: {
    bindDomain: vi.fn(),
    listDomainCatalog: vi.fn(),
  },
  ApiClientError: class ApiClientError extends Error {
    constructor(
      message: string,
      public readonly details: unknown = null,
      public readonly status: number | null = null,
      public readonly retryAfterSeconds: number | null = null,
    ) {
      super(message);
    }
  },
}));

import {
  useBindDomainMutation,
  useDomainCatalogQuery,
} from "@/hooks/use-domains";
import { ApiClientError } from "@/lib/api";

describe("useBindDomainMutation", () => {
  it("keeps the fallback catalog write from being overwritten by auto invalidation", async () => {
    const mutationOptions = useBindDomainMutation() as unknown as {
      onSuccess?: () => Promise<void> | void;
    };

    await mutationOptions.onSuccess?.();

    expect(invalidateQueries).toHaveBeenCalledWith({
      queryKey: ["domains"],
    });
    expect(invalidateQueries).toHaveBeenCalledWith({
      queryKey: ["meta"],
    });
    expect(invalidateQueries).not.toHaveBeenCalledWith({
      queryKey: ["domains", "catalog"],
    });
  });
});

describe("useDomainCatalogQuery", () => {
  it("disables React Query retries and background polling for catalog 429s", () => {
    const queryOptions = useDomainCatalogQuery() as unknown as {
      retry: (failureCount: number, error: Error) => boolean;
      refetchIntervalInBackground: boolean;
      refetchInterval: (query: {
        state: {
          data?: {
            domains: Array<{
              bindingSource: "project_bind";
              cloudflareStatus: "pending";
              projectStatus: "provisioning_error";
              lastProvisionError: string | null;
            }>;
            cloudflareSync: {
              status: "rate_limited";
              retryAfter: string;
              retryAfterSeconds: number;
            };
          };
        };
      }) => number | false;
    };

    const rateLimitError = new ApiClientError("rate limited", null, 429, 120);

    expect(queryOptions.retry(0, rateLimitError)).toBe(false);
    expect(queryOptions.retry(0, new Error("boom"))).toBe(true);
    expect(queryOptions.retry(3, new Error("boom"))).toBe(false);
    expect(queryOptions.refetchIntervalInBackground).toBe(false);
    expect(
      queryOptions.refetchInterval({
        state: {
          data: {
            domains: [
              {
                bindingSource: "project_bind",
                cloudflareStatus: "pending",
                projectStatus: "provisioning_error",
                lastProvisionError: "Zone is pending activation",
              },
            ],
            cloudflareSync: {
              status: "rate_limited",
              retryAfter: "2026-04-14T10:00:00.000Z",
              retryAfterSeconds: 120,
            },
          },
        },
      }),
    ).toBe(120_000);
  });
});
