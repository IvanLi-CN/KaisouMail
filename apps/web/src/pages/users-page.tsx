import { RefreshCw } from "lucide-react";
import { useState } from "react";
import { Link } from "react-router-dom";

import {
  ErrorState,
  type ErrorStateVariant,
} from "@/components/shared/error-state";
import { PageHeader } from "@/components/shared/page-header";
import { Button } from "@/components/ui/button";
import { UserTable } from "@/components/users/user-table";
import { useSessionQuery } from "@/hooks/use-session";
import { useCreateUserMutation, useUsersQuery } from "@/hooks/use-users";
import { getErrorDetails } from "@/lib/error-utils";
import { appRoutes } from "@/lib/routes";

type UsersPageViewProps = {
  users: Parameters<typeof UserTable>[0]["users"];
  latestKey: string | null;
  error?: {
    variant: ErrorStateVariant;
    title: string;
    description: string;
    details?: string | null;
  } | null;
  onRetry?: () => void;
  onCreate: Parameters<typeof UserTable>[0]["onCreate"];
};

export const UsersPageView = ({
  users,
  latestKey,
  error = null,
  onRetry,
  onCreate,
}: UsersPageViewProps) => (
  <div className="space-y-6">
    <PageHeader
      title="多用户管理"
      description="创建用户并发放初始 API Key。"
      eyebrow="Users"
    />
    {error ? (
      <ErrorState
        variant={error.variant}
        title={error.title}
        description={error.description}
        details={error.details}
        primaryAction={
          onRetry ? (
            <Button onClick={onRetry}>
              <RefreshCw className="mr-2 h-4 w-4" />
              重新加载用户列表
            </Button>
          ) : undefined
        }
        secondaryAction={
          <Button asChild variant="outline">
            <Link to={appRoutes.workspace}>回到工作台</Link>
          </Button>
        }
      />
    ) : (
      <UserTable users={users} latestKey={latestKey} onCreate={onCreate} />
    )}
  </div>
);

export const UsersPage = () => {
  const sessionQuery = useSessionQuery();
  const usersQuery = useUsersQuery();
  const createUserMutation = useCreateUserMutation();
  const [latestKey, setLatestKey] = useState<string | null>(null);
  const hasUsersData = usersQuery.data !== undefined;

  if (sessionQuery.data?.user.role !== "admin") {
    return (
      <ErrorState
        variant="permission"
        title="需要管理员权限"
        description="仅管理员可以查看和创建用户。"
        secondaryAction={
          <Button asChild variant="outline">
            <Link to={appRoutes.workspace}>回到工作台</Link>
          </Button>
        }
      />
    );
  }

  if (usersQuery.error && !hasUsersData) {
    return (
      <UsersPageView
        users={[]}
        latestKey={latestKey}
        error={{
          variant: "recoverable",
          title: "用户目录加载失败",
          description: "暂时无法获取用户列表，请重试后再继续操作。",
          details: getErrorDetails(usersQuery.error),
        }}
        onRetry={() => {
          void usersQuery.refetch();
        }}
        onCreate={async () => undefined}
      />
    );
  }

  return (
    <UsersPageView
      users={usersQuery.data ?? []}
      latestKey={latestKey}
      onCreate={async (values) => {
        const created = await createUserMutation.mutateAsync(values);
        setLatestKey(created.initialKey.apiKey);
      }}
    />
  );
};
