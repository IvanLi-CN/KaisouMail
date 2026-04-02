import { PanelsTopLeft } from "lucide-react";
import { Link } from "react-router-dom";

import { MailboxList } from "@/components/mailboxes/mailbox-list";
import { EmptyState } from "@/components/shared/empty-state";
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
  useMailboxesQuery,
} from "@/hooks/use-mailboxes";
import { useMessagesQuery } from "@/hooks/use-messages";
import { useReadMessageIds } from "@/lib/message-read-state";

const buildMailboxMessageStats = (
  mailboxIds: string[],
  messages: Array<{ id: string; mailboxId: string }>,
  readMessageIds: string[],
) => {
  const readSet = new Set(readMessageIds);
  const stats = new Map(
    mailboxIds.map((mailboxId) => [mailboxId, { unread: 0, total: 0 }]),
  );

  for (const message of messages) {
    const entry = stats.get(message.mailboxId) ?? { unread: 0, total: 0 };

    entry.total += 1;

    if (!readSet.has(message.id)) {
      entry.unread += 1;
    }

    stats.set(message.mailboxId, entry);
  }

  return stats;
};

export const MailboxesPage = () => {
  const mailboxesQuery = useMailboxesQuery();
  const messagesQuery = useMessagesQuery();
  const destroyMailboxMutation = useDestroyMailboxMutation();
  const readMessageIds = useReadMessageIds();
  const mailboxMessageStats = buildMailboxMessageStats(
    (mailboxesQuery.data ?? []).map((mailbox) => mailbox.id),
    messagesQuery.data ?? [],
    readMessageIds,
  );

  return (
    <div className="space-y-6">
      <PageHeader
        title="邮箱控制台"
        description="这里仅保留邮箱地址管理。查看邮件、正文和附件统一跳转到邮件工作台。"
        eyebrow="Mailboxes"
        action={
          <ActionButton
            asChild
            density="default"
            icon={PanelsTopLeft}
            label="打开邮件工作台"
            priority="secondary"
            variant="outline"
          >
            <Link to="/workspace">打开邮件工作台</Link>
          </ActionButton>
        }
      />
      <Card>
        <CardHeader>
          <CardTitle>邮箱列表</CardTitle>
          <CardDescription>
            这里只做邮箱存续管理；点开任一地址后会直接进入工作台查看该邮箱的邮件上下文。
          </CardDescription>
        </CardHeader>
        <CardContent>
          {mailboxesQuery.data && mailboxesQuery.data.length > 0 ? (
            <MailboxList
              mailboxes={mailboxesQuery.data}
              messageStatsByMailbox={mailboxMessageStats}
              onDestroy={(mailboxId) =>
                destroyMailboxMutation.mutate(mailboxId)
              }
            />
          ) : (
            <EmptyState
              title="暂无邮箱"
              description="当前还没有可管理的邮箱地址。"
            />
          )}
        </CardContent>
      </Card>
    </div>
  );
};
