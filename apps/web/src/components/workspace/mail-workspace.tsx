import {
  ArrowDownUp,
  Inbox,
  ListTree,
  MailOpen,
  PanelRightOpen,
  Plus,
  Search,
} from "lucide-react";
import type { ReactNode } from "react";
import { Link } from "react-router-dom";

import { MailboxCreateForm } from "@/components/mailboxes/mailbox-create-form";
import { MessageReaderPane } from "@/components/messages/message-reader-pane";
import { EmptyState } from "@/components/shared/empty-state";
import { PageHeader } from "@/components/shared/page-header";
import { ActionButton } from "@/components/ui/action-button";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Popover,
  PopoverAnchor,
  PopoverContent,
} from "@/components/ui/popover";
import type { Mailbox, MessageDetail, MessageSummary } from "@/lib/contracts";
import { formatDateTime } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { MailboxSortMode } from "@/lib/workspace";

const sortOptions: Array<{ label: string; value: MailboxSortMode }> = [
  { label: "最近收信", value: "recent" },
  { label: "创建时间", value: "created" },
];

type MailWorkspaceProps = {
  createMailboxAction: {
    defaultTtlMinutes: number;
    domains: string[];
    error: string | null;
    isMetaLoading: boolean;
    isOpen: boolean;
    isPending: boolean;
    maxTtlMinutes: number;
    metaError: string | null;
    onCancel: () => void;
    onOpen: () => void;
    onSubmit: (values: {
      localPart?: string;
      subdomain?: string;
      rootDomain?: string;
      expiresInMinutes: number;
    }) => Promise<void> | void;
  };
  highlightedMailboxId?: string | null;
  visibleMailboxes: Mailbox[];
  totalMailboxCount: number;
  totalMessageCount: number;
  totalAggregatedMessageCount: number;
  mailboxMessageCounts: Map<string, number>;
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
  onSelectMailbox: (mailboxId: string) => void;
  onSelectMessage: (messageId: string) => void;
};

export const MailWorkspace = ({
  createMailboxAction,
  highlightedMailboxId = null,
  visibleMailboxes,
  totalMailboxCount,
  totalMessageCount,
  totalAggregatedMessageCount,
  mailboxMessageCounts,
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
  onSelectMailbox,
  onSelectMessage,
}: MailWorkspaceProps) => {
  const selectedMessageSummary =
    messages.find((message) => message.id === selectedMessageId) ?? null;

  return (
    <div className="space-y-6">
      <PageHeader
        title="邮件工作台"
        description="在一个三栏视图里完成邮箱筛选、聚合收件浏览和正文阅读。默认先看全部邮箱，再按需要钻取到单邮箱上下文。"
        eyebrow="Workspace"
        action={
          <div className="flex flex-wrap items-center gap-2">
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
                  <div className="space-y-1">
                    <p className="text-sm font-semibold text-foreground">
                      新建邮箱
                    </p>
                    <p className="text-xs leading-5 text-muted-foreground">
                      在当前工作台里直接创建新地址。支持随机或指定用户名 /
                      子域，创建成功后会自动切到新邮箱上下文。
                    </p>
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
                    submitError={createMailboxAction.error}
                    onCancel={createMailboxAction.onCancel}
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

      <div className="grid gap-4 xl:grid-cols-[320px_minmax(360px,0.9fr)_minmax(0,1.2fr)] 2xl:grid-cols-[340px_minmax(380px,0.9fr)_minmax(0,1.25fr)]">
        <section aria-label="邮箱列表" className="min-w-0">
          <div className="flex min-h-[72vh] flex-col overflow-hidden rounded-2xl border border-border bg-card">
            <div className="space-y-4 border-b border-border px-4 py-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-foreground">
                    邮箱列表
                  </p>
                  <p className="text-xs leading-5 text-muted-foreground">
                    {totalMailboxCount} 个邮箱 · {totalMessageCount} 封邮件
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

            <div className="flex-1 overflow-y-auto px-3 py-3">
              <div className="space-y-2">
                <button
                  type="button"
                  className={cn(
                    "flex w-full cursor-pointer flex-col gap-2 rounded-xl border px-3 py-3 text-left transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                    selectedMailboxId === "all"
                      ? "border-primary/40 bg-primary/10"
                      : "border-border bg-muted/10 hover:bg-white/5",
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
                    聚合显示所有邮箱的最新邮件，适合日常巡检与快速切换。
                  </p>
                </button>

                {isMailboxesLoading ? (
                  <div className="rounded-xl border border-border bg-muted/10 px-3 py-6 text-center text-sm text-muted-foreground">
                    正在加载邮箱列表…
                  </div>
                ) : visibleMailboxes.length > 0 ? (
                  visibleMailboxes.map((mailbox) => {
                    const isActive = selectedMailboxId === mailbox.id;
                    const isDestroyed = mailbox.status === "destroyed";
                    const isHighlighted = highlightedMailboxId === mailbox.id;
                    const messageCount =
                      mailboxMessageCounts.get(mailbox.id) ?? 0;
                    return (
                      <button
                        key={mailbox.id}
                        type="button"
                        disabled={isDestroyed}
                        className={cn(
                          "flex w-full rounded-xl border px-3 py-3 text-left transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                          isDestroyed
                            ? "cursor-not-allowed items-center gap-3 border-border/80 bg-muted/5 text-muted-foreground opacity-55"
                            : "cursor-pointer flex-col gap-3",
                          !isDestroyed && isActive
                            ? "border-primary/40 bg-primary/10"
                            : null,
                          !isDestroyed && !isActive
                            ? "border-border bg-muted/10 hover:bg-white/5"
                            : null,
                          !isDestroyed && isHighlighted
                            ? "border-primary/70 bg-primary/18 ring-1 ring-primary/35 shadow-[0_0_0_1px_rgba(148,163,184,0.14)_inset]"
                            : null,
                        )}
                        onClick={() => onSelectMailbox(mailbox.id)}
                      >
                        <div className="flex w-full items-center justify-between gap-3">
                          <div className="flex min-w-0 items-center gap-2">
                            <p
                              className={cn(
                                "min-w-0 text-sm font-medium",
                                isDestroyed
                                  ? "truncate text-muted-foreground"
                                  : "break-all text-foreground",
                              )}
                            >
                              {mailbox.address}
                            </p>
                            {isHighlighted ? (
                              <Badge className="border-primary/40 bg-primary/20 text-primary">
                                新建
                              </Badge>
                            ) : null}
                          </div>
                          <Badge
                            className={cn(
                              "min-w-7 justify-center px-2",
                              isDestroyed || messageCount === 0
                                ? "border-border bg-muted/20 text-muted-foreground"
                                : "border-primary/30 bg-primary/15 text-primary",
                            )}
                          >
                            {messageCount}
                          </Badge>
                        </div>
                      </button>
                    );
                  })
                ) : (
                  <EmptyState
                    title="没有匹配邮箱"
                    description="试试清空搜索词，或者直接在这里新建一个地址。"
                    action={
                      <Button
                        variant="outline"
                        onClick={createMailboxAction.onOpen}
                      >
                        新建邮箱
                      </Button>
                    }
                  />
                )}
              </div>
            </div>
          </div>
        </section>

        <section aria-label="邮件列表" className="min-w-0">
          <div className="flex min-h-[72vh] flex-col overflow-hidden rounded-2xl border border-border bg-card">
            <div className="space-y-2 border-b border-border px-4 py-4">
              <p className="text-sm font-semibold text-foreground">
                {selectedMailbox
                  ? `${selectedMailbox.address} 的邮件`
                  : "全部邮箱邮件"}
              </p>
              <p className="text-xs leading-5 text-muted-foreground">
                {selectedMailbox
                  ? "切换左栏地址后，中栏会自动聚合该邮箱的邮件流。"
                  : "默认聚合所有邮箱的收件流，方便按主题与发件人快速巡检。"}
              </p>
            </div>

            <div className="flex-1 overflow-y-auto px-3 py-3">
              {isMessagesLoading ? (
                <div className="rounded-xl border border-border bg-muted/10 px-3 py-6 text-center text-sm text-muted-foreground">
                  正在加载邮件列表…
                </div>
              ) : messages.length > 0 ? (
                <div className="space-y-2">
                  {messages.map((message) => {
                    const active = message.id === selectedMessageId;
                    return (
                      <button
                        key={message.id}
                        type="button"
                        className={cn(
                          "flex w-full cursor-pointer flex-col gap-3 rounded-xl border px-3 py-3 text-left transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                          active
                            ? "border-primary/40 bg-primary/10"
                            : "border-border bg-muted/10 hover:bg-white/5",
                        )}
                        onClick={() => onSelectMessage(message.id)}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="space-y-1">
                            <p className="text-sm font-medium text-foreground">
                              {message.subject}
                            </p>
                            <p className="line-clamp-2 text-xs leading-5 text-muted-foreground">
                              {message.previewText}
                            </p>
                          </div>
                          <MailOpen
                            className={cn(
                              "mt-1 h-4 w-4 shrink-0",
                              active ? "text-primary" : "text-muted-foreground",
                            )}
                          />
                        </div>
                        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
                          <span>{message.fromAddress ?? "Unknown"}</span>
                          <span>{formatDateTime(message.receivedAt)}</span>
                          <span>{message.mailboxAddress}</span>
                        </div>
                      </button>
                    );
                  })}
                </div>
              ) : (
                <EmptyState
                  title="当前范围内还没有邮件"
                  description="可以先创建邮箱并发送测试邮件，或者切回全部邮箱视图查看聚合列表。"
                />
              )}
            </div>
          </div>
        </section>

        <section aria-label="邮件内容" className="min-w-0">
          <div className="flex min-h-[72vh] flex-col overflow-hidden rounded-2xl border border-border bg-card">
            <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-4">
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

            <div className="flex-1 overflow-y-auto p-3">
              {isMessageLoading && selectedMessageSummary ? (
                <div className="rounded-xl border border-border bg-muted/10 px-3 py-6 text-center text-sm text-muted-foreground">
                  正在加载《{selectedMessageSummary.subject}》的正文…
                </div>
              ) : selectedMessage ? (
                <MessageReaderPane
                  message={selectedMessage}
                  rawUrl={selectedMessage.rawDownloadPath}
                />
              ) : (
                <EmptyState
                  title="还没有选中邮件"
                  description="从中栏点一封邮件，右边就会直接展开正文与附件信息。"
                />
              )}
            </div>
          </div>
        </section>
      </div>
    </div>
  );
};
