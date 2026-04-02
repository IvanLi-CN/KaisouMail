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

const RecipientList = ({
  title,
  items,
}: {
  title: string;
  items: MessageDetail["recipients"]["to"];
}) => (
  <div className="space-y-2">
    <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">
      {title}
    </p>
    {items.length > 0 ? (
      <div className="space-y-1 text-sm">
        {items.map((recipient) => (
          <p key={recipient.id}>
            {recipient.name ? `${recipient.name} ` : ""}&lt;{recipient.address}
            &gt;
          </p>
        ))}
      </div>
    ) : (
      <p className="text-sm text-muted-foreground">—</p>
    )}
  </div>
);

export const MessageDetailCard = ({
  message,
  rawUrl,
}: {
  message: MessageDetail;
  rawUrl: string;
}) => (
  <div className="grid gap-6 xl:grid-cols-[minmax(0,1.2fr)_360px]">
    <Card className="space-y-6">
      <CardHeader>
        <div className="flex flex-wrap items-center gap-2">
          <Badge className="border-primary/30 bg-primary/15 text-primary">
            {message.mailboxAddress}
          </Badge>
          {message.attachmentCount > 0 ? (
            <Badge>{message.attachmentCount} 个附件</Badge>
          ) : null}
        </div>
        <CardTitle className="text-2xl">{message.subject}</CardTitle>
        <CardDescription>{message.previewText}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="grid gap-4 rounded-xl border border-border bg-muted/30 p-4 md:grid-cols-2">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">
              From
            </p>
            <p className="mt-2 text-sm">
              {message.fromName ?? message.fromAddress ?? "Unknown"}
            </p>
            <p className="text-sm text-muted-foreground">
              {message.fromAddress ?? "—"}
            </p>
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">
              Received
            </p>
            <p className="mt-2 text-sm">{formatDateTime(message.receivedAt)}</p>
            <p className="text-sm text-muted-foreground">
              {formatBytes(message.sizeBytes)}
            </p>
          </div>
        </div>

        {message.html ? (
          <div className="space-y-3">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">
              HTML 正文
            </p>
            <iframe
              className="h-[420px] w-full rounded-xl border border-border bg-[#eef3f8]"
              sandbox=""
              srcDoc={buildHtmlPreviewDocument(message.html)}
              title={`HTML preview for ${message.subject}`}
            />
          </div>
        ) : null}

        {message.text ? (
          <div className="space-y-3">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">
              纯文本正文
            </p>
            <pre className="overflow-auto rounded-xl border border-border bg-muted/30 p-4 text-sm whitespace-pre-wrap text-foreground">
              {message.text}
            </pre>
          </div>
        ) : null}
      </CardContent>
    </Card>

    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>元数据</CardTitle>
          <CardDescription>收件人、头部和 raw 下载都在这边。</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <RecipientList title="To" items={message.recipients.to} />
          <RecipientList title="Cc" items={message.recipients.cc} />
          <RecipientList title="Reply-To" items={message.recipients.replyTo} />
          <div className="space-y-3">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">
              Headers
            </p>
            <div className="space-y-2 rounded-xl border border-border bg-muted/30 p-4 text-sm">
              {message.headers.map((header) => (
                <div
                  key={`${header.key}-${header.value}`}
                  className="grid gap-1 md:grid-cols-[120px_1fr]"
                >
                  <p className="font-medium text-foreground">{header.key}</p>
                  <p className="break-all text-muted-foreground">
                    {header.value}
                  </p>
                </div>
              ))}
            </div>
          </div>
          <div className="space-y-3">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">
              Attachments
            </p>
            <div className="space-y-2">
              {message.attachments.length > 0 ? (
                message.attachments.map((attachment) => (
                  <div
                    key={attachment.id}
                    className="rounded-lg border border-border bg-muted/30 p-4 text-sm"
                  >
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
                <p className="text-sm text-muted-foreground">无附件</p>
              )}
            </div>
          </div>
          <ActionButton
            asChild
            className="w-full"
            density="default"
            icon={Download}
            label="下载 Raw EML"
            priority="secondary"
            variant="outline"
          >
            <a href={rawUrl} target="_blank" rel="noreferrer">
              下载 Raw EML
            </a>
          </ActionButton>
        </CardContent>
      </Card>
    </div>
  </div>
);
