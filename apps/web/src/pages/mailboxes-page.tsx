import { PanelsTopLeft } from "lucide-react";
import type { ReactNode } from "react";
import { Link } from "react-router-dom";

import { MailboxCreateCard } from "@/components/mailboxes/mailbox-create-card";
import { MailboxList } from "@/components/mailboxes/mailbox-list";
import { MessageRefreshControl } from "@/components/messages/message-refresh-control";
import { EmptyState } from "@/components/shared/empty-state";
import {
  ErrorState,
  type ErrorStateVariant,
} from "@/components/shared/error-state";
import { PageHeader } from "@/components/shared/page-header";
import { ActionButton } from "@/components/ui/action-button";
import { Button } from "@/components/ui/button";
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
import { getErrorDetails } from "@/lib/error-utils";
import { useReadMessageIds } from "@/lib/message-read-state";
import { resolveLatestRefreshAt } from "@/lib/message-refresh";
import { appRoutes } from "@/lib/routes";

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
  createError?: {
    variant: ErrorStateVariant;
    title: string;
    description: string;
    details?: string | null;
  } | null;
  listError?: {
    variant: ErrorStateVariant;
    title: string;
    description: string;
    details?: string | null;
  } | null;
  mailboxes: Mailbox[];
  messageStatsByMailbox: Map<string, { unread: number; total: number }>;
  isCreatePending?: boolean;
  refreshAction?: ReactNode;
  onRetryCreate?: () => void;
  onRetryList?: () => void;
  onCreate: Parameters<typeof MailboxCreateCard>[0]["onSubmit"];
  onDestroy: (mailboxId: string) => void;
};

export const MailboxesPageView = ({
  meta,
  isMetaLoading = false,
  createError = null,
  listError = null,
  mailboxes,
  messageStatsByMailbox,
  isCreatePending = false,
  refreshAction,
  onRetryCreate,
  onRetryList,
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

    {createError ? (
      <Card>
        <CardHeader>
          <CardTitle>创建邮箱</CardTitle>
          <CardDescription>
            创建入口需要先读取运行时域名和 TTL 规则。
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ErrorState
            variant={createError.variant}
            title={createError.title}
            description={createError.description}
            details={createError.details}
            primaryAction={
              onRetryCreate ? (
                <Button onClick={onRetryCreate}>重新加载邮箱规则</Button>
              ) : undefined
            }
          />
        </CardContent>
      </Card>
    ) : meta ? (
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
        {listError ? (
          <ErrorState
            variant={listError.variant}
            title={listError.title}
            description={listError.description}
            details={listError.details}
            primaryAction={
              onRetryList ? (
                <Button onClick={onRetryList}>重新加载邮箱列表</Button>
              ) : undefined
            }
            secondaryAction={
              <Button asChild variant="outline">
                <Link to={appRoutes.workspace}>打开邮件工作台</Link>
              </Button>
            }
          />
        ) : mailboxes.length > 0 ? (
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
  const hasMetaData = metaQuery.data !== undefined;
  const hasMailboxesData = mailboxesQuery.data !== undefined;

  return (
    <MailboxesPageView
      meta={metaQuery.data ?? null}
      isMetaLoading={metaQuery.isLoading}
      createError={
        metaQuery.error && !hasMetaData
          ? {
              variant: "recoverable",
              title: "邮箱规则暂时加载失败",
              description:
                "域名与 TTL 元数据还没拿到，所以创建入口不会被误渲染成空表单。先重新加载一次，再继续创建邮箱。",
              details: getErrorDetails(metaQuery.error),
            }
          : null
      }
      listError={
        mailboxesQuery.error && !hasMailboxesData
          ? {
              variant: "recoverable",
              title: "邮箱列表加载失败",
              description:
                "当前邮箱存续数据不可用，所以控制台不会把它误判成“暂无邮箱”。你可以重新刷新，或先回到工作台处理其他操作。",
              details: getErrorDetails(mailboxesQuery.error),
            }
          : null
      }
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
      onRetryCreate={() => {
        void metaQuery.refetch();
      }}
      onRetryList={() => {
        void manualRefresh.refresh();
      }}
      onCreate={async (values) => {
        await createMailboxMutation.mutateAsync(values);
      }}
      onDestroy={(mailboxId) => destroyMailboxMutation.mutate(mailboxId)}
    />
  );
};
