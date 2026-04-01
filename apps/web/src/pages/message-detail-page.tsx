import { Link, useParams } from "react-router-dom";

import { MessageDetailCard } from "@/components/messages/message-detail-card";
import { PageHeader } from "@/components/shared/page-header";
import { Button } from "@/components/ui/button";
import { useMessageDetailQuery } from "@/hooks/use-messages";
import { apiClient } from "@/lib/api";

export const MessageDetailPage = () => {
  const { messageId = "" } = useParams();
  const messageQuery = useMessageDetailQuery(messageId);

  if (!messageQuery.data) {
    return <div className="text-muted-foreground">加载邮件详情中…</div>;
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title={messageQuery.data.subject}
        description="V1 详情解析包含 headers、text/html、收件人和附件清单。"
        eyebrow="Message Detail"
        action={
          <Button asChild variant="outline">
            <Link to={`/mailboxes/${messageQuery.data.mailboxId}`}>
              回到邮箱
            </Link>
          </Button>
        }
      />
      <MessageDetailCard
        message={messageQuery.data}
        rawUrl={apiClient.getRawMessageUrl(messageQuery.data.id)}
      />
    </div>
  );
};
