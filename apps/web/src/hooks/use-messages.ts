import { useQuery } from "@tanstack/react-query";

import { apiClient } from "@/lib/api";

export const useMessagesQuery = (mailboxes: string[] = []) =>
  useQuery({
    queryKey: ["messages", ...mailboxes],
    queryFn: () => apiClient.listMessages(mailboxes),
  });

export const useMessageDetailQuery = (messageId: string) =>
  useQuery({
    queryKey: ["message", messageId],
    queryFn: () => apiClient.getMessage(messageId),
    enabled: Boolean(messageId),
  });
