import { Check, ChevronsUpDown, PanelsTopLeft } from "lucide-react";
import {
  type ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { Link } from "react-router-dom";

import { ExistingMailboxPopover } from "@/components/mailboxes/existing-mailbox-popover";
import { MailboxCreateCard } from "@/components/mailboxes/mailbox-create-card";
import { MailboxList } from "@/components/mailboxes/mailbox-list";
import { MailboxTagsInput } from "@/components/mailboxes/mailbox-tags-input";
import { MessageRefreshControl } from "@/components/messages/message-refresh-control";
import { EmptyState } from "@/components/shared/empty-state";
import {
  ErrorState,
  type ErrorStateVariant,
} from "@/components/shared/error-state";
import {
  FormCardSkeleton,
  TableCardSkeleton,
} from "@/components/shared/loading-shells";
import { PageHeader } from "@/components/shared/page-header";
import { ActionButton } from "@/components/ui/action-button";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  mailboxKeys,
  useCreateMailboxMutation,
  useDestroyMailboxMutation,
  useEnsureMailboxMutation,
  useMailboxesQuery,
  useUpdateMailboxTagsMutation,
} from "@/hooks/use-mailboxes";
import { messageKeys, useMessagesQuery } from "@/hooks/use-messages";
import { useMetaQuery } from "@/hooks/use-meta";
import { useQueryRefresh } from "@/hooks/use-query-refresh";
import type { ApiMeta, Mailbox } from "@/lib/contracts";
import { getErrorDetails } from "@/lib/error-utils";
import {
  extractExistingMailboxConflict,
  resolveMailboxTtlUpdateOutcome,
} from "@/lib/mailbox-conflicts";
import {
  formatMailboxTagsInput,
  parseMailboxTagInput,
} from "@/lib/mailbox-tags";
import { useReadMessageIds } from "@/lib/message-read-state";
import { resolveLatestRefreshAt } from "@/lib/message-refresh";
import { appRoutes } from "@/lib/routes";
import { cn } from "@/lib/utils";

type MailboxStatusFilter = Mailbox["status"];

const mailboxStatusFilters = [
  { status: "active", label: "可用", description: "可继续收信和在工作台使用" },
  {
    status: "expired",
    label: "已过期",
    description: "回收站：可查看历史、延长 TTL 恢复或立即销毁",
  },
  {
    status: "destroying",
    label: "销毁中",
    description: "正在清理路由与邮箱资源",
  },
  { status: "destroyed", label: "已销毁", description: "仅保留历史记录" },
] satisfies Array<{
  status: MailboxStatusFilter;
  label: string;
  description: string;
}>;

const buildMailboxMessageStats = (
  mailboxIds: string[],
  messages: Array<{ id: string; mailboxId: string }>,
  readMessageIds: string[],
) => {
  const readSet = new Set(readMessageIds);
  const stats = new Map(
    mailboxIds.map((mailboxId) => [mailboxId, { unread: 0, total: 0 }]),
  );

  for (const message of messages) {
    const entry = stats.get(message.mailboxId) ?? { unread: 0, total: 0 };

    entry.total += 1;

    if (!readSet.has(message.id)) {
      entry.unread += 1;
    }

    stats.set(message.mailboxId, entry);
  }

  return stats;
};

type TagFilterSelectProps = {
  value: string;
  suggestions: string[];
  onChange?: (value: string) => void;
};

const TagFilterSelect = ({
  value,
  suggestions,
  onChange,
}: TagFilterSelectProps) => {
  const [isOpen, setIsOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const selectedTags = useMemo(() => parseMailboxTagInput(value), [value]);
  const filteredSuggestions = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    return suggestions.filter((tag) => !query || tag.includes(query));
  }, [searchQuery, suggestions]);

  const toggleTag = (tag: string) => {
    const nextTags = selectedTags.includes(tag)
      ? selectedTags.filter((selectedTag) => selectedTag !== tag)
      : [...selectedTags, tag];
    onChange?.(formatMailboxTagsInput(nextTags));
  };

  const clearTags = () => {
    onChange?.("");
  };

  const buttonLabel =
    selectedTags.length > 0 ? selectedTags.join(", ") : "按 Tag 筛选";

  return (
    <Popover
      open={isOpen}
      onOpenChange={(nextOpen) => {
        setIsOpen(nextOpen);
        if (!nextOpen) setSearchQuery("");
      }}
    >
      <PopoverTrigger asChild>
        <button
          aria-label="按 Tag 筛选"
          aria-expanded={isOpen}
          className={cn(
            "flex h-8 w-full items-center justify-between gap-2 rounded-lg border border-input bg-muted/40 px-3 text-left text-sm outline-none transition hover:bg-white/5 focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-primary/20 md:w-52",
            selectedTags.length === 0 && "text-muted-foreground",
          )}
          type="button"
        >
          <span className="min-w-0 truncate">{buttonLabel}</span>
          <ChevronsUpDown
            aria-hidden="true"
            className="h-3.5 w-3.5 shrink-0 opacity-65"
          />
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        className="w-[var(--radix-popover-trigger-width)] rounded-xl p-1"
        hideArrow
      >
        <Command shouldFilter={false}>
          <CommandInput
            aria-label="搜索 Tag"
            name="mailbox-tag-filter-search-token"
            placeholder="搜索 Tag"
            spellCheck={false}
            value={searchQuery}
            onValueChange={setSearchQuery}
          />
          <CommandList>
            <CommandEmpty>没有匹配的 Tag</CommandEmpty>
            <CommandGroup>
              {selectedTags.length > 0 ? (
                <CommandItem value="__clear_tags__" onSelect={clearTags}>
                  <Check
                    aria-hidden="true"
                    className="mr-2 h-4 w-4 opacity-0"
                  />
                  清除筛选
                </CommandItem>
              ) : null}
              {filteredSuggestions.map((tag) => {
                const isSelected = selectedTags.includes(tag);
                return (
                  <CommandItem
                    aria-label={`筛选 Tag ${tag}`}
                    key={tag}
                    value={tag}
                    onSelect={() => toggleTag(tag)}
                  >
                    <Check
                      aria-hidden="true"
                      className={cn(
                        "mr-2 h-4 w-4",
                        isSelected ? "opacity-100" : "opacity-0",
                      )}
                    />
                    <span className="truncate">{tag}</span>
                  </CommandItem>
                );
              })}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
};

type ExistingMailboxPromptState = {
  mailbox: Mailbox;
  requestedExpiresInMinutes: number | null;
  result: "updated" | "unchanged" | null;
  error: string | null;
};

type MailboxesPageViewProps = {
  meta: ApiMeta | null;
  isMetaLoading?: boolean;
  isListLoading?: boolean;
  createError?: {
    variant: ErrorStateVariant;
    title: string;
    description: string;
    details?: string | null;
  } | null;
  createSubmitError?: string | null;
  listError?: {
    variant: ErrorStateVariant;
    title: string;
    description: string;
    details?: string | null;
  } | null;
  mailboxes: Mailbox[];
  messageStatsByMailbox: Map<string, { unread: number; total: number }>;
  isCreatePending?: boolean;
  refreshAction?: ReactNode;
  selectedMailboxId?: string | null;
  highlightedMailboxId?: string | null;
  mailboxPrompt?: ExistingMailboxPromptState | null;
  tagFilter?: string;
  tagSuggestionMailboxes?: Mailbox[];
  editingTagsMailbox?: Mailbox | null;
  tagsDraft?: string;
  tagsSubmitError?: string | null;
  isTagsPending?: boolean;
  onRetryCreate?: () => void;
  onRetryList?: () => void;
  onCreate: Parameters<typeof MailboxCreateCard>[0]["onSubmit"];
  onConfirmPrompt?: () => void;
  onClosePrompt?: () => void;
  onDestroy: (mailboxId: string) => void;
  onEditTags?: (mailbox: Mailbox) => void;
  onCancelEditTags?: () => void;
  onSaveTags?: () => void;
  onTagsDraftChange?: (value: string) => void;
  onTagFilterChange?: (value: string) => void;
  onRestoreTtl?: (mailbox: Mailbox) => void;
  rowRefBuilder?: (
    mailboxId: string,
  ) => (node: HTMLTableRowElement | null) => void;
};

export const MailboxesPageView = ({
  meta,
  isMetaLoading = false,
  isListLoading = false,
  createError = null,
  createSubmitError = null,
  listError = null,
  mailboxes,
  messageStatsByMailbox,
  isCreatePending = false,
  refreshAction,
  selectedMailboxId = null,
  highlightedMailboxId = null,
  mailboxPrompt = null,
  tagFilter = "",
  tagSuggestionMailboxes,
  editingTagsMailbox = null,
  tagsDraft = "",
  tagsSubmitError = null,
  isTagsPending = false,
  onRetryCreate,
  onRetryList,
  onCreate,
  onConfirmPrompt,
  onClosePrompt,
  onDestroy,
  onEditTags,
  onCancelEditTags,
  onSaveTags,
  onTagsDraftChange,
  onTagFilterChange,
  onRestoreTtl,
  rowRefBuilder,
}: MailboxesPageViewProps) => {
  const [statusFilter, setStatusFilter] =
    useState<MailboxStatusFilter>("active");
  const statusCounts = useMemo(
    () =>
      new Map(
        mailboxStatusFilters.map(({ status }) => [
          status,
          mailboxes.filter((mailbox) => mailbox.status === status).length,
        ]),
      ),
    [mailboxes],
  );
  const tagSuggestions = useMemo(
    () =>
      [
        ...new Set(
          (tagSuggestionMailboxes ?? mailboxes).flatMap(
            (mailbox) => mailbox.tags,
          ),
        ),
      ].sort(),
    [mailboxes, tagSuggestionMailboxes],
  );
  const filteredMailboxes = useMemo(
    () => mailboxes.filter((mailbox) => mailbox.status === statusFilter),
    [mailboxes, statusFilter],
  );
  const activeFilterView =
    mailboxStatusFilters.find((filter) => filter.status === statusFilter) ??
    mailboxStatusFilters[0];

  return (
    <div className="space-y-6">
      <PageHeader
        title="邮箱控制台"
        description="管理邮箱地址、有效期和未读统计。"
        eyebrow="Mailboxes"
        action={
          <div className="flex flex-wrap items-center gap-2">
            {refreshAction}
            <ActionButton
              asChild
              density="default"
              icon={PanelsTopLeft}
              label="打开邮件工作台"
              priority="secondary"
              variant="outline"
            >
              <Link to="/workspace">打开邮件工作台</Link>
            </ActionButton>
          </div>
        }
      />

      {createError ? (
        <Card>
          <CardHeader>
            <CardTitle>创建邮箱</CardTitle>
            <CardDescription>创建新的临时邮箱地址。</CardDescription>
          </CardHeader>
          <CardContent>
            <ErrorState
              variant={createError.variant}
              title={createError.title}
              description={createError.description}
              details={createError.details}
              primaryAction={
                onRetryCreate ? (
                  <Button onClick={onRetryCreate}>重新加载邮箱规则</Button>
                ) : undefined
              }
            />
          </CardContent>
        </Card>
      ) : meta ? (
        <MailboxCreateCard
          domains={meta.domains}
          defaultTtlMinutes={meta.defaultMailboxTtlMinutes}
          maxTtlMinutes={meta.maxMailboxTtlMinutes}
          isMetaLoading={isMetaLoading}
          isPending={isCreatePending}
          minTtlMinutes={meta.minMailboxTtlMinutes}
          submitError={createSubmitError}
          tagSuggestions={tagSuggestions}
          onSubmit={onCreate}
          supportsUnlimitedTtl={meta.supportsUnlimitedMailboxTtl}
        />
      ) : (
        <FormCardSkeleton fieldCount={4} testId="mailbox-create-skeleton" />
      )}

      {editingTagsMailbox ? (
        <Card>
          <CardHeader>
            <CardTitle>编辑 Tags</CardTitle>
            <CardDescription>{editingTagsMailbox.address}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <MailboxTagsInput
              aria-label="邮箱 Tags"
              id="mailbox-tags-editor"
              disabled={isTagsPending}
              suggestions={tagSuggestions}
              value={parseMailboxTagInput(tagsDraft)}
              onChange={(tags) =>
                onTagsDraftChange?.(formatMailboxTagsInput(tags))
              }
            />
            {tagsSubmitError ? (
              <p className="text-sm text-destructive" role="alert">
                {tagsSubmitError}
              </p>
            ) : null}
            <div className="flex flex-wrap justify-end gap-2">
              <Button
                disabled={isTagsPending}
                variant="ghost"
                onClick={onCancelEditTags}
              >
                取消
              </Button>
              <Button disabled={isTagsPending} onClick={onSaveTags}>
                保存 Tags
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
          <div className="space-y-1.5">
            <CardTitle>邮箱列表</CardTitle>
            <CardDescription>查看地址状态、有效期和未读统计。</CardDescription>
          </div>
          {!listError ? (
            <div className="flex w-full flex-col gap-3 md:w-auto md:items-end">
              <TagFilterSelect
                onChange={onTagFilterChange}
                suggestions={tagSuggestions}
                value={tagFilter}
              />
              <Tabs
                aria-label="邮箱状态筛选"
                className="w-full md:w-auto"
                value={statusFilter}
                onValueChange={(nextStatus) => {
                  if (
                    nextStatus === "active" ||
                    nextStatus === "expired" ||
                    nextStatus === "destroying" ||
                    nextStatus === "destroyed"
                  ) {
                    setStatusFilter(nextStatus);
                  }
                }}
              >
                <TabsList className="grid h-8 w-full grid-cols-4 rounded-lg border border-border bg-muted/40 p-0.5 md:w-auto">
                  {mailboxStatusFilters.map((filter) => (
                    <TabsTrigger
                      key={filter.status}
                      className="h-7 gap-1.5 rounded-md px-2 text-xs font-semibold text-muted-foreground data-[state=active]:bg-white/10 data-[state=active]:text-foreground data-[state=active]:shadow-[inset_0_0_0_1px_rgba(255,255,255,0.14),0_1px_1px_rgba(0,0,0,0.18)]"
                      title={filter.description}
                      value={filter.status}
                    >
                      <span>{filter.label}</span>
                      <Badge className="h-5 min-w-5 rounded-full px-1.5 font-mono text-[10px] leading-none">
                        {statusCounts.get(filter.status) ?? 0}
                      </Badge>
                    </TabsTrigger>
                  ))}
                </TabsList>
              </Tabs>
            </div>
          ) : null}
        </CardHeader>
        <CardContent className="space-y-4">
          {listError ? (
            <ErrorState
              variant={listError.variant}
              title={listError.title}
              description={listError.description}
              details={listError.details}
              primaryAction={
                onRetryList ? (
                  <Button onClick={onRetryList}>重新加载邮箱列表</Button>
                ) : undefined
              }
              secondaryAction={
                <Button asChild variant="outline">
                  <Link to={appRoutes.workspace}>打开邮件工作台</Link>
                </Button>
              }
            />
          ) : isListLoading ? (
            <TableCardSkeleton
              columnCount={6}
              rowCount={5}
              testId="mailbox-list-skeleton"
            />
          ) : filteredMailboxes.length > 0 ? (
            <MailboxList
              highlightedMailboxId={highlightedMailboxId}
              mailboxes={filteredMailboxes}
              messageStatsByMailbox={messageStatsByMailbox}
              onDestroy={onDestroy}
              onEditTags={onEditTags}
              onRestoreTtl={onRestoreTtl}
              rowPopover={
                mailboxPrompt && onConfirmPrompt && onClosePrompt
                  ? {
                      mailboxId: mailboxPrompt.mailbox.id,
                      content: (
                        <ExistingMailboxPopover
                          error={mailboxPrompt.error}
                          isPending={isCreatePending}
                          mailbox={mailboxPrompt.mailbox}
                          requestedExpiresInMinutes={
                            mailboxPrompt.requestedExpiresInMinutes
                          }
                          result={mailboxPrompt.result}
                          onClose={onClosePrompt}
                          onConfirm={onConfirmPrompt}
                        />
                      ),
                    }
                  : null
              }
              rowRefBuilder={rowRefBuilder}
              selectedMailboxId={selectedMailboxId}
            />
          ) : (
            <EmptyState
              title={`${activeFilterView.label}列表为空`}
              description={
                statusFilter === "expired"
                  ? "回收站里暂时没有已过期邮箱。"
                  : mailboxes.length === 0
                    ? "当前还没有可管理的邮箱地址。"
                    : `当前没有${activeFilterView.label}状态的邮箱。`
              }
            />
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export const MailboxesPage = () => {
  const [tagFilter, setTagFilter] = useState("");
  const tagFilters = useMemo(
    () => parseMailboxTagInput(tagFilter),
    [tagFilter],
  );
  const metaQuery = useMetaQuery();
  const mailboxesQuery = useMailboxesQuery({
    pollingIntervalMs: 60_000,
    tags: tagFilters,
  });
  const tagSuggestionMailboxesQuery = useMailboxesQuery({
    enabled: tagFilters.length > 0,
    pollingIntervalMs: 60_000,
  });
  const createMailboxMutation = useCreateMailboxMutation();
  const ensureMailboxMutation = useEnsureMailboxMutation();
  const updateMailboxTagsMutation = useUpdateMailboxTagsMutation();
  const messagesQuery = useMessagesQuery([], undefined, {
    pollingIntervalMs: 60_000,
  });
  const destroyMailboxMutation = useDestroyMailboxMutation();
  const readMessageIds = useReadMessageIds();
  const manualRefresh = useQueryRefresh([
    { queryKey: mailboxKeys.all },
    { queryKey: messageKeys.all, exact: false },
  ]);
  const [createSubmitError, setCreateSubmitError] = useState<string | null>(
    null,
  );
  const [selectedMailboxId, setSelectedMailboxId] = useState<string | null>(
    null,
  );
  const [highlightedMailboxId, setHighlightedMailboxId] = useState<
    string | null
  >(null);
  const [mailboxPrompt, setMailboxPrompt] =
    useState<ExistingMailboxPromptState | null>(null);
  const [editingTagsMailbox, setEditingTagsMailbox] = useState<Mailbox | null>(
    null,
  );
  const [tagsDraft, setTagsDraft] = useState("");
  const [tagsSubmitError, setTagsSubmitError] = useState<string | null>(null);
  const rowRefs = useRef(new Map<string, HTMLTableRowElement | null>());
  const lastRefreshedAt = resolveLatestRefreshAt(
    mailboxesQuery.dataUpdatedAt,
    messagesQuery.dataUpdatedAt,
  );
  const isRefreshing =
    manualRefresh.isRefreshing ||
    mailboxesQuery.isFetching ||
    messagesQuery.isFetching;
  const hasMetaData = metaQuery.data !== undefined;
  const hasMailboxesData = mailboxesQuery.data !== undefined;
  const mailboxes = mailboxesQuery.data ?? [];
  const tagSuggestionMailboxes =
    tagFilters.length > 0
      ? (tagSuggestionMailboxesQuery.data ?? mailboxes)
      : mailboxes;

  useEffect(() => {
    if (
      selectedMailboxId !== null &&
      !mailboxes.some((mailbox) => mailbox.id === selectedMailboxId)
    ) {
      setSelectedMailboxId(null);
    }
  }, [mailboxes, selectedMailboxId]);

  useEffect(() => {
    if (
      highlightedMailboxId !== null &&
      !mailboxes.some((mailbox) => mailbox.id === highlightedMailboxId)
    ) {
      setHighlightedMailboxId(null);
    }
  }, [highlightedMailboxId, mailboxes]);

  useEffect(() => {
    const targetMailboxId = highlightedMailboxId ?? selectedMailboxId;
    if (!targetMailboxId) return;

    const row = rowRefs.current.get(targetMailboxId);
    if (!row || typeof row.scrollIntoView !== "function") return;

    row.scrollIntoView({
      block: "nearest",
      behavior: "smooth",
    });
  }, [highlightedMailboxId, selectedMailboxId]);

  const rowRefBuilder = useCallback(
    (mailboxId: string) => (node: HTMLTableRowElement | null) => {
      rowRefs.current.set(mailboxId, node);
    },
    [],
  );

  const clearPrompt = useCallback(() => {
    setMailboxPrompt(null);
    setSelectedMailboxId(null);
    setHighlightedMailboxId(null);
  }, []);

  const handleCreate = useCallback(
    async (values: {
      localPart?: string;
      subdomain?: string;
      rootDomain?: string;
      expiresInMinutes: number | null;
      tags?: string[];
    }) => {
      setCreateSubmitError(null);
      setMailboxPrompt(null);

      try {
        const createdMailbox = await createMailboxMutation.mutateAsync(values);
        setSelectedMailboxId(createdMailbox.id);
        setHighlightedMailboxId(createdMailbox.id);
        return;
      } catch (error) {
        const existingConflict = extractExistingMailboxConflict(error);
        if (existingConflict) {
          setSelectedMailboxId(existingConflict.mailbox.id);
          setHighlightedMailboxId(existingConflict.mailbox.id);
          setMailboxPrompt({
            mailbox: existingConflict.mailbox,
            requestedExpiresInMinutes: values.expiresInMinutes,
            result: null,
            error: null,
          });
          return;
        }

        setCreateSubmitError(
          error instanceof Error ? error.message : "创建邮箱失败",
        );
      }
    },
    [createMailboxMutation],
  );

  const handleEditTags = useCallback((mailbox: Mailbox) => {
    setEditingTagsMailbox(mailbox);
    setTagsDraft(formatMailboxTagsInput(mailbox.tags));
    setTagsSubmitError(null);
  }, []);

  const handleCancelEditTags = useCallback(() => {
    setEditingTagsMailbox(null);
    setTagsDraft("");
    setTagsSubmitError(null);
  }, []);

  const handleSaveTags = useCallback(async () => {
    if (!editingTagsMailbox) return;
    setTagsSubmitError(null);
    try {
      const updatedMailbox = await updateMailboxTagsMutation.mutateAsync({
        mailboxId: editingTagsMailbox.id,
        tags: parseMailboxTagInput(tagsDraft),
      });
      setSelectedMailboxId(updatedMailbox.id);
      setHighlightedMailboxId(updatedMailbox.id);
      handleCancelEditTags();
    } catch (error) {
      setTagsSubmitError(
        error instanceof Error ? error.message : "更新 Tags 失败",
      );
    }
  }, [
    editingTagsMailbox,
    handleCancelEditTags,
    tagsDraft,
    updateMailboxTagsMutation,
  ]);

  const handleConfirmPrompt = useCallback(async () => {
    if (!mailboxPrompt) return;

    setCreateSubmitError(null);
    setMailboxPrompt((current) =>
      current
        ? {
            ...current,
            error: null,
          }
        : current,
    );

    try {
      const nextMailbox = await ensureMailboxMutation.mutateAsync({
        address: mailboxPrompt.mailbox.address,
        expiresInMinutes: mailboxPrompt.requestedExpiresInMinutes,
      });
      setSelectedMailboxId(nextMailbox.id);
      setHighlightedMailboxId(nextMailbox.id);
      setMailboxPrompt({
        mailbox: nextMailbox,
        requestedExpiresInMinutes: mailboxPrompt.requestedExpiresInMinutes,
        result: resolveMailboxTtlUpdateOutcome({
          previousMailbox: mailboxPrompt.mailbox,
          nextMailbox,
        }),
        error: null,
      });
    } catch (error) {
      setMailboxPrompt((current) =>
        current
          ? {
              ...current,
              error: error instanceof Error ? error.message : "更新有效期失败",
            }
          : current,
      );
    }
  }, [ensureMailboxMutation, mailboxPrompt]);

  const handleRestoreTtl = useCallback(
    (mailbox: Mailbox) => {
      const defaultExpiresInMinutes =
        metaQuery.data?.defaultMailboxTtlMinutes ?? null;

      setCreateSubmitError(null);
      setSelectedMailboxId(mailbox.id);
      setHighlightedMailboxId(mailbox.id);
      setMailboxPrompt({
        mailbox,
        requestedExpiresInMinutes: defaultExpiresInMinutes,
        result: null,
        error: null,
      });
    },
    [metaQuery.data?.defaultMailboxTtlMinutes],
  );

  const handleDestroy = useCallback(
    (mailboxId: string) => {
      if (mailboxPrompt?.mailbox.id === mailboxId) {
        clearPrompt();
      }
      if (selectedMailboxId === mailboxId) {
        setSelectedMailboxId(null);
      }
      if (highlightedMailboxId === mailboxId) {
        setHighlightedMailboxId(null);
      }
      destroyMailboxMutation.mutate(mailboxId);
    },
    [
      clearPrompt,
      destroyMailboxMutation,
      highlightedMailboxId,
      mailboxPrompt,
      selectedMailboxId,
    ],
  );

  const messageStatsByMailbox = useMemo(
    () =>
      buildMailboxMessageStats(
        mailboxes.map((mailbox) => mailbox.id),
        messagesQuery.data ?? [],
        readMessageIds,
      ),
    [mailboxes, messagesQuery.data, readMessageIds],
  );

  return (
    <MailboxesPageView
      meta={metaQuery.data ?? null}
      isMetaLoading={metaQuery.isLoading}
      isListLoading={mailboxesQuery.isLoading && !hasMailboxesData}
      createError={
        metaQuery.error && !hasMetaData
          ? {
              variant: "recoverable",
              title: "邮箱规则暂时加载失败",
              description: "暂时无法读取创建邮箱所需的规则，请重新加载后重试。",
              details: getErrorDetails(metaQuery.error),
            }
          : null
      }
      createSubmitError={createSubmitError}
      highlightedMailboxId={highlightedMailboxId}
      listError={
        mailboxesQuery.error && !hasMailboxesData
          ? {
              variant: "recoverable",
              title: "邮箱列表加载失败",
              description: "暂时无法获取邮箱列表，请重新加载后再试。",
              details: getErrorDetails(mailboxesQuery.error),
            }
          : null
      }
      mailboxPrompt={mailboxPrompt}
      tagFilter={tagFilter}
      tagSuggestionMailboxes={tagSuggestionMailboxes}
      editingTagsMailbox={editingTagsMailbox}
      tagsDraft={tagsDraft}
      tagsSubmitError={tagsSubmitError}
      mailboxes={mailboxes}
      messageStatsByMailbox={messageStatsByMailbox}
      isCreatePending={
        createMailboxMutation.isPending || ensureMailboxMutation.isPending
      }
      isTagsPending={updateMailboxTagsMutation.isPending}
      refreshAction={
        <MessageRefreshControl
          isRefreshing={isRefreshing}
          lastRefreshedAt={lastRefreshedAt}
          onRefresh={manualRefresh.refresh}
          density="default"
        />
      }
      rowRefBuilder={rowRefBuilder}
      selectedMailboxId={selectedMailboxId}
      onClosePrompt={clearPrompt}
      onConfirmPrompt={handleConfirmPrompt}
      onCancelEditTags={handleCancelEditTags}
      onRetryCreate={() => {
        void metaQuery.refetch();
      }}
      onRetryList={() => {
        void manualRefresh.refresh();
      }}
      onCreate={handleCreate}
      onDestroy={handleDestroy}
      onEditTags={handleEditTags}
      onRestoreTtl={handleRestoreTtl}
      onSaveTags={handleSaveTags}
      onTagFilterChange={setTagFilter}
      onTagsDraftChange={setTagsDraft}
    />
  );
};
