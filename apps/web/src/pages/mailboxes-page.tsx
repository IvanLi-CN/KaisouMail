import { useMemo } from "react";

import { MailboxCreateCard } from "@/components/mailboxes/mailbox-create-card";
import { MailboxList } from "@/components/mailboxes/mailbox-list";
import { MessageList } from "@/components/messages/message-list";
import { EmptyState } from "@/components/shared/empty-state";
import { PageHeader } from "@/components/shared/page-header";
import { StatGrid } from "@/components/shared/stat-grid";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  useCreateMailboxMutation,
  useDestroyMailboxMutation,
  useMailboxesQuery,
} from "@/hooks/use-mailboxes";
import { useMessagesQuery } from "@/hooks/use-messages";

export const MailboxesPage = () => {
  const mailboxesQuery = useMailboxesQuery();
  const messagesQuery = useMessagesQuery();
  const createMailboxMutation = useCreateMailboxMutation();
  const destroyMailboxMutation = useDestroyMailboxMutation();

  const stats = useMemo(() => {
    const mailboxes = mailboxesQuery.data ?? [];
    const active = mailboxes.filter(
      (mailbox) => mailbox.status === "active",
    ).length;
    const destroyed = mailboxes.filter(
      (mailbox) => mailbox.status === "destroyed",
    ).length;
    return [
      { label: "活跃邮箱", value: String(active), hint: "当前仍可收信" },
      { label: "历史销毁", value: String(destroyed), hint: "已清理完成" },
      {
        label: "收件数",
        value: String(messagesQuery.data?.length ?? 0),
        hint: "列表支持多邮箱筛选",
      },
    ];
  }, [mailboxesQuery.data, messagesQuery.data]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="邮箱控制台"
        description="创建随机或指定邮箱、查看最近收件，并且按 TTL 自动回收所有邮件数据。"
        eyebrow="Mailboxes"
      />
      <StatGrid stats={stats} />
      <div className="grid gap-6 xl:grid-cols-[0.9fr_1.1fr]">
        <MailboxCreateCard
          onSubmit={async (values) => {
            await createMailboxMutation.mutateAsync(values);
          }}
          isPending={createMailboxMutation.isPending}
        />
        <Card>
          <CardHeader>
            <CardTitle>最近收件</CardTitle>
            <CardDescription>
              支持跳转到详情查看 HTML、纯文本、附件清单与 raw eml。
            </CardDescription>
          </CardHeader>
          <CardContent>
            {messagesQuery.data && messagesQuery.data.length > 0 ? (
              <MessageList messages={messagesQuery.data.slice(0, 5)} />
            ) : (
              <EmptyState
                title="还没有邮件"
                description="先创建一个邮箱，再把邮件投过来看看效果。"
              />
            )}
          </CardContent>
        </Card>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>邮箱列表</CardTitle>
          <CardDescription>
            销毁邮箱时会同步清理 Cloudflare 规则、消息索引和 R2 对象。
          </CardDescription>
        </CardHeader>
        <CardContent>
          {mailboxesQuery.data && mailboxesQuery.data.length > 0 ? (
            <MailboxList
              mailboxes={mailboxesQuery.data}
              onDestroy={(mailboxId) =>
                destroyMailboxMutation.mutate(mailboxId)
              }
            />
          ) : (
            <EmptyState
              title="暂无邮箱"
              description="点击左侧卡片创建第一个临时邮箱。"
            />
          )}
        </CardContent>
      </Card>
    </div>
  );
};
