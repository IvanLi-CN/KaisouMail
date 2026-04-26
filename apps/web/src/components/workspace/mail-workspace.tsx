import {
  ArrowDownUp,
  CircleAlert,
  CircleHelp,
  Copy,
  Inbox,
  ListTree,
  MailOpen,
  PanelRightOpen,
  Plus,
  RotateCcw,
  Search,
  Trash2,
} from "lucide-react";
import {
  type FocusEvent,
  type MouseEvent,
  type ReactNode,
  useEffect,
  useRef,
  useState,
} from "react";
import { Link } from "react-router-dom";

import { MailboxCreateForm } from "@/components/mailboxes/mailbox-create-form";
import {
  buildMailboxCreateAddressExample,
  buildMailboxCreateDomainHint,
  type MailboxCreatePreviewState,
} from "@/components/mailboxes/mailbox-create-preview";
import { MessageReaderPane } from "@/components/messages/message-reader-pane";
import {
  type CopyFeedbackState,
  CopyFeedbackTooltipContent,
  getCopyFeedbackLabel,
} from "@/components/shared/copy-feedback-tooltip-content";
import { EmptyState } from "@/components/shared/empty-state";
import {
  ErrorState,
  type ErrorStateVariant,
} from "@/components/shared/error-state";
import { PageHeader } from "@/components/shared/page-header";
import { VerificationCopyButton } from "@/components/shared/verification-copy-button";
import { ActionButton } from "@/components/ui/action-button";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ButtonGroup } from "@/components/ui/button-group";
import { Input } from "@/components/ui/input";
import {
  Popover,
  PopoverAnchor,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Tooltip } from "@/components/ui/tooltip";
import { useMediaQuery } from "@/hooks/use-media-query";
import { writeClipboardText } from "@/lib/clipboard";
import type { Mailbox, MessageDetail, MessageSummary } from "@/lib/contracts";
import { formatDateTime, formatMailboxExpiry } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { MailboxSortMode } from "@/lib/workspace";

import { PaneScrollbar } from "./pane-scrollbar";
import { VirtualizedPaneList } from "./virtualized-pane-list";

const sortOptions: Array<{ label: string; value: MailboxSortMode }> = [
  { label: "最近收信", value: "recent" },
  { label: "创建时间", value: "created" },
];

const buildMailboxRowLabel = (input: {
  address: string;
  isHighlighted: boolean;
  status: Mailbox["status"];
  source: Mailbox["source"];
  expiresAt: string | null;
  messageCount: number;
  verificationCode: string | null;
}) => {
  const parts = [input.address];

  if (input.status === "destroyed") {
    parts.push("已销毁");
  } else if (input.status === "destroying") {
    parts.push("销毁中");
  } else if (input.status === "expired") {
    parts.push("已过期");
  }

  if (input.isHighlighted) {
    parts.push("新建");
  }

  if (input.source === "catch_all") {
    parts.push("Catch All");
  } else if (input.status === "active") {
    parts.push(formatMailboxExpiry(input.expiresAt));
  }

  parts.push(`${input.messageCount} 封邮件`);

  if (input.verificationCode) {
    parts.push(`可复制验证码 ${input.verificationCode}`);
  }

  return parts.join("，");
};

const resolveMailboxStatusLabel = (mailbox: Mailbox) => {
  if (mailbox.status === "destroyed") return "已销毁";
  if (mailbox.status === "destroying") return "销毁中";
  if (mailbox.status === "expired") return "已过期";
  if (mailbox.source !== "registered") return null;
  return formatMailboxExpiry(mailbox.expiresAt);
};

const buildMessageRowLabel = (message: MessageSummary) => {
  const parts = [
    message.subject,
    message.previewText,
    message.fromAddress ?? "Unknown",
    formatDateTime(message.receivedAt),
    message.mailboxAddress,
  ];

  if (message.verification?.code) {
    parts.push(`验证码 ${message.verification.code}`);
  }

  return parts.join("，");
};

type WorkspacePaneError = {
  variant: ErrorStateVariant;
  title: string;
  description: string;
  details?: string | null;
  onRetry?: () => void;
};

type MailWorkspaceProps = {
  createMailboxAction: {
    defaultTtlMinutes: number;
    domains: string[];
    error: string | null;
    isMetaLoading: boolean;
    isOpen: boolean;
    isPending: boolean;
    minTtlMinutes: number;
    maxTtlMinutes: number;
    supportsUnlimitedTtl: boolean;
    metaError: string | null;
    onCancel: () => void;
    onOpen: () => void;
    onSubmit: (values: {
      localPart?: string;
      subdomain?: string;
      rootDomain?: string;
      expiresInMinutes: number | null;
    }) => Promise<void> | void;
  };
  mailboxesError?: WorkspacePaneError | null;
  messagesError?: WorkspacePaneError | null;
  messageError?: WorkspacePaneError | null;
  highlightedMailboxId?: string | null;
  mailboxPrompt?: {
    mailboxId: string;
    content: ReactNode;
  } | null;
  visibleMailboxes: Mailbox[];
  totalMailboxCount: number;
  trashMailboxCount?: number;
  mailboxView?: "active" | "trash";
  totalMessageCount: number;
  totalAggregatedMessageCount: number;
  mailboxMessageCounts: Map<string, number>;
  mailboxLatestVerificationCodes: Map<string, string>;
  selectedMailboxId: string;
  selectedMailbox: Mailbox | null;
  messages: MessageSummary[];
  selectedMessageId: string | null;
  selectedMessage: MessageDetail | null;
  searchQuery: string;
  sortMode: MailboxSortMode;
  refreshAction?: ReactNode;
  isMailboxesLoading?: boolean;
  isMessagesLoading?: boolean;
  isMessageLoading?: boolean;
  mailboxManagementHref: string;
  messageDetailHref: string | null;
  onSearchQueryChange: (value: string) => void;
  onSortModeChange: (mode: MailboxSortMode) => void;
  onMailboxViewChange?: (view: "active" | "trash") => void;
  onRestoreMailbox?: (mailbox: Mailbox) => void;
  onDestroyMailbox?: (mailboxId: string) => void;
  onSelectMailbox: (mailboxId: string) => void;
  onSelectMessage: (messageId: string) => void;
};

export const MailWorkspace = ({
  createMailboxAction,
  mailboxesError = null,
  messagesError = null,
  messageError = null,
  highlightedMailboxId = null,
  mailboxPrompt = null,
  visibleMailboxes,
  totalMailboxCount,
  trashMailboxCount = 0,
  mailboxView = "active",
  totalMessageCount,
  totalAggregatedMessageCount,
  mailboxMessageCounts,
  mailboxLatestVerificationCodes,
  selectedMailboxId,
  selectedMailbox,
  messages,
  selectedMessageId,
  selectedMessage,
  searchQuery,
  sortMode,
  refreshAction,
  isMailboxesLoading = false,
  isMessagesLoading = false,
  isMessageLoading = false,
  mailboxManagementHref,
  messageDetailHref,
  onSearchQueryChange,
  onSortModeChange,
  onMailboxViewChange,
  onRestoreMailbox,
  onDestroyMailbox,
  onSelectMailbox,
  onSelectMessage,
}: MailWorkspaceProps) => {
  const selectedMessageSummary =
    messages.find((message) => message.id === selectedMessageId) ?? null;
  const [previewState, setPreviewState] = useState<MailboxCreatePreviewState>({
    mode: "segmented",
  });
  const [mailboxAddressCopyState, setMailboxAddressCopyState] = useState<{
    address: string | null;
    state: CopyFeedbackState;
  }>({
    address: null,
    state: "idle",
  });
  const mailboxAddressCopyResetRef = useRef<number | null>(null);
  const isDesktopThreePane = useMediaQuery("(min-width: 1280px)");
  const isTrashView = mailboxView === "trash";
  const selectedMailboxIndex = visibleMailboxes.findIndex(
    (mailbox) =>
      mailbox.id === highlightedMailboxId || mailbox.id === selectedMailboxId,
  );
  const selectedMessageIndex = messages.findIndex(
    (message) => message.id === selectedMessageId,
  );
  const getMailboxAddressCopyState = (address: string) =>
    mailboxAddressCopyState.address === address
      ? mailboxAddressCopyState.state
      : "idle";
  const resolvedMailboxAddressCopyState = selectedMailbox?.address
    ? getMailboxAddressCopyState(selectedMailbox.address)
    : "idle";

  useEffect(
    () => () => {
      if (mailboxAddressCopyResetRef.current !== null) {
        window.clearTimeout(mailboxAddressCopyResetRef.current);
      }
    },
    [],
  );

  const scheduleMailboxAddressCopyStateReset = () => {
    if (mailboxAddressCopyResetRef.current !== null) {
      window.clearTimeout(mailboxAddressCopyResetRef.current);
    }

    mailboxAddressCopyResetRef.current = window.setTimeout(() => {
      setMailboxAddressCopyState({
        address: null,
        state: "idle",
      });
      mailboxAddressCopyResetRef.current = null;
    }, 2_000);
  };

  const handleMailboxAddressFocus = (event: FocusEvent<HTMLButtonElement>) => {
    const selection = window.getSelection();
    if (!selection) return;

    const range = document.createRange();
    range.selectNodeContents(event.currentTarget);
    selection.removeAllRanges();
    selection.addRange(range);
  };

  const handleMailboxAddressClick = (event: MouseEvent<HTMLButtonElement>) => {
    const selection = window.getSelection();
    if (!selection) return;

    const range = document.createRange();
    range.selectNodeContents(event.currentTarget);
    selection.removeAllRanges();
    selection.addRange(range);
  };

  const handleCopyMailboxAddress = async (address: string) => {
    try {
      await writeClipboardText(address);
      setMailboxAddressCopyState({
        address,
        state: "success",
      });
    } catch {
      setMailboxAddressCopyState({
        address,
        state: "error",
      });
    }

    scheduleMailboxAddressCopyStateReset();
  };

  const getMailboxAddressCopyTooltipContent = (
    state: CopyFeedbackState,
    scope: "selected" | "row",
  ) => (
    <CopyFeedbackTooltipContent
      errorText="复制失败，请手动复制"
      idleText={scope === "selected" ? "复制当前邮箱地址" : "复制邮箱地址"}
      state={state}
      successText={
        scope === "selected" ? "已复制当前邮箱地址" : "已复制邮箱地址"
      }
      successDisplayText="已复制"
    />
  );

  const getMailboxAddressCopyLabel = (
    state: CopyFeedbackState,
    scope: "selected" | "row",
  ) =>
    getCopyFeedbackLabel({
      state,
      idleText: scope === "selected" ? "复制当前邮箱地址" : "复制邮箱地址",
      successText:
        scope === "selected" ? "已复制当前邮箱地址" : "已复制邮箱地址",
      errorText: "复制失败，请手动复制",
    });

  const getMailboxAddressCopyButtonClassName = (state: CopyFeedbackState) =>
    cn(
      "inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-md border bg-background/40 p-0 transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
      state === "error"
        ? "border-destructive/45 text-destructive hover:border-destructive/65 hover:bg-destructive/10"
        : "border-border text-muted-foreground hover:border-border/80 hover:bg-white/5 hover:text-foreground",
    );

  const renderMailboxError = () => (
    <ErrorState
      variant={mailboxesError?.variant ?? "recoverable"}
      title={mailboxesError?.title ?? "邮箱列表暂时不可用"}
      description={mailboxesError?.description ?? "请稍后重试。"}
      details={mailboxesError?.details}
      primaryAction={
        mailboxesError?.onRetry ? (
          <Button onClick={mailboxesError.onRetry}>重新加载邮箱列表</Button>
        ) : undefined
      }
    />
  );

  const renderMessagesError = () => (
    <ErrorState
      variant={messagesError?.variant ?? "recoverable"}
      title={messagesError?.title ?? "邮件流加载失败"}
      description={messagesError?.description ?? "请稍后重试。"}
      details={messagesError?.details}
      primaryAction={
        messagesError?.onRetry ? (
          <Button onClick={messagesError.onRetry}>重新加载邮件列表</Button>
        ) : undefined
      }
    />
  );

  const renderMessagePaneContent = () => {
    if (isMessageLoading && selectedMessageSummary) {
      return (
        <div className="rounded-xl border border-border bg-muted/10 px-3 py-6 text-center text-sm text-muted-foreground">
          正在加载《{selectedMessageSummary.subject}》的正文…
        </div>
      );
    }

    if (messageError) {
      return (
        <ErrorState
          variant={messageError.variant}
          title={messageError.title}
          description={messageError.description}
          details={messageError.details}
          primaryAction={
            messageError.onRetry ? (
              <Button onClick={messageError.onRetry}>重新加载邮件正文</Button>
            ) : undefined
          }
          secondaryAction={
            messageDetailHref ? (
              <Button asChild variant="outline">
                <Link to={messageDetailHref}>打开独立详情页</Link>
              </Button>
            ) : undefined
          }
        />
      );
    }

    if (selectedMessage) {
      return (
        <MessageReaderPane
          message={selectedMessage}
          rawUrl={selectedMessage.rawDownloadPath}
        />
      );
    }

    return (
      <EmptyState
        title="还没有选中邮件"
        description="从中栏点一封邮件，右边就会直接展开正文与附件信息。"
      />
    );
  };

  return (
    <div className="space-y-6 xl:flex xl:min-h-0 xl:flex-1 xl:flex-col xl:gap-6 xl:space-y-0">
      <PageHeader
        title="邮件工作台"
        description={
          <p className="hidden max-w-3xl text-sm leading-6 text-muted-foreground sm:block">
            集中查看邮箱、邮件列表和正文内容。
          </p>
        }
        eyebrow="Workspace"
        action={
          <div className="flex w-full flex-wrap items-center gap-2 lg:w-auto lg:justify-end">
            <Popover open={createMailboxAction.isOpen}>
              <PopoverAnchor asChild>
                <ActionButton
                  density="dense"
                  forceIconOnly
                  icon={Plus}
                  label="新建邮箱"
                  labelVisibility="desktop"
                  priority="primary"
                  variant="default"
                  onClick={createMailboxAction.onOpen}
                />
              </PopoverAnchor>
              <PopoverContent
                align="end"
                className="w-[min(calc(100vw-2rem),32rem)]"
                collisionPadding={20}
                onEscapeKeyDown={(event) => {
                  if (createMailboxAction.isPending) {
                    event.preventDefault();
                    return;
                  }

                  createMailboxAction.onCancel();
                }}
                onFocusOutside={(event) => {
                  event.preventDefault();
                }}
                onInteractOutside={(event) => {
                  event.preventDefault();
                }}
              >
                <div className="space-y-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="space-y-1">
                      <p className="text-sm font-semibold text-foreground">
                        新建邮箱
                      </p>
                      <p className="text-xs leading-5 text-muted-foreground">
                        创建后会自动切换到新邮箱。
                      </p>
                    </div>
                    <Popover>
                      <PopoverTrigger asChild>
                        <button
                          aria-label="查看邮箱创建说明"
                          className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-border bg-background/60 text-muted-foreground transition-colors hover:border-border/80 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                          type="button"
                        >
                          <CircleHelp aria-hidden className="h-4 w-4" />
                        </button>
                      </PopoverTrigger>
                      <PopoverContent
                        align="end"
                        className="w-[min(calc(100vw-2rem),20rem)] space-y-3 p-4"
                        collisionPadding={20}
                      >
                        <div className="space-y-1">
                          <p className="text-sm font-semibold text-foreground">
                            邮箱创建说明
                          </p>
                          <p className="text-xs leading-5 text-muted-foreground">
                            {previewState.mode === "address"
                              ? "支持直接输入完整邮箱地址；系统会校验这个域名是否属于当前支持列表。"
                              : "用户名和子域可留空；系统会按当前可用域名自动生成地址，也可以手动指定邮箱域名和有效期。"}
                          </p>
                        </div>
                        <div className="space-y-2 text-xs leading-5 text-muted-foreground">
                          <p>
                            {buildMailboxCreateDomainHint({
                              ...previewState,
                              hasAvailableDomains:
                                createMailboxAction.domains.length > 0,
                            })}
                          </p>
                          <p>
                            示例地址：
                            <span className="font-medium text-foreground">
                              {" "}
                              {buildMailboxCreateAddressExample({
                                ...previewState,
                                hasAvailableDomains:
                                  createMailboxAction.domains.length > 0,
                              })}
                            </span>
                          </p>
                        </div>
                      </PopoverContent>
                    </Popover>
                  </div>
                  <div className="space-y-1">
                    {createMailboxAction.metaError ? (
                      <p className="text-xs leading-5 text-destructive">
                        邮箱规则加载失败：{createMailboxAction.metaError}
                      </p>
                    ) : null}
                  </div>

                  <MailboxCreateForm
                    autoFocusFirstField
                    defaultTtlMinutes={createMailboxAction.defaultTtlMinutes}
                    domains={createMailboxAction.domains}
                    isMetaLoading={createMailboxAction.isMetaLoading}
                    isPending={createMailboxAction.isPending}
                    maxTtlMinutes={createMailboxAction.maxTtlMinutes}
                    minTtlMinutes={createMailboxAction.minTtlMinutes}
                    supportsUnlimitedTtl={
                      createMailboxAction.supportsUnlimitedTtl
                    }
                    submitError={createMailboxAction.error}
                    ttlDensity="compact"
                    onCancel={createMailboxAction.onCancel}
                    onPreviewChange={setPreviewState}
                    onSubmit={createMailboxAction.onSubmit}
                  />
                </div>
              </PopoverContent>
            </Popover>
            {refreshAction}
            <ActionButton
              asChild
              density="dense"
              icon={ListTree}
              label="打开邮箱管理"
              labelVisibility="desktop"
              priority="secondary"
              tooltip="打开邮箱管理"
              variant="outline"
            >
              <Link to={mailboxManagementHref}>打开邮箱管理</Link>
            </ActionButton>
          </div>
        }
      />

      <div
        data-testid="mail-workspace-layout"
        className="grid gap-4 lg:grid-cols-[300px_minmax(0,1fr)] xl:min-h-0 xl:flex-1 xl:grid-cols-[320px_minmax(360px,0.9fr)_minmax(0,1.2fr)] 2xl:grid-cols-[340px_minmax(380px,0.9fr)_minmax(0,1.25fr)]"
      >
        <section
          aria-label="邮箱列表"
          className="min-w-0 lg:row-span-2 xl:row-auto xl:min-h-0"
        >
          <div className="flex h-full min-h-[28rem] flex-col overflow-hidden rounded-2xl border border-border bg-card lg:min-h-[52rem] xl:h-full xl:min-h-0">
            <div className="space-y-4 border-b border-border px-4 py-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-foreground">
                    邮箱列表
                  </p>
                  <p className="text-xs leading-5 text-muted-foreground">
                    {isTrashView
                      ? `${trashMailboxCount} 个过期邮箱 · ${totalMessageCount} 封历史邮件`
                      : `${totalMailboxCount} 个邮箱 · ${totalMessageCount} 封邮件`}
                  </p>
                </div>
                <Badge className="border-primary/30 bg-primary/15 text-primary">
                  高密度
                </Badge>
              </div>

              <div className="space-y-3">
                <label className="sr-only" htmlFor="workspace-mailbox-search">
                  搜索邮箱
                </label>
                <div className="relative">
                  <Search className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    id="workspace-mailbox-search"
                    className="pl-9"
                    placeholder="按邮箱地址搜索"
                    value={searchQuery}
                    onChange={(event) =>
                      onSearchQueryChange(event.target.value)
                    }
                  />
                </div>

                <ButtonGroup aria-label="邮箱视图">
                  {[
                    { value: "active" as const, label: "工作区" },
                    {
                      value: "trash" as const,
                      label: "回收站",
                      badge: trashMailboxCount,
                    },
                  ].map((option) => {
                    const selected = mailboxView === option.value;

                    return (
                      <Button
                        aria-pressed={selected}
                        className={cn(
                          "h-9 cursor-pointer px-3.5 text-xs font-semibold transition-[background-color,border-color,color,box-shadow] duration-200",
                          selected &&
                            "z-10 border-primary/55 bg-secondary text-foreground shadow-[inset_0_0_0_1px_hsl(var(--primary)/0.14),0_0_0_1px_hsl(var(--primary)/0.18)] hover:bg-secondary/90",
                        )}
                        key={option.value}
                        onClick={() => onMailboxViewChange?.(option.value)}
                        size="sm"
                        type="button"
                        variant={selected ? "default" : "outline"}
                      >
                        <span>{option.label}</span>
                        {"badge" in option ? (
                          <Badge
                            className={cn(
                              "ml-1 min-w-5 justify-center px-1.5 py-0 text-[0.625rem] leading-4 tracking-normal",
                              selected
                                ? "border-primary/35 bg-primary/10 text-primary"
                                : "bg-background/60 text-muted-foreground",
                            )}
                          >
                            {option.badge}
                          </Badge>
                        ) : null}
                      </Button>
                    );
                  })}
                </ButtonGroup>

                <fieldset className="flex flex-wrap gap-2 rounded-xl border border-border bg-muted/20 p-1">
                  <legend className="sr-only">邮箱排序</legend>
                  {sortOptions.map((option) => {
                    const active = sortMode === option.value;
                    return (
                      <button
                        key={option.value}
                        type="button"
                        className={cn(
                          "inline-flex cursor-pointer items-center gap-2 whitespace-nowrap rounded-lg px-3 py-2 text-xs font-medium transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                          active
                            ? "bg-secondary text-foreground"
                            : "text-muted-foreground hover:bg-white/5 hover:text-foreground",
                        )}
                        onClick={() => onSortModeChange(option.value)}
                      >
                        <ArrowDownUp className="h-3.5 w-3.5" />
                        {option.label}
                      </button>
                    );
                  })}
                </fieldset>
              </div>
            </div>

            <div className="py-3 xl:flex xl:min-h-0 xl:flex-1 xl:flex-col">
              <button
                type="button"
                data-active={selectedMailboxId === "all" ? "true" : undefined}
                className={cn(
                  "workspace-mailbox-item mx-3 flex w-auto cursor-pointer flex-col gap-2 rounded-xl border px-3 py-3 text-left transition-[background-color,border-color,box-shadow] duration-200 focus-visible:outline-none",
                )}
                onClick={() => onSelectMailbox("all")}
              >
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <Inbox className="h-4 w-4 text-primary" />
                    <span className="text-sm font-medium text-foreground">
                      全部邮箱
                    </span>
                  </div>
                  <Badge>{totalAggregatedMessageCount}</Badge>
                </div>
                <p className="text-xs leading-5 text-muted-foreground">
                  {isTrashView
                    ? "聚合显示回收站中过期邮箱的历史邮件，适合清理前复查。"
                    : "聚合显示所有邮箱的最新邮件，适合日常巡检与快速切换。"}
                </p>
              </button>

              {isMailboxesLoading ? (
                <div className="mx-3 mt-2 rounded-xl border border-border bg-muted/10 px-3 py-6 text-center text-sm text-muted-foreground">
                  正在加载邮箱列表…
                </div>
              ) : mailboxesError ? (
                <div className="mx-3 mt-3 xl:min-h-0 xl:flex-1">
                  {isDesktopThreePane ? (
                    <PaneScrollbar className="h-full" contentClassName="pb-2">
                      {renderMailboxError()}
                    </PaneScrollbar>
                  ) : (
                    renderMailboxError()
                  )}
                </div>
              ) : visibleMailboxes.length > 0 ? (
                <div className="mt-3 xl:min-h-0 xl:flex-1">
                  <VirtualizedPaneList
                    activeIndex={
                      selectedMailboxIndex >= 0 ? selectedMailboxIndex : null
                    }
                    enabled={isDesktopThreePane}
                    estimateSize={() => 108}
                    getItemKey={(mailbox) => mailbox.id}
                    items={visibleMailboxes}
                    overscan={8}
                    scrollContainerClassName="h-full px-3 xl:px-0"
                    scrollContentClassName="pb-2 pl-3"
                    scrollTestId="workspace-mailbox-scroll"
                    renderItem={(mailbox) => {
                      const isActive = selectedMailboxId === mailbox.id;
                      const isExpired = mailbox.status === "expired";
                      const isDestroyed = mailbox.status === "destroyed";
                      const isHighlighted = highlightedMailboxId === mailbox.id;
                      const isPromptOpen =
                        mailboxPrompt?.mailboxId === mailbox.id;
                      const messageCount =
                        mailboxMessageCounts.get(mailbox.id) ?? 0;
                      const verificationCode =
                        mailboxLatestVerificationCodes.get(mailbox.id) ?? null;
                      const mailboxRowLabel = buildMailboxRowLabel({
                        address: mailbox.address,
                        isHighlighted,
                        status: mailbox.status,
                        source: mailbox.source,
                        expiresAt: mailbox.expiresAt,
                        messageCount,
                        verificationCode,
                      });
                      const statusLabel = resolveMailboxStatusLabel(mailbox);

                      const mailboxAddressCopyStateForRow =
                        getMailboxAddressCopyState(mailbox.address);

                      return (
                        <div
                          className={cn(
                            "workspace-mailbox-item relative flex w-full rounded-xl border px-3 py-3 text-left transition-[background-color,border-color,box-shadow] duration-200",
                            isDestroyed
                              ? "cursor-not-allowed border-border/80 bg-muted/5 text-muted-foreground opacity-55"
                              : null,
                            !isDestroyed && isHighlighted
                              ? "text-foreground"
                              : null,
                          )}
                          data-active={isActive ? "true" : undefined}
                          data-disabled={isDestroyed ? "true" : undefined}
                          data-highlighted={isHighlighted ? "true" : undefined}
                        >
                          {!isDestroyed ? (
                            <button
                              aria-label={mailboxRowLabel}
                              className="absolute inset-0 rounded-xl focus-visible:outline-none"
                              type="button"
                              onClick={() => onSelectMailbox(mailbox.id)}
                            >
                              <span className="sr-only">{mailbox.address}</span>
                            </button>
                          ) : null}
                          <div className="pointer-events-none relative z-10 flex min-w-0 flex-1 flex-col gap-2">
                            <div className="flex min-w-0 items-start justify-between gap-2">
                              <div className="flex min-w-0 flex-1 items-start gap-2">
                                <p
                                  className={cn(
                                    "min-w-0 truncate text-sm font-medium",
                                    isDestroyed
                                      ? "text-muted-foreground"
                                      : "text-foreground",
                                  )}
                                  title={mailbox.address}
                                >
                                  {mailbox.address}
                                </p>
                                <Tooltip
                                  delayDuration={120}
                                  forceOpen={
                                    mailboxAddressCopyStateForRow !== "idle"
                                  }
                                  tooltipContent={getMailboxAddressCopyTooltipContent(
                                    mailboxAddressCopyStateForRow,
                                    "row",
                                  )}
                                >
                                  <button
                                    aria-label={getMailboxAddressCopyLabel(
                                      mailboxAddressCopyStateForRow,
                                      "row",
                                    )}
                                    className={cn(
                                      "pointer-events-auto mt-0.5 shrink-0",
                                      getMailboxAddressCopyButtonClassName(
                                        mailboxAddressCopyStateForRow,
                                      ),
                                    )}
                                    type="button"
                                    onClick={(event) => {
                                      event.preventDefault();
                                      event.stopPropagation();
                                      void handleCopyMailboxAddress(
                                        mailbox.address,
                                      );
                                    }}
                                  >
                                    {mailboxAddressCopyStateForRow ===
                                    "error" ? (
                                      <CircleAlert
                                        aria-hidden
                                        className="h-3.5 w-3.5"
                                      />
                                    ) : (
                                      <Copy
                                        aria-hidden
                                        className="h-3.5 w-3.5"
                                      />
                                    )}
                                  </button>
                                </Tooltip>
                              </div>
                              <div className="flex shrink-0 items-center gap-2">
                                {isHighlighted && !isDestroyed ? (
                                  <Badge className="border-primary/40 bg-primary/20 text-primary">
                                    新建
                                  </Badge>
                                ) : null}
                                <Badge
                                  className={cn(
                                    "min-w-7 shrink-0 justify-center px-2",
                                    messageCount === 0
                                      ? "border-border bg-muted/20 text-muted-foreground"
                                      : "border-primary/30 bg-primary/15 text-primary",
                                  )}
                                >
                                  {messageCount}
                                </Badge>
                              </div>
                            </div>
                            <div className="flex min-w-0 items-center justify-between gap-3 text-xs text-muted-foreground">
                              <div className="flex min-w-0 flex-wrap items-center gap-2">
                                {mailbox.source === "catch_all" ? (
                                  <Badge className="border-amber-500/35 bg-amber-500/12 text-amber-100">
                                    Catch All
                                  </Badge>
                                ) : null}
                                {statusLabel && !isDestroyed ? (
                                  isPromptOpen ? (
                                    <Popover open>
                                      <PopoverAnchor asChild>
                                        <span className="truncate rounded-md px-0.5">
                                          {statusLabel}
                                        </span>
                                      </PopoverAnchor>
                                      <PopoverContent
                                        align="center"
                                        className="w-[min(calc(100vw-2rem),22rem)] space-y-4 px-4 py-4"
                                        hideWhenDetached={false}
                                        side="right"
                                        sideOffset={8}
                                      >
                                        {mailboxPrompt?.content}
                                      </PopoverContent>
                                    </Popover>
                                  ) : (
                                    <span className="truncate">
                                      {statusLabel}
                                    </span>
                                  )
                                ) : null}
                                {isDestroyed ? (
                                  <span className="truncate">已销毁</span>
                                ) : null}
                              </div>
                              <div className="pointer-events-auto flex shrink-0 items-center gap-1">
                                {verificationCode && !isDestroyed ? (
                                  <VerificationCopyButton
                                    code={verificationCode}
                                    variant="compact"
                                  />
                                ) : null}
                                {isExpired && onRestoreMailbox ? (
                                  <ActionButton
                                    density="dense"
                                    forceIconOnly
                                    icon={RotateCcw}
                                    label="恢复邮箱"
                                    size="sm"
                                    tooltip={`延长 ${mailbox.address} 的 TTL 并恢复使用`}
                                    variant="outline"
                                    onClick={() => onRestoreMailbox(mailbox)}
                                  />
                                ) : null}
                                {isExpired && onDestroyMailbox ? (
                                  <ActionButton
                                    density="dense"
                                    forceIconOnly
                                    icon={Trash2}
                                    label="销毁邮箱"
                                    size="sm"
                                    tooltip={`销毁 ${mailbox.address}`}
                                    variant="destructive"
                                    onClick={() => onDestroyMailbox(mailbox.id)}
                                  />
                                ) : null}
                              </div>
                            </div>
                          </div>
                        </div>
                      );
                    }}
                  />
                </div>
              ) : (
                <div className="mx-3 mt-2">
                  <EmptyState
                    title={isTrashView ? "回收站为空" : "没有匹配邮箱"}
                    description={
                      isTrashView
                        ? "过期邮箱会移入这里，可在清理前恢复或销毁。"
                        : "试试清空搜索词，或者直接在这里新建一个地址。"
                    }
                    action={
                      isTrashView ? undefined : (
                        <Button
                          variant="outline"
                          onClick={createMailboxAction.onOpen}
                        >
                          新建邮箱
                        </Button>
                      )
                    }
                  />
                </div>
              )}
            </div>
          </div>
        </section>

        <section aria-label="邮件列表" className="min-w-0 xl:min-h-0">
          <div className="flex min-h-[22rem] flex-col overflow-hidden rounded-2xl border border-border bg-card lg:min-h-[25rem] xl:h-full xl:min-h-0">
            <div className="space-y-2 border-b border-border px-4 py-4">
              {selectedMailbox ? (
                <div className="space-y-2">
                  <div className="text-sm font-semibold leading-6 text-foreground">
                    <button
                      className="cursor-text break-all bg-transparent p-0 text-left outline-none focus:outline-none"
                      data-testid="workspace-selected-mailbox-address"
                      type="button"
                      onClick={handleMailboxAddressClick}
                      onFocus={handleMailboxAddressFocus}
                    >
                      {selectedMailbox.address}
                    </button>
                    <Tooltip
                      delayDuration={120}
                      forceOpen={resolvedMailboxAddressCopyState !== "idle"}
                      tooltipContent={getMailboxAddressCopyTooltipContent(
                        resolvedMailboxAddressCopyState,
                        "selected",
                      )}
                    >
                      <button
                        aria-label={getMailboxAddressCopyLabel(
                          resolvedMailboxAddressCopyState,
                          "selected",
                        )}
                        className={cn(
                          "ml-1.5 align-middle",
                          getMailboxAddressCopyButtonClassName(
                            resolvedMailboxAddressCopyState,
                          ),
                        )}
                        type="button"
                        onClick={() =>
                          void handleCopyMailboxAddress(selectedMailbox.address)
                        }
                      >
                        {resolvedMailboxAddressCopyState === "error" ? (
                          <CircleAlert aria-hidden className="h-3.5 w-3.5" />
                        ) : (
                          <Copy aria-hidden className="h-3.5 w-3.5" />
                        )}
                      </button>
                    </Tooltip>
                    <span className="ml-1.5 text-sm font-semibold text-foreground">
                      的邮件
                    </span>
                  </div>
                </div>
              ) : (
                <p className="text-sm font-semibold text-foreground">
                  全部邮箱邮件
                </p>
              )}
              <p className="text-xs leading-5 text-muted-foreground">
                {selectedMailbox
                  ? "需要时可直接点选地址文本或点击复制按钮，快速分享当前邮箱。"
                  : "默认聚合所有邮箱的收件流，方便按主题与发件人快速巡检。"}
              </p>
            </div>

            <div className="py-3 xl:flex xl:min-h-0 xl:flex-1 xl:flex-col">
              {isMessagesLoading ? (
                <div className="mx-3 rounded-xl border border-border bg-muted/10 px-3 py-6 text-center text-sm text-muted-foreground">
                  正在加载邮件列表…
                </div>
              ) : messagesError ? (
                <div className="mx-3 xl:min-h-0 xl:flex-1">
                  {isDesktopThreePane ? (
                    <PaneScrollbar className="h-full" contentClassName="pb-2">
                      {renderMessagesError()}
                    </PaneScrollbar>
                  ) : (
                    renderMessagesError()
                  )}
                </div>
              ) : messages.length > 0 ? (
                <div className="xl:min-h-0 xl:flex-1">
                  <VirtualizedPaneList
                    activeIndex={
                      selectedMessageIndex >= 0 ? selectedMessageIndex : null
                    }
                    enabled={isDesktopThreePane}
                    estimateSize={() => 104}
                    getItemKey={(message) => message.id}
                    items={messages}
                    overscan={8}
                    scrollContainerClassName="h-full px-3 xl:px-0"
                    scrollContentClassName="pb-2 pl-3"
                    scrollTestId="workspace-message-scroll"
                    renderItem={(message) => {
                      const active = message.id === selectedMessageId;
                      const verificationCode =
                        message.verification?.code ?? null;
                      const messageRowLabel = buildMessageRowLabel(message);

                      return (
                        <div
                          className="workspace-message-item relative rounded-xl border transition-[background-color,border-color,box-shadow] duration-200"
                          data-active={active ? "true" : undefined}
                        >
                          <button
                            aria-label={messageRowLabel}
                            className="absolute inset-0 rounded-xl focus-visible:outline-none"
                            type="button"
                            onClick={() => onSelectMessage(message.id)}
                          >
                            <span className="sr-only">{message.subject}</span>
                          </button>
                          <div className="pointer-events-none relative z-10 flex items-start gap-3 px-3 py-3">
                            <div className="flex min-w-0 flex-1 flex-col gap-3">
                              <div className="space-y-1">
                                <p className="text-sm font-medium text-foreground">
                                  {message.subject}
                                </p>
                                <p className="line-clamp-2 text-xs leading-5 text-muted-foreground">
                                  {message.previewText}
                                </p>
                              </div>
                              <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
                                <span>{message.fromAddress ?? "Unknown"}</span>
                                <span>
                                  {formatDateTime(message.receivedAt)}
                                </span>
                                <span>{message.mailboxAddress}</span>
                              </div>
                            </div>
                            {verificationCode ? (
                              <div className="pointer-events-auto">
                                <VerificationCopyButton
                                  className="self-stretch"
                                  code={verificationCode}
                                  variant="panel"
                                />
                              </div>
                            ) : (
                              <div className="flex w-8 shrink-0 items-start justify-end pt-1">
                                <MailOpen
                                  className={cn(
                                    "h-4 w-4 shrink-0",
                                    active
                                      ? "text-primary"
                                      : "text-muted-foreground",
                                  )}
                                />
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    }}
                  />
                </div>
              ) : (
                <div className="mx-3">
                  <EmptyState
                    title="当前范围内还没有邮件"
                    description={
                      isTrashView
                        ? "回收站里的历史邮件会在选中过期邮箱后显示。"
                        : "可以先创建邮箱并发送测试邮件，或者切回全部邮箱视图查看聚合列表。"
                    }
                  />
                </div>
              )}
            </div>
          </div>
        </section>

        <section aria-label="邮件内容" className="min-w-0 xl:min-h-0">
          <div className="flex min-h-[24rem] flex-col overflow-hidden rounded-2xl border border-border bg-card lg:min-h-[25rem] xl:h-full xl:min-h-0">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-4 py-4">
              <div>
                <p className="text-sm font-semibold text-foreground">
                  邮件内容
                </p>
                <p className="text-xs leading-5 text-muted-foreground">
                  右栏内联阅读正文；需要完整元数据时再打开独立详情页。
                </p>
              </div>
              {messageDetailHref ? (
                <ActionButton
                  asChild
                  density="dense"
                  icon={PanelRightOpen}
                  label="完整详情页"
                  priority="secondary"
                  size="sm"
                  tooltip="打开完整详情页"
                  variant="outline"
                >
                  <Link to={messageDetailHref}>完整详情页</Link>
                </ActionButton>
              ) : null}
            </div>

            <div className="py-3 xl:min-h-0 xl:flex-1">
              {isDesktopThreePane ? (
                <PaneScrollbar className="h-full" contentClassName="pb-2 pl-3">
                  {renderMessagePaneContent()}
                </PaneScrollbar>
              ) : (
                <div className="px-3">{renderMessagePaneContent()}</div>
              )}
            </div>
          </div>
        </section>
      </div>
    </div>
  );
};
