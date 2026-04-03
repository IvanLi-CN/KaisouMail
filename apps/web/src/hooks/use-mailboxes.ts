import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { apiClient } from "@/lib/api";

export const mailboxKeys = {
  all: ["mailboxes"] as const,
  detail: (id: string) => ["mailboxes", id] as const,
  messages: (mailboxes: string[]) => ["messages", ...mailboxes] as const,
};

export const useMailboxesQuery = () =>
  useQuery({
    queryKey: mailboxKeys.all,
    queryFn: () => apiClient.listMailboxes(),
  });

export const useMailboxDetailQuery = (mailboxId: string) =>
  useQuery({
    queryKey: mailboxKeys.detail(mailboxId),
    queryFn: () => apiClient.getMailbox(mailboxId),
    enabled: Boolean(mailboxId),
  });

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
      void queryClient.invalidateQueries({ queryKey: ["messages"] });
    },
  });
};
