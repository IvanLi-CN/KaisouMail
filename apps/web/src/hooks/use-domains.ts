import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { apiClient } from "@/lib/api";

const domainsKey = ["domains"] as const;
const metaKey = ["meta"] as const;

export const useDomainsQuery = () =>
  useQuery({
    queryKey: domainsKey,
    queryFn: () => apiClient.listDomains(),
  });

export const useCreateDomainMutation = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: apiClient.createDomain,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: domainsKey });
      void queryClient.invalidateQueries({ queryKey: metaKey });
    },
  });
};

export const useDisableDomainMutation = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (domainId: string) => apiClient.disableDomain(domainId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: domainsKey });
      void queryClient.invalidateQueries({ queryKey: metaKey });
    },
  });
};

export const useRetryDomainMutation = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (domainId: string) => apiClient.retryDomain(domainId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: domainsKey });
      void queryClient.invalidateQueries({ queryKey: metaKey });
    },
  });
};
