import { Link, useParams } from "react-router-dom";

import { MailboxList } from "@/components/mailboxes/mailbox-list";
import { MessageList } from "@/components/messages/message-list";
import { EmptyState } from "@/components/shared/empty-state";
import { PageHeader } from "@/components/shared/page-header";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  useDestroyMailboxMutation,
  useMailboxDetailQuery,
} from "@/hooks/use-mailboxes";
import { useMessagesQuery } from "@/hooks/use-messages";

export const MailboxDetailPage = () => {
  const { mailboxId = "" } = useParams();
  const mailboxQuery = useMailboxDetailQuery(mailboxId);
  const destroyMailboxMutation = useDestroyMailboxMutation();
  const messagesQuery = useMessagesQuery(
    mailboxQuery.data?.address ? [mailboxQuery.data.address] : [],
  );

  if (!mailboxQuery.data) {
    return <div className="text-muted-foreground">加载邮箱中…</div>;
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title={mailboxQuery.data.address}
        description="单邮箱视图会自动按该地址过滤消息列表。"
        eyebrow="Mailbox Detail"
        action={
          <div className="flex gap-2">
            <Button asChild variant="outline">
              <Link to="/mailboxes">返回列表</Link>
            </Button>
            <Button
              variant="destructive"
              onClick={() => destroyMailboxMutation.mutate(mailboxId)}
              disabled={mailboxQuery.data.status !== "active"}
            >
              销毁邮箱
            </Button>
          </div>
        }
      />

      <Card>
        <CardHeader>
          <CardTitle>邮箱信息</CardTitle>
          <CardDescription>
            这里展示当前邮箱本身的生命周期与 Cloudflare 规则 ID。
          </CardDescription>
        </CardHeader>
        <CardContent>
          <MailboxList mailboxes={[mailboxQuery.data]} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>该邮箱的邮件</CardTitle>
          <CardDescription>列表已经按当前邮箱地址过滤。</CardDescription>
        </CardHeader>
        <CardContent>
          {messagesQuery.data && messagesQuery.data.length > 0 ? (
            <MessageList messages={messagesQuery.data} />
          ) : (
            <EmptyState
              title="这个邮箱还没有邮件"
              description="你可以把它提供给测试或自动化流程。"
            />
          )}
        </CardContent>
      </Card>
    </div>
  );
};
