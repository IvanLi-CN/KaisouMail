import { maxMailboxTtlMinutes } from "@kaisoumail/shared";
import {
  useCallback,
  useDeferredValue,
  useEffect,
  useEffectEvent,
  useMemo,
  useState,
} from "react";
import { useSearchParams } from "react-router-dom";

import { MessageRefreshControl } from "@/components/messages/message-refresh-control";
import { MailWorkspace } from "@/components/workspace/mail-workspace";
import {
  mailboxKeys,
  useCreateMailboxMutation,
  useMailboxesQuery,
} from "@/hooks/use-mailboxes";
import {
  messageKeys,
  useMessageDetailQuery,
  useMessagesQuery,
} from "@/hooks/use-messages";
import { useMetaQuery } from "@/hooks/use-meta";
import { useQueryRefresh } from "@/hooks/use-query-refresh";
import { ApiClientError } from "@/lib/api";
import { getErrorDetails, isNotFoundError } from "@/lib/error-utils";
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
const DEFAULT_WORKSPACE_TTL_MINUTES = 60;

const readStoredSortMode = () => {
  if (typeof window === "undefined") return DEFAULT_SORT_MODE;
  const value = window.localStorage.getItem(MAILBOX_SORT_STORAGE_KEY);
  return isMailboxSortMode(value) ? value : DEFAULT_SORT_MODE;
};

export const WorkspacePage = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const [isCreateMailboxOpen, setIsCreateMailboxOpen] = useState(false);
  const [createMailboxError, setCreateMailboxError] = useState<string | null>(
    null,
  );
  const [highlightedMailboxId, setHighlightedMailboxId] = useState<
    string | null
  >(null);
  const metaQuery = useMetaQuery();
  const mailboxesQuery = useMailboxesQuery();
  const createMailboxMutation = useCreateMailboxMutation();
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
  const hasMetaData = metaQuery.data !== undefined;
  const hasMailboxesData = mailboxesQuery.data !== undefined;
  const hasMessagesData = messagesQuery.data !== undefined;
  const hasMessageDetailData = messageDetailQuery.data !== undefined;

  useEffect(() => {
    markMessageAsRead(messageDetailQuery.data?.id);
  }, [messageDetailQuery.data?.id]);

  const clearMailboxHighlight = useEffectEvent(() => {
    setHighlightedMailboxId(null);
  });

  useEffect(() => {
    if (!highlightedMailboxId) return;

    const handleInteraction = () => {
      clearMailboxHighlight();
    };

    window.addEventListener("pointerdown", handleInteraction, {
      capture: true,
      once: true,
    });
    window.addEventListener("keydown", handleInteraction, {
      capture: true,
      once: true,
    });

    return () => {
      window.removeEventListener("pointerdown", handleInteraction, {
        capture: true,
      });
      window.removeEventListener("keydown", handleInteraction, {
        capture: true,
      });
    };
  }, [highlightedMailboxId]);

  const handleRefresh = useCallback(async () => {
    await manualRefresh.refresh();
  }, [manualRefresh]);

  const handleOpenCreateMailbox = useCallback(() => {
    if (createMailboxMutation.isPending) return;
    setCreateMailboxError(null);
    setIsCreateMailboxOpen(true);
  }, [createMailboxMutation.isPending]);

  const handleCancelCreateMailbox = useCallback(() => {
    if (createMailboxMutation.isPending) return;
    setCreateMailboxError(null);
    setIsCreateMailboxOpen(false);
  }, [createMailboxMutation.isPending]);

  const handleCreateMailbox = useCallback(
    async (values: {
      localPart?: string;
      subdomain?: string;
      rootDomain?: string;
      expiresInMinutes: number;
    }) => {
      setCreateMailboxError(null);

      try {
        const createdMailbox = await createMailboxMutation.mutateAsync(values);
        setHighlightedMailboxId(createdMailbox.id);
        setIsCreateMailboxOpen(false);
        updateSearchParams((draft) => {
          draft.delete("q");
          draft.delete("message");
          draft.set("mailbox", createdMailbox.id);
          if (!isMailboxSortMode(draft.get("sort"))) {
            draft.set("sort", resolvedSortMode);
          }
        });
      } catch (reason) {
        setCreateMailboxError(
          reason instanceof ApiClientError || reason instanceof Error
            ? reason.message
            : "创建邮箱失败",
        );
      }
    },
    [createMailboxMutation, resolvedSortMode, updateSearchParams],
  );

  const workspaceMetaError =
    metaQuery.error instanceof Error && !hasMetaData
      ? metaQuery.error.message
      : null;
  const mailboxesPaneError =
    mailboxesQuery.error && !hasMailboxesData
      ? {
          variant: "recoverable" as const,
          title: "邮箱列表暂时不可用",
          description:
            "工作台左栏依赖邮箱目录和聚合统计，当前不会把失败误显示成空状态。请重新刷新后再继续筛选邮箱。",
          details: getErrorDetails(mailboxesQuery.error),
          onRetry: handleRefresh,
        }
      : null;
  const messagesPaneError =
    messagesQuery.error && !hasMessagesData
      ? {
          variant: "recoverable" as const,
          title: "邮件流加载失败",
          description:
            "当前邮箱范围内的邮件流没有成功返回，所以中栏不会继续伪装成“没有邮件”。",
          details: getErrorDetails(messagesQuery.error),
          onRetry: handleRefresh,
        }
      : null;
  const messagePaneError =
    messageDetailQuery.error && !hasMessageDetailData
      ? isNotFoundError(messageDetailQuery.error)
        ? {
            variant: "not-found" as const,
            title: "这封邮件已经不可见了",
            description:
              "邮件正文可能已经被清理，或者当前会话不再拥有访问权限。你可以重新选择中栏里的其他邮件继续查看。",
            details: getErrorDetails(messageDetailQuery.error),
            onRetry: () => void messageDetailQuery.refetch(),
          }
        : {
            variant: "recoverable" as const,
            title: "邮件正文加载失败",
            description:
              "右栏正文和附件没有成功拉取，所以这里不会继续停留在卡住的加载状态。",
            details: getErrorDetails(messageDetailQuery.error),
            onRetry: () => void messageDetailQuery.refetch(),
          }
      : null;

  return (
    <div className="flex flex-1 flex-col xl:min-h-0">
      <MailWorkspace
        createMailboxAction={{
          defaultTtlMinutes:
            metaQuery.data?.defaultMailboxTtlMinutes ??
            DEFAULT_WORKSPACE_TTL_MINUTES,
          domains: metaQuery.data?.domains ?? [],
          error: createMailboxError,
          isMetaLoading: metaQuery.isLoading,
          isOpen: isCreateMailboxOpen,
          isPending: createMailboxMutation.isPending,
          maxTtlMinutes:
            metaQuery.data?.maxMailboxTtlMinutes ?? maxMailboxTtlMinutes,
          metaError: workspaceMetaError,
          onCancel: handleCancelCreateMailbox,
          onOpen: handleOpenCreateMailbox,
          onSubmit: handleCreateMailbox,
        }}
        mailboxesError={mailboxesPaneError}
        messagesError={messagesPaneError}
        messageError={messagePaneError}
        highlightedMailboxId={highlightedMailboxId}
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
            labelVisibility="desktop"
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
    </div>
  );
};
