import { PanelsTopLeft, Trash2, Undo2 } from "lucide-react";
import { Link, useLocation, useParams } from "react-router-dom";
import { MailboxList } from "@/components/mailboxes/mailbox-list";
import { MessageRefreshControl } from "@/components/messages/message-refresh-control";
import {
  ErrorState,
  type ErrorStateVariant,
} from "@/components/shared/error-state";
import { DetailPageSkeleton } from "@/components/shared/loading-shells";
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
  useDestroyMailboxMutation,
  useMailboxDetailQuery,
} from "@/hooks/use-mailboxes";
import { messageKeys, useMessagesQuery } from "@/hooks/use-messages";
import { useQueryRefresh } from "@/hooks/use-query-refresh";
import type { Mailbox } from "@/lib/contracts";
import { getErrorDetails, isNotFoundError } from "@/lib/error-utils";
import { useReadMessageIds } from "@/lib/message-read-state";
import { resolveLatestRefreshAt } from "@/lib/message-refresh";
import { appRoutes } from "@/lib/routes";
import { buildWorkspaceSearch, isMailboxSortMode } from "@/lib/workspace";

type MailboxDetailPageViewProps = {
  mailbox: Mailbox | null;
  messageStatsByMailbox: Map<string, { unread: number; total: number }>;
  isLoading?: boolean;
  error?: {
    variant: ErrorStateVariant;
    title: string;
    description: string;
    details?: string | null;
  } | null;
  onRetry?: () => void;
  onDestroy: () => void;
  isRefreshing: boolean;
  lastRefreshedAt: number | null;
  workspaceHref: string;
};

export const MailboxDetailPageView = ({
  mailbox,
  messageStatsByMailbox,
  isLoading = false,
  error = null,
  onRetry,
  onDestroy,
  isRefreshing,
  lastRefreshedAt,
  workspaceHref,
}: MailboxDetailPageViewProps) => {
  if (isLoading) {
    return <DetailPageSkeleton testId="mailbox-detail-skeleton" />;
  }

  if (error) {
    return (
      <ErrorState
        variant={error.variant}
        title={error.title}
        description={error.description}
        details={error.details}
        primaryAction={
          onRetry ? (
            <Button onClick={onRetry}>重新加载邮箱详情</Button>
          ) : undefined
        }
        secondaryAction={
          <div className="flex flex-col gap-3 sm:flex-row">
            <Button asChild variant="outline">
              <Link to={appRoutes.mailboxes}>回到邮箱管理</Link>
            </Button>
            <Button asChild variant="ghost">
              <Link to={appRoutes.workspace}>打开工作台</Link>
            </Button>
          </div>
        }
      />
    );
  }

  if (!mailbox) {
    return null;
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title={mailbox.address}
        description="查看邮箱状态、有效期和未读情况。"
        eyebrow="Mailbox Detail"
        action={
          <div className="flex flex-wrap gap-2">
            <MessageRefreshControl
              density="default"
              isRefreshing={isRefreshing}
              lastRefreshedAt={lastRefreshedAt}
              onRefresh={onRetry ?? (() => undefined)}
            />
            <ActionButton
              asChild
              density="default"
              icon={PanelsTopLeft}
              label="在工作台打开"
              priority="secondary"
              variant="outline"
            >
              <Link to={workspaceHref}>在工作台打开</Link>
            </ActionButton>
            <ActionButton
              asChild
              density="default"
              icon={Undo2}
              label="返回列表"
              priority="secondary"
              variant="outline"
            >
              <Link to={appRoutes.mailboxes}>返回列表</Link>
            </ActionButton>
            <ActionButton
              density="default"
              icon={Trash2}
              label="销毁邮箱"
              priority="primary"
              variant="destructive"
              onClick={onDestroy}
              disabled={mailbox.status === "destroyed"}
            />
          </div>
        }
      />

      <Card>
        <CardHeader>
          <CardTitle>邮箱信息</CardTitle>
          <CardDescription>查看当前邮箱的地址和生命周期信息。</CardDescription>
        </CardHeader>
        <CardContent>
          <MailboxList
            mailboxes={[mailbox]}
            messageStatsByMailbox={messageStatsByMailbox}
            itemHrefBuilder={() => workspaceHref}
          />
        </CardContent>
      </Card>
    </div>
  );
};

export const MailboxDetailPage = () => {
  const { mailboxId = "" } = useParams();
  const location = useLocation();
  const workspaceParams = new URLSearchParams(location.search);
  const sortParam = workspaceParams.get("sort");
  const workspaceSort = isMailboxSortMode(sortParam) ? sortParam : null;
  const mailboxQuery = useMailboxDetailQuery(mailboxId, {
    pollingIntervalMs: 60_000,
  });
  const messagesQuery = useMessagesQuery([], undefined, {
    pollingIntervalMs: 60_000,
  });
  const destroyMailboxMutation = useDestroyMailboxMutation();
  const readMessageIds = useReadMessageIds();
  const manualRefresh = useQueryRefresh([
    { queryKey: mailboxKeys.detail(mailboxId) },
    { queryKey: messageKeys.all, exact: false },
  ]);
  const lastRefreshedAt = resolveLatestRefreshAt(
    mailboxQuery.dataUpdatedAt,
    messagesQuery.dataUpdatedAt,
  );
  const isRefreshing =
    manualRefresh.isRefreshing ||
    mailboxQuery.isFetching ||
    messagesQuery.isFetching;
  const hasMailboxDetail = mailboxQuery.data !== undefined;
  const error =
    mailboxQuery.error && !hasMailboxDetail
      ? isNotFoundError(mailboxQuery.error)
        ? {
            variant: "not-found" as const,
            title: "这个邮箱已经不可见了",
            description:
              "它可能已经被销毁、迁移，或者当前会话无权继续查看。你可以回到列表重新选择其他邮箱。",
            details: getErrorDetails(mailboxQuery.error),
          }
        : {
            variant: "recoverable" as const,
            title: "邮箱详情加载失败",
            description: "暂时无法加载邮箱状态与统计信息，请重试。",
            details: getErrorDetails(mailboxQuery.error),
          }
      : null;

  const workspaceHref = `/workspace${buildWorkspaceSearch({
    mailbox: mailboxId,
    sort: workspaceSort,
    q: workspaceParams.get("q"),
  })}`;
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
    <MailboxDetailPageView
      mailbox={mailboxQuery.data ?? null}
      messageStatsByMailbox={messageStatsByMailbox}
      isLoading={mailboxQuery.isLoading && !hasMailboxDetail}
      error={error}
      onRetry={manualRefresh.refresh}
      onDestroy={() => destroyMailboxMutation.mutate(mailboxId)}
      isRefreshing={isRefreshing}
      lastRefreshedAt={lastRefreshedAt}
      workspaceHref={workspaceHref}
    />
  );
};
