import { PanelsTopLeft, Trash2, Undo2 } from "lucide-react";
import { Link, useLocation, useParams } from "react-router-dom";

import { MailboxList } from "@/components/mailboxes/mailbox-list";
import { PageHeader } from "@/components/shared/page-header";
import { ActionButton } from "@/components/ui/action-button";
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
import { useReadMessageIds } from "@/lib/message-read-state";
import { buildWorkspaceSearch, isMailboxSortMode } from "@/lib/workspace";

export const MailboxDetailPage = () => {
  const { mailboxId = "" } = useParams();
  const location = useLocation();
  const workspaceParams = new URLSearchParams(location.search);
  const sortParam = workspaceParams.get("sort");
  const workspaceSort = isMailboxSortMode(sortParam) ? sortParam : null;
  const mailboxQuery = useMailboxDetailQuery(mailboxId);
  const messagesQuery = useMessagesQuery();
  const destroyMailboxMutation = useDestroyMailboxMutation();
  const readMessageIds = useReadMessageIds();

  if (!mailboxQuery.data) {
    return <div className="text-muted-foreground">加载邮箱中…</div>;
  }

  const total = (messagesQuery.data ?? []).filter(
    (message) => message.mailboxId === mailboxId,
  );
  const readSet = new Set(readMessageIds);
  const messageStatsByMailbox = new Map([
    [
      mailboxId,
      {
        unread: total.filter((message) => !readSet.has(message.id)).length,
        total: total.length,
      },
    ],
  ]);

  return (
    <div className="space-y-6">
      <PageHeader
        title={mailboxQuery.data.address}
        description="这是兼容入口；邮件浏览和正文阅读统一在工作台完成。"
        eyebrow="Mailbox Detail"
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
                  mailbox: mailboxId,
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
              icon={Undo2}
              label="返回列表"
              priority="secondary"
              variant="outline"
            >
              <Link to="/mailboxes">返回列表</Link>
            </ActionButton>
            <ActionButton
              density="default"
              icon={Trash2}
              label="销毁邮箱"
              priority="primary"
              variant="destructive"
              onClick={() => destroyMailboxMutation.mutate(mailboxId)}
              disabled={mailboxQuery.data.status !== "active"}
            />
          </div>
        }
      />

      <Card>
        <CardHeader>
          <CardTitle>邮箱信息</CardTitle>
          <CardDescription>
            这里只保留地址与生命周期信息；查看邮件请使用工作台。
          </CardDescription>
        </CardHeader>
        <CardContent>
          <MailboxList
            mailboxes={[mailboxQuery.data]}
            messageStatsByMailbox={messageStatsByMailbox}
            itemHrefBuilder={() =>
              `/workspace${buildWorkspaceSearch({
                mailbox: mailboxId,
                sort: workspaceSort,
                q: workspaceParams.get("q"),
              })}`
            }
          />
        </CardContent>
      </Card>
    </div>
  );
};
