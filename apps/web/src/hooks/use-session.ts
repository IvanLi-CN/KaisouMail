import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { apiClient } from "@/lib/api";
import { latestApiKeySecretQueryKey } from "@/lib/routes";

export const sessionKeys = {
  all: ["session"] as const,
  version: ["version"] as const,
};

export const useSessionQuery = () =>
  useQuery({
    queryKey: sessionKeys.all,
    queryFn: () => apiClient.getSession(),
    retry: false,
  });

export const useVersionQuery = () =>
  useQuery({
    queryKey: sessionKeys.version,
    queryFn: () => apiClient.getVersion(),
  });

export const useLoginMutation = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (apiKey: string) => apiClient.login(apiKey),
    onSuccess: (session) => {
      queryClient.setQueryData(sessionKeys.all, session);
    },
  });
};

export const useLogoutMutation = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => apiClient.logout(),
    onSuccess: () => {
      void queryClient.removeQueries({
        queryKey: latestApiKeySecretQueryKey,
        exact: true,
      });
      queryClient.setQueryData(sessionKeys.all, null);
    },
  });
};
