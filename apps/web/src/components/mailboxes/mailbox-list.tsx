import { Link } from "react-router-dom";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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

const statusClassMap: Record<Mailbox["status"], string> = {
  active: "bg-success/20 text-success-foreground",
  destroying: "bg-primary/15 text-primary",
  destroyed: "bg-secondary text-secondary-foreground",
};

export const MailboxList = ({
  mailboxes,
  onDestroy,
}: {
  mailboxes: Mailbox[];
  onDestroy?: (mailboxId: string) => void;
}) => (
  <Table>
    <TableHead>
      <TableRow>
        <TableHeaderCell>地址</TableHeaderCell>
        <TableHeaderCell>状态</TableHeaderCell>
        <TableHeaderCell>过期</TableHeaderCell>
        <TableHeaderCell>创建时间</TableHeaderCell>
        <TableHeaderCell className="text-right">操作</TableHeaderCell>
      </TableRow>
    </TableHead>
    <TableBody>
      {mailboxes.map((mailbox) => (
        <TableRow key={mailbox.id}>
          <TableCell>
            <div className="space-y-1">
              <Link
                className="font-medium text-foreground hover:text-primary"
                to={`/mailboxes/${mailbox.id}`}
              >
                {mailbox.address}
              </Link>
              <p className="text-xs text-muted-foreground">
                Rule: {mailbox.routingRuleId ?? "已清理"}
              </p>
            </div>
          </TableCell>
          <TableCell>
            <Badge className={statusClassMap[mailbox.status]}>
              {mailbox.status}
            </Badge>
          </TableCell>
          <TableCell>{formatRelativeMinutes(mailbox.expiresAt)}</TableCell>
          <TableCell>{formatDateTime(mailbox.createdAt)}</TableCell>
          <TableCell className="text-right">
            <div className="flex justify-end gap-2">
              <Button asChild size="sm" variant="outline">
                <Link to={`/mailboxes/${mailbox.id}`}>查看</Link>
              </Button>
              {onDestroy ? (
                <Button
                  size="sm"
                  variant="destructive"
                  onClick={() => onDestroy(mailbox.id)}
                  disabled={mailbox.status !== "active"}
                >
                  销毁
                </Button>
              ) : null}
            </div>
          </TableCell>
        </TableRow>
      ))}
    </TableBody>
  </Table>
);
