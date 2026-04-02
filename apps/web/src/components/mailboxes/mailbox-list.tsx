import { Eye, Trash2 } from "lucide-react";
import { Link } from "react-router-dom";

import { ActionButton } from "@/components/ui/action-button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeaderCell,
  TableRow,
} from "@/components/ui/table";
import type { Mailbox } from "@/lib/contracts";
import { formatDateTime, formatRelativeMinutes } from "@/lib/format";
import { cn } from "@/lib/utils";
import { buildWorkspaceSearch } from "@/lib/workspace";

export const MailboxList = ({
  mailboxes,
  messageStatsByMailbox,
  onDestroy,
  itemHrefBuilder,
}: {
  mailboxes: Mailbox[];
  messageStatsByMailbox?: Map<string, { unread: number; total: number }>;
  onDestroy?: (mailboxId: string) => void;
  itemHrefBuilder?: (mailbox: Mailbox) => string;
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
      {mailboxes.map((mailbox) => (
        <TableRow
          key={mailbox.id}
          className={mailbox.status === "destroyed" ? "opacity-55" : undefined}
        >
          <TableCell>
            <div className="space-y-1">
              <Link
                className={cn(
                  "font-medium transition-colors",
                  mailbox.status === "destroyed"
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
              <p className="font-mono text-xs text-muted-foreground">
                Rule: {mailbox.routingRuleId ?? "已清理"}
              </p>
            </div>
          </TableCell>
          <TableCell className="align-middle">
            <span
              className={cn(
                "inline-flex whitespace-nowrap font-mono text-sm",
                mailbox.status === "destroyed"
                  ? "text-muted-foreground"
                  : "text-foreground",
              )}
            >
              {messageStatsByMailbox?.get(mailbox.id)?.unread ?? 0}
              <span className="px-1 text-muted-foreground">/</span>
              {messageStatsByMailbox?.get(mailbox.id)?.total ?? 0}
            </span>
          </TableCell>
          <TableCell>{formatDateTime(mailbox.lastReceivedAt)}</TableCell>
          <TableCell>{formatRelativeMinutes(mailbox.expiresAt)}</TableCell>
          <TableCell>{formatDateTime(mailbox.createdAt)}</TableCell>
          <TableCell className="text-right">
            <div className="flex justify-end gap-2">
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
                  disabled={mailbox.status !== "active"}
                  tooltip={`销毁 ${mailbox.address}`}
                />
              ) : null}
            </div>
          </TableCell>
        </TableRow>
      ))}
    </TableBody>
  </Table>
);
