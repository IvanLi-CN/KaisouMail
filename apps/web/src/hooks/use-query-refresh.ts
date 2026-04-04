import type { QueryKey } from "@tanstack/react-query";
import { useQueryClient } from "@tanstack/react-query";
import { useCallback, useMemo, useState } from "react";

type QueryRefreshTarget = {
  queryKey: QueryKey;
  exact?: boolean;
};

const dedupeTargets = (targets: QueryRefreshTarget[]) => {
  const seen = new Set<string>();

  return targets.filter((target) => {
    const key = JSON.stringify([target.queryKey, target.exact ?? true]);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
};

export const useQueryRefresh = (targets: QueryRefreshTarget[]) => {
  const queryClient = useQueryClient();
  const [isRefreshing, setIsRefreshing] = useState(false);
  const resolvedTargets = useMemo(() => dedupeTargets(targets), [targets]);

  const refresh = useCallback(async () => {
    setIsRefreshing(true);

    try {
      await Promise.all(
        resolvedTargets.map(({ queryKey, exact = true }) =>
          queryClient.refetchQueries({
            queryKey,
            exact,
            type: "active",
          }),
        ),
      );
    } finally {
      setIsRefreshing(false);
    }
  }, [queryClient, resolvedTargets]);

  return {
    refresh,
    isRefreshing,
  };
};
