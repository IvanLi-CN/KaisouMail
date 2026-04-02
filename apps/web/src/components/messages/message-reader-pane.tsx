import { Download } from "lucide-react";
import { ActionButton } from "@/components/ui/action-button";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import type { MessageDetail } from "@/lib/contracts";
import { formatBytes, formatDateTime } from "@/lib/format";

const buildHtmlPreviewDocument = (html: string) => `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <style>
      :root {
        color-scheme: light;
      }

      html,
      body {
        margin: 0;
        min-height: 100%;
        background: #eef3f8;
        color: #0f172a;
      }

      body {
        padding: 24px;
        font-family:
          Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont,
          "Segoe UI", sans-serif;
      }

      img,
      video,
      iframe {
        max-width: 100%;
      }
    </style>
  </head>
  <body>${html}</body>
</html>`;

const MetaItem = ({ label, value }: { label: string; value: string }) => (
  <div className="space-y-1">
    <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
      {label}
    </p>
    <p className="text-sm text-foreground">{value}</p>
  </div>
);

export const MessageReaderPane = ({
  message,
  rawUrl,
}: {
  message: MessageDetail;
  rawUrl: string;
}) => (
  <Card className="h-full overflow-hidden p-0">
    <CardHeader className="border-b border-border px-5 py-5">
      <div className="flex flex-wrap items-center gap-2">
        <Badge className="border-primary/30 bg-primary/15 text-primary">
          {message.mailboxAddress}
        </Badge>
        {message.attachmentCount > 0 ? (
          <Badge>{message.attachmentCount} 个附件</Badge>
        ) : null}
      </div>
      <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
        <div className="space-y-2">
          <CardTitle className="text-xl break-words">
            {message.subject}
          </CardTitle>
          <CardDescription>{message.previewText}</CardDescription>
        </div>
        <ActionButton
          asChild
          density="dense"
          icon={Download}
          label="下载 Raw EML"
          priority="secondary"
          size="sm"
          tooltip="下载 Raw EML"
          variant="outline"
        >
          <a href={rawUrl} target="_blank" rel="noreferrer">
            下载 Raw EML
          </a>
        </ActionButton>
      </div>
    </CardHeader>

    <CardContent className="space-y-6 px-5 py-5">
      <div className="grid gap-4 rounded-xl border border-border bg-muted/25 p-4 md:grid-cols-2">
        <MetaItem
          label="From"
          value={message.fromName ?? message.fromAddress ?? "Unknown"}
        />
        <MetaItem label="Received" value={formatDateTime(message.receivedAt)} />
        <MetaItem label="Mailbox" value={message.mailboxAddress} />
        <MetaItem label="Size" value={formatBytes(message.sizeBytes)} />
      </div>

      {message.html ? (
        <div className="space-y-3">
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
            HTML 正文
          </p>
          <iframe
            className="h-[360px] w-full rounded-xl border border-border bg-[#eef3f8]"
            sandbox=""
            srcDoc={buildHtmlPreviewDocument(message.html)}
            title={`Workspace HTML preview for ${message.subject}`}
          />
        </div>
      ) : null}

      {message.text ? (
        <div className="space-y-3">
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
            纯文本正文
          </p>
          <pre className="overflow-auto rounded-xl border border-border bg-muted/25 p-4 text-sm whitespace-pre-wrap text-foreground">
            {message.text}
          </pre>
        </div>
      ) : null}

      <div className="space-y-3">
        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
          附件与收件信息
        </p>
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_220px]">
          <div className="space-y-2 rounded-xl border border-border bg-muted/25 p-4 text-sm">
            <p className="font-medium text-foreground">To</p>
            {message.recipients.to.length > 0 ? (
              message.recipients.to.map((recipient) => (
                <p
                  key={recipient.id}
                  className="break-all text-muted-foreground"
                >
                  {recipient.name ? `${recipient.name} ` : ""}
                  &lt;{recipient.address}&gt;
                </p>
              ))
            ) : (
              <p className="text-muted-foreground">—</p>
            )}
          </div>
          <div className="space-y-2 rounded-xl border border-border bg-muted/25 p-4 text-sm">
            <p className="font-medium text-foreground">Attachments</p>
            {message.attachments.length > 0 ? (
              message.attachments.map((attachment) => (
                <div key={attachment.id} className="space-y-1">
                  <p className="font-medium text-foreground">
                    {attachment.filename ?? "unnamed"}
                  </p>
                  <p className="text-muted-foreground">
                    {attachment.contentType} ·{" "}
                    {formatBytes(attachment.sizeBytes)}
                  </p>
                </div>
              ))
            ) : (
              <p className="text-muted-foreground">无附件</p>
            )}
          </div>
        </div>
      </div>
    </CardContent>
  </Card>
);
