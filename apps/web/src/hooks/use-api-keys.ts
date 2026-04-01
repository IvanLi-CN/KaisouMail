import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { apiClient } from "@/lib/api";

const apiKeyListKey = ["api-keys"] as const;

export const useApiKeysQuery = () =>
  useQuery({
    queryKey: apiKeyListKey,
    queryFn: () => apiClient.listApiKeys(),
  });

export const useCreateApiKeyMutation = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: apiClient.createApiKey,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: apiKeyListKey });
    },
  });
};

export const useRevokeApiKeyMutation = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (keyId: string) => apiClient.revokeApiKey(keyId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: apiKeyListKey });
    },
  });
};
