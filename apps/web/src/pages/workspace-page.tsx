import { useCallback, useDeferredValue, useEffect, useMemo } from "react";
import { useSearchParams } from "react-router-dom";

import { MailWorkspace } from "@/components/workspace/mail-workspace";
import { useMailboxesQuery } from "@/hooks/use-mailboxes";
import { useMessageDetailQuery, useMessagesQuery } from "@/hooks/use-messages";
import { markMessageAsRead } from "@/lib/message-read-state";
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
  const allMessagesQuery = useMessagesQuery();
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

  const visibleMailboxes = useMemo(
    () =>
      filterMailboxes(
        sortMailboxes(mailboxes, resolvedSortMode),
        deferredQuery,
      ),
    [deferredQuery, mailboxes, resolvedSortMode],
  );

  const selectedMailbox =
    selectedMailboxId === "all"
      ? null
      : (mailboxes.find((mailbox) => mailbox.id === selectedMailboxId) ?? null);

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
  );
  const messages = messagesQuery.data ?? [];
  const allMessages = allMessagesQuery.data ?? [];
  const selectedMessageId = searchParams.get("message");
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

    const selectedExists = selectedMessageId
      ? messages.some((message) => message.id === selectedMessageId)
      : false;

    if (messages.length === 0 && selectedMessageId) {
      updateSearchParams((draft) => {
        draft.delete("message");
      }, true);
      return;
    }

    if (messages.length > 0 && !selectedExists) {
      updateSearchParams((draft) => {
        draft.set("message", messages[0].id);
      }, true);
    }
  }, [
    messages,
    messagesQuery.isLoading,
    selectedMessageId,
    updateSearchParams,
  ]);

  const messageDetailQuery = useMessageDetailQuery(selectedMessageId ?? "");

  useEffect(() => {
    markMessageAsRead(messageDetailQuery.data?.id);
  }, [messageDetailQuery.data?.id]);

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
