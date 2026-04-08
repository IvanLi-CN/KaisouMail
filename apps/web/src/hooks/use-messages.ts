import type { mailboxListScopes } from "@kaisoumail/shared";
import { useQuery } from "@tanstack/react-query";

import { usePageActivity } from "@/hooks/use-page-activity";
import { apiClient } from "@/lib/api";
import { resolveAutoRefreshInterval } from "@/lib/message-refresh";

type MessageQueryFilters = { after?: string; since?: string };
type MailboxListScope = (typeof mailboxListScopes)[number];
type MessageQueryOptions = {
  enabled?: boolean;
  pollingIntervalMs?: number;
  scope?: MailboxListScope;
};

export const messageKeys = {
  all: ["messages"] as const,
  list: (
    mailboxes: string[] = [],
    filters?: MessageQueryFilters,
    scope: MailboxListScope = "default",
  ) =>
    [
      "messages",
      {
        mailboxes,
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
    queryKey: messageKeys.list(mailboxes, filters, options?.scope),
    queryFn: () =>
      apiClient.listMessages(mailboxes, filters, { scope: options?.scope }),
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
