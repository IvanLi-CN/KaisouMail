import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { apiClient } from "@/lib/api";
import type { SessionResponse } from "@/lib/contracts";
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

export const useAccountQuery = () =>
  useQuery({
    queryKey: ["account"],
    queryFn: () => apiClient.getAccount(),
  });

export const useUpdateAccountMutation = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { nickname: string }) => apiClient.updateAccount(input),
    onSuccess: (account) => {
      queryClient.setQueryData(
        sessionKeys.all,
        (current: SessionResponse | null) =>
          current
            ? {
                ...current,
                user: account.user,
              }
            : current,
      );
      queryClient.setQueryData(["account"], account);
    },
  });
};

export const useDeleteAccountMutation = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => apiClient.deleteAccount(),
    onSuccess: () => {
      void queryClient.removeQueries({
        queryKey: latestApiKeySecretQueryKey,
        exact: true,
      });
      queryClient.setQueryData(sessionKeys.all, null);
      queryClient.setQueryData(["account"], null);
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
