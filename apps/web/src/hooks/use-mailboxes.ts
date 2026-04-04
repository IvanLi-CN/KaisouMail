import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { messageKeys } from "@/hooks/use-messages";
import { usePageActivity } from "@/hooks/use-page-activity";
import { apiClient } from "@/lib/api";
import { resolveAutoRefreshInterval } from "@/lib/message-refresh";

export const mailboxKeys = {
  all: ["mailboxes"] as const,
  detail: (id: string) => ["mailboxes", id] as const,
};

type MailboxQueryOptions = {
  enabled?: boolean;
  pollingIntervalMs?: number;
};

export const useMailboxesQuery = (options?: MailboxQueryOptions) => {
  const { isDocumentVisible, isOnline } = usePageActivity();

  return useQuery({
    queryKey: mailboxKeys.all,
    queryFn: () => apiClient.listMailboxes(),
    enabled: options?.enabled ?? true,
    refetchInterval: resolveAutoRefreshInterval({
      requestedIntervalMs: options?.pollingIntervalMs,
      isDocumentVisible,
      isOnline,
    }),
    refetchIntervalInBackground: false,
    refetchOnReconnect: true,
    refetchOnWindowFocus: true,
  });
};

export const useMailboxDetailQuery = (
  mailboxId: string,
  options?: MailboxQueryOptions,
) => {
  const { isDocumentVisible, isOnline } = usePageActivity();

  return useQuery({
    queryKey: mailboxKeys.detail(mailboxId),
    queryFn: () => apiClient.getMailbox(mailboxId),
    enabled: (options?.enabled ?? true) && Boolean(mailboxId),
    refetchInterval: resolveAutoRefreshInterval({
      requestedIntervalMs: options?.pollingIntervalMs,
      isDocumentVisible,
      isOnline,
    }),
    refetchIntervalInBackground: false,
    refetchOnReconnect: true,
    refetchOnWindowFocus: true,
  });
};

export const useCreateMailboxMutation = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: apiClient.createMailbox,
    onSuccess: (mailbox) => {
      queryClient.setQueryData(mailboxKeys.detail(mailbox.id), mailbox);
      void queryClient.invalidateQueries({ queryKey: mailboxKeys.all });
    },
  });
};

export const useEnsureMailboxMutation = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: apiClient.ensureMailbox,
    onSuccess: (mailbox) => {
      queryClient.setQueryData(mailboxKeys.detail(mailbox.id), mailbox);
      void queryClient.invalidateQueries({ queryKey: mailboxKeys.all });
    },
  });
};

export const useDestroyMailboxMutation = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (mailboxId: string) => apiClient.destroyMailbox(mailboxId),
    onSuccess: (mailbox) => {
      queryClient.setQueryData(mailboxKeys.detail(mailbox.id), mailbox);
      void queryClient.invalidateQueries({ queryKey: mailboxKeys.all });
      void queryClient.invalidateQueries({ queryKey: messageKeys.all });
    },
  });
};
