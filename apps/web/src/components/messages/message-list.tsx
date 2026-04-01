import { Link } from "react-router-dom";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeaderCell,
  TableRow,
} from "@/components/ui/table";
import type { MessageSummary } from "@/lib/contracts";
import { formatBytes, formatDateTime } from "@/lib/format";

export const MessageList = ({ messages }: { messages: MessageSummary[] }) => (
  <Table>
    <TableHead>
      <TableRow>
        <TableHeaderCell>主题</TableHeaderCell>
        <TableHeaderCell>发件人</TableHeaderCell>
        <TableHeaderCell>邮箱</TableHeaderCell>
        <TableHeaderCell>大小</TableHeaderCell>
        <TableHeaderCell>时间</TableHeaderCell>
      </TableRow>
    </TableHead>
    <TableBody>
      {messages.map((message) => (
        <TableRow key={message.id}>
          <TableCell>
            <div className="space-y-1">
              <Link
                className="font-medium text-foreground hover:text-primary"
                to={`/messages/${message.id}`}
              >
                {message.subject}
              </Link>
              <p className="max-w-md text-xs text-muted-foreground">
                {message.previewText}
              </p>
            </div>
          </TableCell>
          <TableCell>
            <div>
              <p>{message.fromName ?? message.fromAddress ?? "Unknown"}</p>
              <p className="text-xs text-muted-foreground">
                {message.fromAddress ?? "—"}
              </p>
            </div>
          </TableCell>
          <TableCell>
            <div className="space-y-1">
              <p>{message.mailboxAddress}</p>
              <div className="flex gap-2 text-xs">
                {message.hasHtml ? (
                  <Badge className="bg-primary/15 text-primary">HTML</Badge>
                ) : null}
                {message.attachmentCount > 0 ? (
                  <Badge>{message.attachmentCount} 附件</Badge>
                ) : null}
              </div>
            </div>
          </TableCell>
          <TableCell>{formatBytes(message.sizeBytes)}</TableCell>
          <TableCell>{formatDateTime(message.receivedAt)}</TableCell>
        </TableRow>
      ))}
    </TableBody>
  </Table>
);
