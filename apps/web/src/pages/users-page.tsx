import { useState } from "react";

import { EmptyState } from "@/components/shared/empty-state";
import { PageHeader } from "@/components/shared/page-header";
import { UserTable } from "@/components/users/user-table";
import { useSessionQuery } from "@/hooks/use-session";
import { useCreateUserMutation, useUsersQuery } from "@/hooks/use-users";

export const UsersPage = () => {
  const sessionQuery = useSessionQuery();
  const usersQuery = useUsersQuery();
  const createUserMutation = useCreateUserMutation();
  const [latestKey, setLatestKey] = useState<string | null>(null);

  if (sessionQuery.data?.user.role !== "admin") {
    return (
      <EmptyState
        title="需要管理员权限"
        description="只有 admin 才能查看多用户列表和创建新用户。"
      />
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="多用户管理"
        description="管理员可以创建 member/admin，并为新用户生成初始 API Key。"
        eyebrow="Users"
      />
      <UserTable
        users={usersQuery.data ?? []}
        latestKey={latestKey}
        onCreate={async (values) => {
          const created = await createUserMutation.mutateAsync(values);
          setLatestKey(created.initialKey.apiKey);
        }}
      />
    </div>
  );
};
