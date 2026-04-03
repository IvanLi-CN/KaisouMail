import { useQuery } from "@tanstack/react-query";

import { apiClient } from "@/lib/api";

export const useMetaQuery = () =>
  useQuery({
    queryKey: ["meta"],
    queryFn: () => apiClient.getMeta(),
  });
