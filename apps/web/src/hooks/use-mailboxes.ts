import type { mailboxListScopes, mailboxStatuses } from "@kaisoumail/shared";
import {
  type QueryClient,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";

import { messageKeys } from "@/hooks/use-messages";
import { usePageActivity } from "@/hooks/use-page-activity";
import { apiClient } from "@/lib/api";
import type { Mailbox } from "@/lib/contracts";
import { resolveAutoRefreshInterval } from "@/lib/message-refresh";

type MailboxListScope = (typeof mailboxListScopes)[number];
type MailboxStatus = (typeof mailboxStatuses)[number];

type MailboxQueryOptions = {
  enabled?: boolean;
  pollingIntervalMs?: number;
  scope?: MailboxListScope;
  status?: MailboxStatus | MailboxStatus[];
  tags?: string[];
};

export const mailboxKeys = {
  all: ["mailboxes"] as const,
  list: (scope: MailboxListScope = "default") =>
    ["mailboxes", { scope }] as const,
  listWithFilters: (
    scope: MailboxListScope = "default",
    status: MailboxQueryOptions["status"] | null = null,
    tags: string[] = [],
  ) => [...mailboxKeys.list(scope), { status, tags }] as const,
  detail: (id: string) => ["mailboxes", id] as const,
};

export const useMailboxesQuery = (options?: MailboxQueryOptions) => {
  const { isDocumentVisible, isOnline } = usePageActivity();

  return useQuery({
    queryKey: mailboxKeys.listWithFilters(
      options?.scope,
      options?.status ?? null,
      options?.tags ?? [],
    ),
    queryFn: () =>
      apiClient.listMailboxes({
        scope: options?.scope,
        status: options?.status,
        tags: options?.tags,
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

const upsertMailboxList = (mailbox: Mailbox, current?: Mailbox[]) => {
  if (!current) return [mailbox];

  const existingIndex = current.findIndex((entry) => entry.id === mailbox.id);
  if (existingIndex < 0) {
    return [mailbox, ...current];
  }

  return current.map((entry) => (entry.id === mailbox.id ? mailbox : entry));
};

const removeMailboxFromList = (mailbox: Mailbox, current?: Mailbox[]) =>
  current?.filter((entry) => entry.id !== mailbox.id) ?? current;

const updateMailboxListCache = (queryClient: QueryClient, mailbox: Mailbox) => {
  const workspaceVisible =
    mailbox.status === "active" || mailbox.status === "destroying";

  queryClient.setQueryData<Mailbox[]>(
    mailboxKeys.listWithFilters("default"),
    (current) => upsertMailboxList(mailbox, current),
  );
  queryClient.setQueryData<Mailbox[]>(
    mailboxKeys.listWithFilters("workspace"),
    (current) =>
      workspaceVisible
        ? upsertMailboxList(mailbox, current)
        : removeMailboxFromList(mailbox, current),
  );
  queryClient.setQueryData<Mailbox[]>(
    mailboxKeys.listWithFilters("default", "expired"),
    (current) =>
      mailbox.status === "expired"
        ? upsertMailboxList(mailbox, current)
        : removeMailboxFromList(mailbox, current),
  );
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
      updateMailboxListCache(queryClient, mailbox);
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
      updateMailboxListCache(queryClient, mailbox);
      void queryClient.invalidateQueries({ queryKey: mailboxKeys.all });
    },
  });
};

export const useResetMailboxTtlMutation = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      mailboxId,
      expiresInMinutes,
    }: {
      mailboxId: string;
      expiresInMinutes: number | null;
    }) => apiClient.resetMailboxTtl(mailboxId, { expiresInMinutes }),
    onSuccess: (mailbox) => {
      queryClient.setQueryData(mailboxKeys.detail(mailbox.id), mailbox);
      updateMailboxListCache(queryClient, mailbox);
      void queryClient.invalidateQueries({ queryKey: mailboxKeys.all });
      void queryClient.invalidateQueries({ queryKey: messageKeys.all });
    },
  });
};

export const useUpdateMailboxTagsMutation = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ mailboxId, tags }: { mailboxId: string; tags: string[] }) =>
      apiClient.updateMailboxTags(mailboxId, { tags }),
    onSuccess: (mailbox) => {
      queryClient.setQueryData(mailboxKeys.detail(mailbox.id), mailbox);
      updateMailboxListCache(queryClient, mailbox);
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
