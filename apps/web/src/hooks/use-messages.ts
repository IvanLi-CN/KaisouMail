import { useQuery } from "@tanstack/react-query";

import { apiClient } from "@/lib/api";

export const useMessagesQuery = (
  mailboxes: string[] = [],
  filters?: { after?: string; since?: string },
) =>
  useQuery({
    queryKey: [
      "messages",
      {
        mailboxes,
        after: filters?.after ?? null,
        since: filters?.since ?? null,
      },
    ],
    queryFn: () => apiClient.listMessages(mailboxes, filters),
  });

export const useMessageDetailQuery = (messageId: string) =>
  useQuery({
    queryKey: ["message", messageId],
    queryFn: () => apiClient.getMessage(messageId),
    enabled: Boolean(messageId),
  });
