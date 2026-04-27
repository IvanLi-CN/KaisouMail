import type { mailboxListScopes, mailboxStatuses } from "@kaisoumail/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { messageKeys } from "@/hooks/use-messages";
import { usePageActivity } from "@/hooks/use-page-activity";
import { apiClient } from "@/lib/api";
import type { Mailbox } from "@/lib/contracts";
import { resolveAutoRefreshInterval } from "@/lib/message-refresh";

export const mailboxKeys = {
  all: ["mailboxes"] as const,
  list: (scope: MailboxListScope = "default") =>
    ["mailboxes", { scope }] as const,
  detail: (id: string) => ["mailboxes", id] as const,
};
type MailboxListScope = (typeof mailboxListScopes)[number];
type MailboxStatus = (typeof mailboxStatuses)[number];

type MailboxQueryOptions = {
  enabled?: boolean;
  pollingIntervalMs?: number;
  scope?: MailboxListScope;
  status?: MailboxStatus | MailboxStatus[];
};

export const useMailboxesQuery = (options?: MailboxQueryOptions) => {
  const { isDocumentVisible, isOnline } = usePageActivity();

  return useQuery({
    queryKey: [
      ...mailboxKeys.list(options?.scope),
      { status: options?.status ?? null },
    ] as const,
    queryFn: () =>
      apiClient.listMailboxes({
        scope: options?.scope,
        status: options?.status,
      }),
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
      queryClient.setQueryData<Mailbox[]>(
        mailboxKeys.list("default"),
        (current) =>
          current
            ? [mailbox, ...current.filter((entry) => entry.id !== mailbox.id)]
            : [mailbox],
      );
      void queryClient.invalidateQueries({ queryKey: mailboxKeys.all });
    },
  });
};

const upsertMailboxList = (mailbox: Mailbox, current?: Mailbox[]) => {
  if (!current) return [mailbox];

  const existingIndex = current.findIndex((entry) => entry.id === mailbox.id);
  if (existingIndex < 0) {
    return [mailbox, ...current];
  }

  return current.map((entry) => (entry.id === mailbox.id ? mailbox : entry));
};

export const useEnsureMailboxMutation = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: apiClient.ensureMailbox,
    onSuccess: (mailbox) => {
      queryClient.setQueryData(mailboxKeys.detail(mailbox.id), mailbox);
      queryClient.setQueryData<Mailbox[]>(
        mailboxKeys.list("default"),
        (current) => upsertMailboxList(mailbox, current),
      );
      queryClient.setQueryData<Mailbox[]>(
        mailboxKeys.list("workspace"),
        (current) => upsertMailboxList(mailbox, current),
      );
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
