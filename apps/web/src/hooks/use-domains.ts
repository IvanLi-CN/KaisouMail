import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { usePageActivity } from "@/hooks/use-page-activity";
import { ApiClientError, apiClient } from "@/lib/api";
import { resolveDomainCatalogPollingInterval } from "@/lib/domain-catalog";

const domainsKey = ["domains"] as const;
export const domainCatalogQueryKey = ["domains", "catalog"] as const;
const metaKey = ["meta"] as const;
const DOMAIN_CATALOG_POLLING_INTERVAL_MS = 15_000;

export const useDomainsQuery = () =>
  useQuery({
    queryKey: domainsKey,
    queryFn: () => apiClient.listDomains(),
  });

export const useDomainCatalogQuery = () => {
  const { isDocumentVisible, isOnline } = usePageActivity();

  return useQuery({
    queryKey: domainCatalogQueryKey,
    queryFn: () => apiClient.listDomainCatalog(),
    retry: (failureCount, error) => {
      if (
        error instanceof ApiClientError &&
        (error.status === 429 || error.retryAfterSeconds !== null)
      ) {
        return false;
      }

      return failureCount < 3;
    },
    refetchInterval: (query) =>
      resolveDomainCatalogPollingInterval({
        domains: query.state.data?.domains,
        cloudflareSync: query.state.data?.cloudflareSync,
        requestedIntervalMs: DOMAIN_CATALOG_POLLING_INTERVAL_MS,
        isDocumentVisible,
        isOnline,
      }),
    refetchIntervalInBackground: false,
    refetchOnReconnect: true,
    refetchOnWindowFocus: true,
  });
};

export const useCreateDomainMutation = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: apiClient.createDomain,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: domainsKey });
      void queryClient.invalidateQueries({ queryKey: domainCatalogQueryKey });
      void queryClient.invalidateQueries({ queryKey: metaKey });
    },
  });
};

export const useBindDomainMutation = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: apiClient.bindDomain,
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
      void queryClient.invalidateQueries({ queryKey: domainCatalogQueryKey });
      void queryClient.invalidateQueries({ queryKey: metaKey });
    },
  });
};

export const useEnableDomainCatchAllMutation = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (domainId: string) => apiClient.enableDomainCatchAll(domainId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: domainsKey });
      void queryClient.invalidateQueries({ queryKey: domainCatalogQueryKey });
      void queryClient.invalidateQueries({ queryKey: metaKey });
    },
  });
};

export const useDisableDomainCatchAllMutation = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (domainId: string) => apiClient.disableDomainCatchAll(domainId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: domainsKey });
      void queryClient.invalidateQueries({ queryKey: domainCatalogQueryKey });
      void queryClient.invalidateQueries({ queryKey: metaKey });
    },
  });
};

export const useDeleteDomainMutation = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (domainId: string) => apiClient.deleteDomain(domainId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: domainsKey });
      void queryClient.invalidateQueries({ queryKey: domainCatalogQueryKey });
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
      void queryClient.invalidateQueries({ queryKey: domainCatalogQueryKey });
      void queryClient.invalidateQueries({ queryKey: metaKey });
    },
  });
};
