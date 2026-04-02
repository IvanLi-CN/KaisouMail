import { ListTree, PanelsTopLeft } from "lucide-react";
import { useEffect } from "react";
import { Link, useLocation, useParams } from "react-router-dom";

import { MessageDetailCard } from "@/components/messages/message-detail-card";
import { PageHeader } from "@/components/shared/page-header";
import { ActionButton } from "@/components/ui/action-button";
import { useMessageDetailQuery } from "@/hooks/use-messages";
import { apiClient } from "@/lib/api";
import { markMessageAsRead } from "@/lib/message-read-state";
import { buildWorkspaceSearch, isMailboxSortMode } from "@/lib/workspace";

export const MessageDetailPage = () => {
  const { messageId = "" } = useParams();
  const location = useLocation();
  const workspaceParams = new URLSearchParams(location.search);
  const sortParam = workspaceParams.get("sort");
  const workspaceSort = isMailboxSortMode(sortParam) ? sortParam : null;
  const messageQuery = useMessageDetailQuery(messageId);

  useEffect(() => {
    markMessageAsRead(messageQuery.data?.id);
  }, [messageQuery.data?.id]);

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
          <div className="flex flex-wrap gap-2">
            <ActionButton
              asChild
              density="default"
              icon={PanelsTopLeft}
              label="在工作台打开"
              priority="secondary"
              variant="outline"
            >
              <Link
                to={`/workspace${buildWorkspaceSearch({
                  mailbox:
                    workspaceParams.get("mailbox") ??
                    messageQuery.data.mailboxId,
                  message: messageQuery.data.id,
                  sort: workspaceSort,
                  q: workspaceParams.get("q"),
                })}`}
              >
                在工作台打开
              </Link>
            </ActionButton>
            <ActionButton
              asChild
              density="default"
              icon={ListTree}
              label="回到邮箱管理"
              priority="secondary"
              variant="outline"
            >
              <Link to="/mailboxes">回到邮箱管理</Link>
            </ActionButton>
          </div>
        }
      />
      <MessageDetailCard
        message={messageQuery.data}
        rawUrl={apiClient.getRawMessageUrl(messageQuery.data.id)}
      />
    </div>
  );
};
