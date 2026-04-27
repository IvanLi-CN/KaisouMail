import type { mailboxListScopes, mailboxStatuses } from "@kaisoumail/shared";
import { useQuery } from "@tanstack/react-query";

import { usePageActivity } from "@/hooks/use-page-activity";
import { apiClient } from "@/lib/api";
import { resolveAutoRefreshInterval } from "@/lib/message-refresh";

type MessageQueryFilters = { after?: string; since?: string };
type MailboxListScope = (typeof mailboxListScopes)[number];
type MailboxStatus = (typeof mailboxStatuses)[number];
type MessageQueryOptions = {
  enabled?: boolean;
  mailboxIds?: string[];
  mailboxStatuses?: MailboxStatus[];
  pollingIntervalMs?: number;
  scope?: MailboxListScope;
};

export const messageKeys = {
  all: ["messages"] as const,
  list: (
    mailboxes: string[] = [],
    filters?: MessageQueryFilters,
    scope: MailboxListScope = "default",
    mailboxIds: string[] = [],
    mailboxStatuses: MailboxStatus[] = [],
  ) =>
    [
      "messages",
      {
        mailboxes,
        mailboxIds,
        mailboxStatuses,
        after: filters?.after ?? null,
        since: filters?.since ?? null,
        scope,
      },
    ] as const,
  detail: (messageId: string) => ["message", messageId] as const,
};

export const useMessagesQuery = (
  mailboxes: string[] = [],
  filters?: MessageQueryFilters,
  options?: MessageQueryOptions,
) => {
  const { isDocumentVisible, isOnline } = usePageActivity();

  return useQuery({
    queryKey: messageKeys.list(
      mailboxes,
      filters,
      options?.scope,
      options?.mailboxIds,
      options?.mailboxStatuses,
    ),
    queryFn: () =>
      apiClient.listMessages(mailboxes, filters, {
        scope: options?.scope,
        mailboxIds: options?.mailboxIds,
        mailboxStatuses: options?.mailboxStatuses,
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

export const useMessageDetailQuery = (
  messageId: string,
  options?: Pick<MessageQueryOptions, "enabled">,
) =>
  useQuery({
    queryKey: messageKeys.detail(messageId),
    queryFn: () => apiClient.getMessage(messageId),
    enabled: (options?.enabled ?? true) && Boolean(messageId),
    refetchOnReconnect: true,
    refetchOnWindowFocus: true,
  });
