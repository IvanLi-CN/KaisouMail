import { ListTree, PanelsTopLeft, RefreshCw } from "lucide-react";
import { useEffect } from "react";
import { Link, useLocation, useParams } from "react-router-dom";
import { MessageDetailCard } from "@/components/messages/message-detail-card";
import { MessageRefreshControl } from "@/components/messages/message-refresh-control";
import {
  ErrorState,
  type ErrorStateVariant,
} from "@/components/shared/error-state";
import { PageHeader } from "@/components/shared/page-header";
import { ActionButton } from "@/components/ui/action-button";
import { Button } from "@/components/ui/button";
import { messageKeys, useMessageDetailQuery } from "@/hooks/use-messages";
import { useQueryRefresh } from "@/hooks/use-query-refresh";
import { apiClient } from "@/lib/api";
import { getErrorDetails, isNotFoundError } from "@/lib/error-utils";
import { markMessageAsRead } from "@/lib/message-read-state";
import { resolveLatestRefreshAt } from "@/lib/message-refresh";
import { appRoutes } from "@/lib/routes";
import { buildWorkspaceSearch, isMailboxSortMode } from "@/lib/workspace";

type MessageDetailPageViewProps = {
  message: ReturnType<typeof useMessageDetailQuery>["data"] | null;
  isLoading?: boolean;
  error?: {
    variant: ErrorStateVariant;
    title: string;
    description: string;
    details?: string | null;
  } | null;
  onRetry?: () => void;
  isRefreshing: boolean;
  lastRefreshedAt: number | null;
  mailboxHref: string;
  workspaceHref: string;
};

export const MessageDetailPageView = ({
  message,
  isLoading = false,
  error = null,
  onRetry,
  isRefreshing,
  lastRefreshedAt,
  mailboxHref,
  workspaceHref,
}: MessageDetailPageViewProps) => {
  if (isLoading) {
    return <div className="text-muted-foreground">加载邮件详情中…</div>;
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
            <Button onClick={onRetry}>
              <RefreshCw className="mr-2 h-4 w-4" />
              重新加载邮件详情
            </Button>
          ) : undefined
        }
        secondaryAction={
          <div className="flex flex-col gap-3 sm:flex-row">
            <Button asChild variant="outline">
              <Link to={workspaceHref}>在工作台打开</Link>
            </Button>
            <Button asChild variant="ghost">
              <Link to={mailboxHref}>回到邮箱管理</Link>
            </Button>
          </div>
        }
      />
    );
  }

  if (!message) {
    return null;
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title={message.subject}
        description="V1 详情解析包含 headers、text/html、收件人和附件清单。"
        eyebrow="Message Detail"
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
              icon={ListTree}
              label="回到邮箱管理"
              priority="secondary"
              variant="outline"
            >
              <Link to={mailboxHref}>回到邮箱管理</Link>
            </ActionButton>
          </div>
        }
      />
      <MessageDetailCard
        message={message}
        rawUrl={apiClient.getRawMessageUrl(message.id)}
      />
    </div>
  );
};

export const MessageDetailPage = () => {
  const { messageId = "" } = useParams();
  const location = useLocation();
  const workspaceParams = new URLSearchParams(location.search);
  const sortParam = workspaceParams.get("sort");
  const workspaceSort = isMailboxSortMode(sortParam) ? sortParam : null;
  const messageQuery = useMessageDetailQuery(messageId);
  const manualRefresh = useQueryRefresh([
    { queryKey: messageKeys.detail(messageId) },
  ]);
  const lastRefreshedAt = resolveLatestRefreshAt(messageQuery.dataUpdatedAt);
  const isRefreshing = manualRefresh.isRefreshing || messageQuery.isFetching;
  const hasMessageDetail = messageQuery.data !== undefined;

  useEffect(() => {
    markMessageAsRead(messageQuery.data?.id);
  }, [messageQuery.data?.id]);

  const workspaceHref = `/workspace${buildWorkspaceSearch({
    mailbox: workspaceParams.get("mailbox") ?? messageQuery.data?.mailboxId,
    message: messageQuery.data?.id ?? messageId,
    sort: workspaceSort,
    q: workspaceParams.get("q"),
  })}`;
  const mailboxHref = appRoutes.mailboxes;
  const error =
    messageQuery.error && !hasMessageDetail
      ? isNotFoundError(messageQuery.error)
        ? {
            variant: "not-found" as const,
            title: "这封邮件已经不可见了",
            description:
              "它可能已经被清理、迁移，或者当前会话无权继续查看。你可以退回工作台重新选择上下文。",
            details: getErrorDetails(messageQuery.error),
          }
        : {
            variant: "recoverable" as const,
            title: "邮件详情加载失败",
            description:
              "正文、附件和 headers 现在还没拿到，所以控制台不会继续停留在简陋的加载文案。你可以立即重试，或先回到工作台。",
            details: getErrorDetails(messageQuery.error),
          }
      : null;

  return (
    <MessageDetailPageView
      message={messageQuery.data ?? null}
      isLoading={messageQuery.isLoading}
      error={error}
      onRetry={() => void manualRefresh.refresh()}
      isRefreshing={isRefreshing}
      lastRefreshedAt={lastRefreshedAt}
      mailboxHref={mailboxHref}
      workspaceHref={workspaceHref}
    />
  );
};
