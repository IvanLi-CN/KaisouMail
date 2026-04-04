import { useCallback, useDeferredValue, useEffect, useMemo } from "react";
import { useSearchParams } from "react-router-dom";

import { MessageRefreshControl } from "@/components/messages/message-refresh-control";
import { MailWorkspace } from "@/components/workspace/mail-workspace";
import { mailboxKeys, useMailboxesQuery } from "@/hooks/use-mailboxes";
import {
  messageKeys,
  useMessageDetailQuery,
  useMessagesQuery,
} from "@/hooks/use-messages";
import { useQueryRefresh } from "@/hooks/use-query-refresh";
import { markMessageAsRead } from "@/lib/message-read-state";
import {
  resolveLatestRefreshAt,
  resolveNextSelectedMessageId,
} from "@/lib/message-refresh";
import {
  buildWorkspaceSearch,
  filterMailboxes,
  isMailboxSortMode,
  MAILBOX_SORT_STORAGE_KEY,
  type MailboxSortMode,
  sortMailboxes,
} from "@/lib/workspace";

const DEFAULT_SORT_MODE: MailboxSortMode = "recent";

const readStoredSortMode = () => {
  if (typeof window === "undefined") return DEFAULT_SORT_MODE;
  const value = window.localStorage.getItem(MAILBOX_SORT_STORAGE_KEY);
  return isMailboxSortMode(value) ? value : DEFAULT_SORT_MODE;
};

export const WorkspacePage = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const mailboxesQuery = useMailboxesQuery();
  const mailboxes = mailboxesQuery.data ?? [];

  const selectedMailboxId = searchParams.get("mailbox") ?? "all";
  const searchQuery = searchParams.get("q") ?? "";
  const deferredQuery = useDeferredValue(searchQuery);
  const sortParam = searchParams.get("sort");
  const resolvedSortMode = isMailboxSortMode(sortParam)
    ? sortParam
    : readStoredSortMode();

  const updateSearchParams = useCallback(
    (updater: (draft: URLSearchParams) => void, replace = false) => {
      const draft = new URLSearchParams(searchParams);
      updater(draft);
      setSearchParams(draft, { replace });
    },
    [searchParams, setSearchParams],
  );

  useEffect(() => {
    let changed = false;
    const draft = new URLSearchParams(searchParams);

    if (!draft.get("mailbox")) {
      draft.set("mailbox", "all");
      changed = true;
    }

    if (!isMailboxSortMode(draft.get("sort"))) {
      draft.set("sort", readStoredSortMode());
      changed = true;
    }

    if (changed) {
      setSearchParams(draft, { replace: true });
    }
  }, [searchParams, setSearchParams]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(MAILBOX_SORT_STORAGE_KEY, resolvedSortMode);
  }, [resolvedSortMode]);

  const selectedMailbox =
    selectedMailboxId === "all"
      ? null
      : (mailboxes.find((mailbox) => mailbox.id === selectedMailboxId) ?? null);

  const allMessagesQuery = useMessagesQuery([], undefined, {
    pollingIntervalMs: selectedMailbox ? 60_000 : 15_000,
  });

  useEffect(() => {
    if (selectedMailboxId === "all") return;
    if (selectedMailbox) return;

    updateSearchParams((draft) => {
      draft.set("mailbox", "all");
      draft.delete("message");
    }, true);
  }, [selectedMailbox, selectedMailboxId, updateSearchParams]);

  const messagesQuery = useMessagesQuery(
    selectedMailbox ? [selectedMailbox.address] : [],
    undefined,
    {
      pollingIntervalMs: 15_000,
    },
  );
  const messages = messagesQuery.data ?? [];
  const allMessages = allMessagesQuery.data ?? [];
  const selectedMessageId = searchParams.get("message");
  const mailboxesWithLiveRecency = useMemo(() => {
    const latestByMailboxId = new Map<string, string>();

    for (const message of allMessages) {
      const current = latestByMailboxId.get(message.mailboxId);
      if (!current || message.receivedAt.localeCompare(current) > 0) {
        latestByMailboxId.set(message.mailboxId, message.receivedAt);
      }
    }

    return mailboxes.map((mailbox) => ({
      ...mailbox,
      lastReceivedAt:
        latestByMailboxId.get(mailbox.id) ?? mailbox.lastReceivedAt,
    }));
  }, [allMessages, mailboxes]);
  const visibleMailboxes = useMemo(
    () =>
      filterMailboxes(
        sortMailboxes(mailboxesWithLiveRecency, resolvedSortMode),
        deferredQuery,
      ),
    [deferredQuery, mailboxesWithLiveRecency, resolvedSortMode],
  );
  const mailboxMessageCounts = useMemo(() => {
    const counts = new Map<string, number>();

    for (const mailbox of mailboxes) {
      counts.set(mailbox.id, 0);
    }

    for (const message of allMessages) {
      const current = counts.get(message.mailboxId) ?? 0;
      counts.set(message.mailboxId, current + 1);
    }

    return counts;
  }, [allMessages, mailboxes]);

  useEffect(() => {
    if (messagesQuery.isLoading) return;
    const nextSelectedMessageId = resolveNextSelectedMessageId(
      messages,
      selectedMessageId,
    );

    if (!nextSelectedMessageId && selectedMessageId) {
      updateSearchParams((draft) => {
        draft.delete("message");
      }, true);
      return;
    }

    if (nextSelectedMessageId && nextSelectedMessageId !== selectedMessageId) {
      updateSearchParams((draft) => {
        draft.set("message", nextSelectedMessageId);
      }, true);
    }
  }, [
    messages,
    messagesQuery.isLoading,
    selectedMessageId,
    updateSearchParams,
  ]);

  const messageDetailQuery = useMessageDetailQuery(selectedMessageId ?? "");
  const refreshTargets = useMemo(
    () => [
      { queryKey: mailboxKeys.all },
      { queryKey: messageKeys.list([]) },
      {
        queryKey: messageKeys.list(
          selectedMailbox ? [selectedMailbox.address] : [],
        ),
      },
      ...(selectedMessageId
        ? [{ queryKey: messageKeys.detail(selectedMessageId) }]
        : []),
    ],
    [selectedMailbox, selectedMessageId],
  );
  const manualRefresh = useQueryRefresh(refreshTargets);
  const workspaceLastRefreshedAt = resolveLatestRefreshAt(
    mailboxesQuery.dataUpdatedAt,
    allMessagesQuery.dataUpdatedAt,
    messagesQuery.dataUpdatedAt,
    messageDetailQuery.dataUpdatedAt,
  );
  const isWorkspaceRefreshing =
    manualRefresh.isRefreshing ||
    mailboxesQuery.isFetching ||
    allMessagesQuery.isFetching ||
    messagesQuery.isFetching ||
    messageDetailQuery.isFetching;

  useEffect(() => {
    markMessageAsRead(messageDetailQuery.data?.id);
  }, [messageDetailQuery.data?.id]);

  const handleRefresh = useCallback(async () => {
    await manualRefresh.refresh();
  }, [manualRefresh]);

  return (
    <MailWorkspace
      visibleMailboxes={visibleMailboxes}
      totalMailboxCount={mailboxes.length}
      totalMessageCount={messages.length}
      totalAggregatedMessageCount={allMessages.length}
      mailboxMessageCounts={mailboxMessageCounts}
      selectedMailboxId={selectedMailboxId}
      selectedMailbox={selectedMailbox}
      messages={messages}
      selectedMessageId={selectedMessageId}
      selectedMessage={messageDetailQuery.data ?? null}
      searchQuery={searchQuery}
      sortMode={resolvedSortMode}
      refreshAction={
        <MessageRefreshControl
          density="dense"
          isRefreshing={isWorkspaceRefreshing}
          lastRefreshedAt={workspaceLastRefreshedAt}
          onRefresh={handleRefresh}
        />
      }
      isMailboxesLoading={mailboxesQuery.isLoading}
      isMessagesLoading={messagesQuery.isLoading}
      isMessageLoading={messageDetailQuery.isLoading}
      mailboxManagementHref="/mailboxes"
      messageDetailHref={
        selectedMessageId
          ? `/messages/${selectedMessageId}${buildWorkspaceSearch({
              mailbox: selectedMailboxId,
              message: selectedMessageId,
              sort: resolvedSortMode,
              q: searchQuery,
            })}`
          : null
      }
      onSearchQueryChange={(value) =>
        updateSearchParams((draft) => {
          if (value.trim()) {
            draft.set("q", value);
          } else {
            draft.delete("q");
          }
        })
      }
      onSortModeChange={(mode) =>
        updateSearchParams((draft) => {
          draft.set("sort", mode);
        })
      }
      onSelectMailbox={(mailboxId) =>
        updateSearchParams((draft) => {
          draft.set("mailbox", mailboxId);
          draft.delete("message");
        })
      }
      onSelectMessage={(messageId) =>
        updateSearchParams((draft) => {
          draft.set("message", messageId);
        })
      }
    />
  );
};
