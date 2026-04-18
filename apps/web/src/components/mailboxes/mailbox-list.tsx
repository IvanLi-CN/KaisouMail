import { Eye, Trash2 } from "lucide-react";
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
import { cn } from "@/lib/utils";
import { buildWorkspaceSearch } from "@/lib/workspace";

export const MailboxList = ({
  mailboxes,
  messageStatsByMailbox,
  onDestroy,
  itemHrefBuilder,
  selectedMailboxId = null,
  highlightedMailboxId = null,
  rowPopover = null,
  rowRefBuilder,
}: {
  mailboxes: Mailbox[];
  messageStatsByMailbox?: Map<string, { unread: number; total: number }>;
  onDestroy?: (mailboxId: string) => void;
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
        const isDestroyed = mailbox.status === "destroyed";
        const isSelected = selectedMailboxId === mailbox.id;
        const isHighlighted = highlightedMailboxId === mailbox.id;
        const isPopoverOpen = rowPopover?.mailboxId === mailbox.id;

        return (
          <TableRow
            key={mailbox.id}
            ref={rowRefBuilder ? rowRefBuilder(mailbox.id) : undefined}
            className={cn(
              isDestroyed ? "opacity-55" : undefined,
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
                    isDestroyed
                      ? "text-muted-foreground"
                      : "text-foreground hover:text-primary",
                  )}
                  to={
                    itemHrefBuilder
                      ? itemHrefBuilder(mailbox)
                      : `/workspace${buildWorkspaceSearch({
                          mailbox: mailbox.id,
                        })}`
                  }
                >
                  {mailbox.address}
                </Link>
                <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
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
                    Rule: {mailbox.routingRuleId ?? "已清理"}
                  </span>
                </div>
              </div>
            </TableCell>
            <TableCell className="align-middle">
              <span
                className={cn(
                  "inline-flex whitespace-nowrap font-mono text-sm",
                  isDestroyed ? "text-muted-foreground" : "text-foreground",
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
                  icon={Eye}
                  label="在工作台查看"
                  priority="secondary"
                  size="sm"
                  tooltip={`在工作台查看 ${mailbox.address}`}
                  variant="outline"
                >
                  <Link
                    to={
                      itemHrefBuilder
                        ? itemHrefBuilder(mailbox)
                        : `/workspace${buildWorkspaceSearch({
                            mailbox: mailbox.id,
                          })}`
                    }
                  >
                    在工作台查看
                  </Link>
                </ActionButton>
                {onDestroy ? (
                  <ActionButton
                    density="dense"
                    icon={Trash2}
                    label="销毁邮箱"
                    size="sm"
                    variant="destructive"
                    onClick={() => onDestroy(mailbox.id)}
                    disabled={mailbox.status === "destroyed"}
                    tooltip={`销毁 ${mailbox.address}`}
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
