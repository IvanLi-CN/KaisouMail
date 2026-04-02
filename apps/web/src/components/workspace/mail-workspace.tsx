import {
  ArrowDownUp,
  Inbox,
  ListTree,
  MailOpen,
  PanelRightOpen,
  Search,
} from "lucide-react";
import { Link } from "react-router-dom";

import { MessageReaderPane } from "@/components/messages/message-reader-pane";
import { EmptyState } from "@/components/shared/empty-state";
import { PageHeader } from "@/components/shared/page-header";
import { ActionButton } from "@/components/ui/action-button";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { Mailbox, MessageDetail, MessageSummary } from "@/lib/contracts";
import { formatDateTime } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { MailboxSortMode } from "@/lib/workspace";

const sortOptions: Array<{ label: string; value: MailboxSortMode }> = [
  { label: "最近收信", value: "recent" },
  { label: "创建时间", value: "created" },
];

type MailWorkspaceProps = {
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
          <ActionButton
            asChild
            density="dense"
            icon={ListTree}
            label="打开邮箱管理"
            priority="secondary"
            tooltip="打开邮箱管理"
            variant="outline"
          >
            <Link to={mailboxManagementHref}>打开邮箱管理</Link>
          </ActionButton>
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
                        )}
                        onClick={() => onSelectMailbox(mailbox.id)}
                      >
                        <div className="flex w-full items-center justify-between gap-3">
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
                    description="试试清空搜索词，或者到邮箱管理页新建一个地址。"
                    action={
                      <Button asChild variant="outline">
                        <Link to={mailboxManagementHref}>去创建邮箱</Link>
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
