import { Eye, History, RotateCcw, Trash2 } from "lucide-react";
import type { ReactNode } from "react";
import { Link } from "react-router-dom";

import { ActionButton } from "@/components/ui/action-button";
import { Badge } from "@/components/ui/badge";
import {
  Popover,
  PopoverAnchor,
  PopoverContent,
} from "@/components/ui/popover";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeaderCell,
  TableRow,
} from "@/components/ui/table";
import type { Mailbox } from "@/lib/contracts";
import { formatDateTime, formatMailboxExpiry } from "@/lib/format";
import { appRoutes } from "@/lib/routes";
import { cn } from "@/lib/utils";
import { buildWorkspaceSearch } from "@/lib/workspace";

const mailboxStatusView = {
  active: {
    label: "可用",
    className: "border-emerald-500/35 bg-emerald-500/12 text-emerald-100",
  },
  expired: {
    label: "已过期 · 回收站",
    className: "border-amber-500/35 bg-amber-500/12 text-amber-100",
  },
  destroying: {
    label: "销毁中",
    className: "border-sky-500/35 bg-sky-500/12 text-sky-100",
  },
  destroyed: {
    label: "已销毁",
    className: "border-border bg-muted/20 text-muted-foreground",
  },
} satisfies Record<Mailbox["status"], { label: string; className: string }>;

const formatMailboxRuleLabel = (mailbox: Mailbox) => {
  if (mailbox.source === "catch_all") return "Catch All";
  return mailbox.routingRuleId ?? "域名级接管";
};

export const MailboxList = ({
  mailboxes,
  messageStatsByMailbox,
  onDestroy,
  onRestoreTtl,
  itemHrefBuilder,
  selectedMailboxId = null,
  highlightedMailboxId = null,
  rowPopover = null,
  rowRefBuilder,
}: {
  mailboxes: Mailbox[];
  messageStatsByMailbox?: Map<string, { unread: number; total: number }>;
  onDestroy?: (mailboxId: string) => void;
  onRestoreTtl?: (mailbox: Mailbox) => void;
  itemHrefBuilder?: (mailbox: Mailbox) => string;
  selectedMailboxId?: string | null;
  highlightedMailboxId?: string | null;
  rowPopover?: {
    mailboxId: string;
    content: ReactNode;
  } | null;
  rowRefBuilder?: (
    mailboxId: string,
  ) => (node: HTMLTableRowElement | null) => void;
}) => (
  <Table>
    <TableHead>
      <TableRow>
        <TableHeaderCell>地址</TableHeaderCell>
        <TableHeaderCell>
          <span className="whitespace-nowrap">消息</span>
          <span className="block text-[10px] font-medium normal-case tracking-normal text-muted-foreground/80">
            未读 / 全部
          </span>
        </TableHeaderCell>
        <TableHeaderCell>最近收信</TableHeaderCell>
        <TableHeaderCell>过期</TableHeaderCell>
        <TableHeaderCell>创建时间</TableHeaderCell>
        <TableHeaderCell className="text-right">操作</TableHeaderCell>
      </TableRow>
    </TableHead>
    <TableBody>
      {mailboxes.map((mailbox) => {
        const isExpired = mailbox.status === "expired";
        const isDestroying = mailbox.status === "destroying";
        const isDestroyed = mailbox.status === "destroyed";
        const isInactive = isExpired || isDestroying || isDestroyed;
        const statusView = mailboxStatusView[mailbox.status];
        const workspaceHref = itemHrefBuilder
          ? itemHrefBuilder(mailbox)
          : `/workspace${buildWorkspaceSearch({
              mailbox: mailbox.id,
            })}`;
        const historyHref = appRoutes.mailboxDetail(mailbox.id);
        const primaryViewHref =
          isExpired || isDestroyed ? historyHref : workspaceHref;
        const isSelected = selectedMailboxId === mailbox.id;
        const isHighlighted = highlightedMailboxId === mailbox.id;
        const isPopoverOpen = rowPopover?.mailboxId === mailbox.id;

        return (
          <TableRow
            key={mailbox.id}
            ref={rowRefBuilder ? rowRefBuilder(mailbox.id) : undefined}
            className={cn(
              isDestroyed ? "opacity-55" : undefined,
              isExpired ? "bg-amber-500/[0.03]" : undefined,
              isDestroying ? "opacity-75" : undefined,
              isSelected
                ? "bg-primary/10 shadow-[inset_0_0_0_1px_rgba(111,168,255,0.3)]"
                : undefined,
              isHighlighted && !isSelected
                ? "bg-primary/5 shadow-[inset_0_0_0_1px_rgba(111,168,255,0.2)]"
                : undefined,
            )}
            data-active={isSelected ? "true" : undefined}
            data-highlighted={isHighlighted ? "true" : undefined}
          >
            <TableCell>
              <div className="space-y-1">
                <Link
                  className={cn(
                    "font-medium transition-colors",
                    isInactive
                      ? "text-muted-foreground hover:text-foreground"
                      : "text-foreground hover:text-primary",
                  )}
                  to={primaryViewHref}
                >
                  {mailbox.address}
                </Link>
                <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                  <Badge className={cn("border", statusView.className)}>
                    {statusView.label}
                  </Badge>
                  <Badge
                    className={cn(
                      "border",
                      mailbox.source === "catch_all"
                        ? "border-amber-500/35 bg-amber-500/12 text-amber-100"
                        : "border-border bg-muted/20 text-muted-foreground",
                    )}
                  >
                    {mailbox.source === "catch_all" ? "Catch All" : "预注册"}
                  </Badge>
                  <span className="font-mono">
                    Rule: {formatMailboxRuleLabel(mailbox)}
                  </span>
                </div>
              </div>
            </TableCell>
            <TableCell className="align-middle">
              <span
                className={cn(
                  "inline-flex whitespace-nowrap font-mono text-sm",
                  isInactive ? "text-muted-foreground" : "text-foreground",
                )}
              >
                {messageStatsByMailbox?.get(mailbox.id)?.unread ?? 0}
                <span className="px-1 text-muted-foreground">/</span>
                {messageStatsByMailbox?.get(mailbox.id)?.total ?? 0}
              </span>
            </TableCell>
            <TableCell>{formatDateTime(mailbox.lastReceivedAt)}</TableCell>
            <TableCell className="relative">
              {isPopoverOpen ? (
                <Popover open>
                  <PopoverAnchor asChild>
                    <span className="inline-flex min-h-6 items-center rounded-md px-0.5">
                      {mailbox.source === "catch_all"
                        ? "长期"
                        : isExpired
                          ? `回收站 · ${formatMailboxExpiry(mailbox.expiresAt)}`
                          : formatMailboxExpiry(mailbox.expiresAt)}
                    </span>
                  </PopoverAnchor>
                  <PopoverContent
                    align="center"
                    className="w-[min(calc(100vw-2rem),22rem)] space-y-4 px-4 py-4"
                    hideWhenDetached={false}
                    side="right"
                    sideOffset={8}
                  >
                    {rowPopover?.content}
                  </PopoverContent>
                </Popover>
              ) : (
                <span>
                  {mailbox.source === "catch_all"
                    ? "长期"
                    : isExpired
                      ? `回收站 · ${formatMailboxExpiry(mailbox.expiresAt)}`
                      : formatMailboxExpiry(mailbox.expiresAt)}
                </span>
              )}
            </TableCell>
            <TableCell>{formatDateTime(mailbox.createdAt)}</TableCell>
            <TableCell className="text-right">
              <div className="relative flex justify-end gap-2">
                <ActionButton
                  asChild
                  density="dense"
                  icon={isExpired || isDestroyed ? History : Eye}
                  label={isExpired || isDestroyed ? "查看历史" : "在工作台查看"}
                  priority="secondary"
                  size="sm"
                  tooltip={
                    isExpired || isDestroyed
                      ? `查看 ${mailbox.address} 的历史`
                      : `在工作台查看 ${mailbox.address}`
                  }
                  variant="outline"
                >
                  <Link to={primaryViewHref}>
                    {isExpired || isDestroyed ? "查看历史" : "在工作台查看"}
                  </Link>
                </ActionButton>
                {isExpired && onRestoreTtl ? (
                  <ActionButton
                    density="dense"
                    icon={RotateCcw}
                    label="延长 TTL"
                    size="sm"
                    variant="outline"
                    onClick={() => onRestoreTtl(mailbox)}
                    tooltip={`延长 ${mailbox.address} 的 TTL 并恢复使用`}
                  />
                ) : null}
                {onDestroy ? (
                  <ActionButton
                    density="dense"
                    icon={Trash2}
                    label={isExpired ? "立即销毁" : "销毁邮箱"}
                    size="sm"
                    variant="destructive"
                    onClick={() => onDestroy(mailbox.id)}
                    disabled={mailbox.status === "destroyed"}
                    tooltip={
                      isExpired
                        ? `立即销毁 ${mailbox.address}`
                        : `销毁 ${mailbox.address}`
                    }
                  />
                ) : null}
              </div>
            </TableCell>
          </TableRow>
        );
      })}
    </TableBody>
  </Table>
);
