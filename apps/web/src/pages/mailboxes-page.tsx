import { PanelsTopLeft } from "lucide-react";
import type { ReactNode } from "react";
import { Link } from "react-router-dom";

import { MailboxCreateCard } from "@/components/mailboxes/mailbox-create-card";
import { MailboxList } from "@/components/mailboxes/mailbox-list";
import { MessageRefreshControl } from "@/components/messages/message-refresh-control";
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
  mailboxKeys,
  useCreateMailboxMutation,
  useDestroyMailboxMutation,
  useMailboxesQuery,
} from "@/hooks/use-mailboxes";
import { messageKeys, useMessagesQuery } from "@/hooks/use-messages";
import { useMetaQuery } from "@/hooks/use-meta";
import { useQueryRefresh } from "@/hooks/use-query-refresh";
import type { ApiMeta, Mailbox } from "@/lib/contracts";
import { useReadMessageIds } from "@/lib/message-read-state";
import { resolveLatestRefreshAt } from "@/lib/message-refresh";

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

type MailboxesPageViewProps = {
  meta: ApiMeta | null;
  isMetaLoading?: boolean;
  mailboxes: Mailbox[];
  messageStatsByMailbox: Map<string, { unread: number; total: number }>;
  isCreatePending?: boolean;
  refreshAction?: ReactNode;
  onCreate: Parameters<typeof MailboxCreateCard>[0]["onSubmit"];
  onDestroy: (mailboxId: string) => void;
};

export const MailboxesPageView = ({
  meta,
  isMetaLoading = false,
  mailboxes,
  messageStatsByMailbox,
  isCreatePending = false,
  refreshAction,
  onCreate,
  onDestroy,
}: MailboxesPageViewProps) => (
  <div className="space-y-6">
    <PageHeader
      title="邮箱控制台"
      description="这里仅保留邮箱地址管理。查看邮件、正文和附件统一跳转到邮件工作台。"
      eyebrow="Mailboxes"
      action={
        <div className="flex flex-wrap items-center gap-2">
          {refreshAction}
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
        </div>
      }
    />

    {meta ? (
      <MailboxCreateCard
        domains={meta.domains}
        defaultTtlMinutes={meta.defaultMailboxTtlMinutes}
        maxTtlMinutes={meta.maxMailboxTtlMinutes}
        isMetaLoading={isMetaLoading}
        isPending={isCreatePending}
        onSubmit={onCreate}
      />
    ) : (
      <Card>
        <CardHeader>
          <CardTitle>创建邮箱</CardTitle>
          <CardDescription>
            创建入口需要先从 `/api/meta` 读取域名和 TTL 规则。
          </CardDescription>
        </CardHeader>
        <CardContent>
          <EmptyState
            title="正在加载邮箱规则"
            description="拿到当前环境的邮箱元数据后，才会显示创建表单。"
          />
        </CardContent>
      </Card>
    )}

    <Card>
      <CardHeader>
        <CardTitle>邮箱列表</CardTitle>
        <CardDescription>
          这里只做邮箱存续管理；点开任一地址后会直接进入工作台查看该邮箱的邮件上下文。
        </CardDescription>
      </CardHeader>
      <CardContent>
        {mailboxes.length > 0 ? (
          <MailboxList
            mailboxes={mailboxes}
            messageStatsByMailbox={messageStatsByMailbox}
            onDestroy={onDestroy}
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

export const MailboxesPage = () => {
  const metaQuery = useMetaQuery();
  const mailboxesQuery = useMailboxesQuery({
    pollingIntervalMs: 60_000,
  });
  const createMailboxMutation = useCreateMailboxMutation();
  const messagesQuery = useMessagesQuery([], undefined, {
    pollingIntervalMs: 60_000,
  });
  const destroyMailboxMutation = useDestroyMailboxMutation();
  const readMessageIds = useReadMessageIds();
  const manualRefresh = useQueryRefresh([
    { queryKey: mailboxKeys.all },
    { queryKey: messageKeys.all, exact: false },
  ]);
  const lastRefreshedAt = resolveLatestRefreshAt(
    mailboxesQuery.dataUpdatedAt,
    messagesQuery.dataUpdatedAt,
  );
  const isRefreshing =
    manualRefresh.isRefreshing ||
    mailboxesQuery.isFetching ||
    messagesQuery.isFetching;

  return (
    <MailboxesPageView
      meta={metaQuery.data ?? null}
      isMetaLoading={metaQuery.isLoading}
      mailboxes={mailboxesQuery.data ?? []}
      messageStatsByMailbox={buildMailboxMessageStats(
        (mailboxesQuery.data ?? []).map((mailbox) => mailbox.id),
        messagesQuery.data ?? [],
        readMessageIds,
      )}
      isCreatePending={createMailboxMutation.isPending}
      refreshAction={
        <MessageRefreshControl
          isRefreshing={isRefreshing}
          lastRefreshedAt={lastRefreshedAt}
          onRefresh={manualRefresh.refresh}
          density="default"
        />
      }
      onCreate={async (values) => {
        await createMailboxMutation.mutateAsync(values);
      }}
      onDestroy={(mailboxId) => destroyMailboxMutation.mutate(mailboxId)}
    />
  );
};
