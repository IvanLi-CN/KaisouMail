import { describe, expect, it, vi } from "vitest";

const { invalidateQueries, useMutationMock } = vi.hoisted(() => ({
  invalidateQueries: vi.fn(),
  useMutationMock: vi.fn((options) => options),
}));

vi.mock("@tanstack/react-query", () => ({
  useMutation: useMutationMock,
  useQuery: vi.fn(),
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
  },
}));

import { useBindDomainMutation } from "@/hooks/use-domains";

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
