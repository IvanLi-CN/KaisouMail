import { useQuery } from "@tanstack/react-query";
import { LayoutList, RefreshCw, UserRound, UserRoundCog } from "lucide-react";
import { Link, useSearchParams } from "react-router-dom";
import {
  ErrorState,
  type ErrorStateVariant,
} from "@/components/shared/error-state";
import { PageHeader } from "@/components/shared/page-header";
import { Button } from "@/components/ui/button";
import { type SystemSection, UserTable } from "@/components/users/user-table";
import { usePasskeysQuery } from "@/hooks/use-passkeys";
import { useAccountQuery, useSessionQuery } from "@/hooks/use-session";
import {
  INVITES_PAGE_SIZE,
  USERS_PAGE_SIZE,
  useCreateInviteMutation,
  useDeleteInviteMutation,
  useInvitesQuery,
  useRegistrationSettingsQuery,
  useTransferAdminMutation,
  useUpdateRegistrationSettingsMutation,
  useUsersQuery,
} from "@/hooks/use-users";
import { apiClient } from "@/lib/api";
import { getErrorDetails } from "@/lib/error-utils";
import { appRoutes } from "@/lib/routes";
import { cn } from "@/lib/utils";

const defaultPaginationMeta = (totalItems: number, pageSize: number) => ({
  page: 1,
  pageSize,
  totalItems,
  totalPages: Math.max(1, Math.ceil(totalItems / pageSize)),
});

type UsersPageViewProps = {
  section?: SystemSection;
  onSectionChange?: (section: SystemSection) => void;
  users: Parameters<typeof UserTable>[0]["users"];
  usersPagination?: Parameters<typeof UserTable>[0]["usersPagination"];
  usersPaginationMode?: Parameters<typeof UserTable>[0]["usersPaginationMode"];
  invites: Parameters<typeof UserTable>[0]["invites"];
  invitesPagination?: Parameters<typeof UserTable>[0]["invitesPagination"];
  invitesPaginationMode?: Parameters<
    typeof UserTable
  >[0]["invitesPaginationMode"];
  settings: Parameters<typeof UserTable>[0]["settings"];
  currentAdminUserId: string | null;
  currentAdmin: Parameters<typeof UserTable>[0]["currentAdmin"];
  pendingTransferVerification?: Parameters<
    typeof UserTable
  >[0]["pendingTransferVerification"];
  onConsumePendingTransferVerification?: () => void;
  error?: {
    variant: ErrorStateVariant;
    title: string;
    description: string;
    details?: string | null;
  } | null;
  onRetry?: () => void;
  onCreateInvite: Parameters<typeof UserTable>[0]["onCreateInvite"];
  onDeleteInvite: Parameters<typeof UserTable>[0]["onDeleteInvite"];
  onUpdateSettings: Parameters<typeof UserTable>[0]["onUpdateSettings"];
  onTransferAdmin: Parameters<typeof UserTable>[0]["onTransferAdmin"];
  onUsersPageChange?: Parameters<typeof UserTable>[0]["onUsersPageChange"];
  onInvitesPageChange?: Parameters<typeof UserTable>[0]["onInvitesPageChange"];
};

const systemSections = [
  {
    id: "users",
    label: "用户",
    icon: UserRound,
    description: "查看账号与管理员转移。",
  },
  {
    id: "invites",
    label: "邀请",
    icon: LayoutList,
    description: "管理邀请码与批量发放。",
  },
  {
    id: "registration",
    label: "注册",
    icon: UserRoundCog,
    description: "管理注册入口与 OAuth 配置。",
  },
] satisfies ReadonlyArray<{
  id: SystemSection;
  label: string;
  icon: typeof UserRound;
  description: string;
}>;

const resolveSystemSection = (value: string | null): SystemSection =>
  systemSections.some((section) => section.id === value)
    ? (value as SystemSection)
    : "users";

const resolvePositivePage = (value: string | null) => {
  const page = Number(value);
  if (!Number.isInteger(page) || page < 1) {
    return 1;
  }
  return page;
};

export const UsersPageView = ({
  section = "users",
  onSectionChange,
  users,
  usersPagination = defaultPaginationMeta(users.length, USERS_PAGE_SIZE),
  usersPaginationMode = "local",
  invites,
  invitesPagination = defaultPaginationMeta(invites.length, INVITES_PAGE_SIZE),
  invitesPaginationMode = "local",
  settings,
  currentAdminUserId,
  currentAdmin,
  pendingTransferVerification,
  onConsumePendingTransferVerification,
  error = null,
  onRetry,
  onCreateInvite,
  onDeleteInvite,
  onUpdateSettings,
  onTransferAdmin,
  onUsersPageChange = () => undefined,
  onInvitesPageChange = () => undefined,
}: UsersPageViewProps) => {
  const activeSection =
    systemSections.find((item) => item.id === section) ?? systemSections[0];

  return (
    <div className="space-y-6">
      <PageHeader title="系统" description="系统设置。" />
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
                重新加载系统数据
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
        <div className="grid gap-6 xl:grid-cols-[176px_minmax(0,1fr)]">
          <aside className="space-y-3">
            <p className="px-3 text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground">
              系统内导航
            </p>
            <nav
              aria-label="系统模块导航"
              className="grid gap-2 md:grid-cols-3 xl:grid-cols-1"
            >
              {systemSections.map((item) => {
                const isActive = item.id === section;
                return (
                  <Button
                    key={item.id}
                    aria-pressed={isActive}
                    variant="ghost"
                    className={cn(
                      "w-full min-h-11 justify-start gap-3 rounded-xl border text-left transition-colors",
                      isActive
                        ? "border-border bg-muted/30 text-foreground"
                        : "border-transparent text-muted-foreground hover:border-border/50 hover:bg-muted/15 hover:text-foreground",
                    )}
                    onClick={() => {
                      onSectionChange?.(item.id);
                    }}
                  >
                    <item.icon className="h-4 w-4 shrink-0" />
                    <span>{item.label}</span>
                  </Button>
                );
              })}
            </nav>
          </aside>

          <section className="space-y-4">
            <div className="space-y-1 px-1">
              <p className="text-lg font-semibold text-foreground">
                {activeSection.label}
              </p>
              <p className="text-sm text-muted-foreground">
                {activeSection.description}
              </p>
            </div>
            <UserTable
              section={section}
              users={users}
              usersPagination={usersPagination}
              usersPaginationMode={usersPaginationMode}
              invites={invites}
              invitesPagination={invitesPagination}
              invitesPaginationMode={invitesPaginationMode}
              settings={settings}
              currentAdminUserId={currentAdminUserId}
              currentAdmin={currentAdmin}
              pendingTransferVerification={pendingTransferVerification}
              onConsumePendingTransferVerification={
                onConsumePendingTransferVerification
              }
              onCreateInvite={onCreateInvite}
              onDeleteInvite={onDeleteInvite}
              onUpdateSettings={onUpdateSettings}
              onTransferAdmin={onTransferAdmin}
              onUsersPageChange={onUsersPageChange}
              onInvitesPageChange={onInvitesPageChange}
            />
          </section>
        </div>
      )}
    </div>
  );
};

export const UsersPage = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const section = resolveSystemSection(searchParams.get("section"));
  const usersPage = resolvePositivePage(searchParams.get("usersPage"));
  const invitesPage = resolvePositivePage(searchParams.get("invitesPage"));
  const sessionQuery = useSessionQuery();
  const accountQuery = useAccountQuery();
  const externalAccountsQuery = useQuery({
    queryKey: ["account", "external-accounts"],
    queryFn: () => apiClient.listExternalAccounts(),
    enabled: sessionQuery.data?.user.role === "admin",
  });
  const passkeysQuery = usePasskeysQuery(
    sessionQuery.data?.user.role === "admin",
  );
  const usersQuery = useUsersQuery(usersPage, USERS_PAGE_SIZE);
  const invitesQuery = useInvitesQuery(invitesPage, INVITES_PAGE_SIZE);
  const settingsQuery = useRegistrationSettingsQuery();
  const createInviteMutation = useCreateInviteMutation();
  const deleteInviteMutation = useDeleteInviteMutation();
  const updateSettingsMutation = useUpdateRegistrationSettingsMutation();
  const transferAdminMutation = useTransferAdminMutation();
  const pendingTransferVerification = (() => {
    const verificationToken = searchParams.get("transferVerification");
    const targetUserId = searchParams.get("transferTarget");
    const method = searchParams.get("transferMethod");
    if (
      !verificationToken ||
      !targetUserId ||
      !method ||
      !["github", "linuxdo", "passkey", "api-key"].includes(method)
    ) {
      return null;
    }
    return {
      verificationToken,
      targetUserId,
      method: method as "github" | "linuxdo" | "passkey" | "api-key",
    };
  })();
  const consumePendingTransferVerification = () => {
    const next = new URLSearchParams(searchParams);
    next.delete("transferVerification");
    next.delete("transferTarget");
    next.delete("transferMethod");
    setSearchParams(next, { replace: true });
  };
  const hasAnyData =
    usersQuery.data !== undefined &&
    invitesQuery.data !== undefined &&
    settingsQuery.data !== undefined;

  if (sessionQuery.data?.user.role !== "admin") {
    return (
      <ErrorState
        variant="permission"
        title="需要管理员权限"
        description="仅唯一管理员可以查看邀请码、注册策略与管理员转移。"
        secondaryAction={
          <Button asChild variant="outline">
            <Link to={appRoutes.workspace}>回到工作台</Link>
          </Button>
        }
      />
    );
  }

  const firstError =
    usersQuery.error ?? invitesQuery.error ?? settingsQuery.error ?? null;

  if (firstError && !hasAnyData) {
    return (
      <UsersPageView
        section={section}
        users={[]}
        usersPagination={{
          page: 1,
          pageSize: USERS_PAGE_SIZE,
          totalItems: 0,
          totalPages: 1,
        }}
        usersPaginationMode="server"
        invites={[]}
        invitesPagination={{
          page: 1,
          pageSize: INVITES_PAGE_SIZE,
          totalItems: 0,
          totalPages: 1,
        }}
        invitesPaginationMode="server"
        settings={{
          githubMode: "off",
          githubDailyLimit: 0,
          githubClientId: "",
          githubClientSecret: "",
          githubOauthScopes: "read:user",
          linuxdoMode: "off",
          linuxdoDailyLimit: 0,
          linuxdoClientId: "",
          linuxdoClientSecret: "",
          linuxdoOauthBaseUrl: "https://connect.linux.do",
          passkeyMode: "off",
          deletedUserMailboxRetentionDays: 7,
          updatedAt: new Date(0).toISOString(),
        }}
        currentAdminUserId={sessionQuery.data?.user.id ?? null}
        currentAdmin={{
          user: accountQuery.data?.user ?? sessionQuery.data?.user ?? null,
          externalAccounts: [],
          hasPasskeys: false,
        }}
        error={{
          variant: "recoverable",
          title: "系统数据加载失败",
          description:
            "暂时无法获取用户、邀请码或注册策略，请重试后再继续操作。",
          details: getErrorDetails(firstError),
        }}
        onRetry={() => {
          void usersQuery.refetch();
          void invitesQuery.refetch();
          void settingsQuery.refetch();
        }}
        onCreateInvite={async () => undefined}
        onDeleteInvite={async () => undefined}
        onUpdateSettings={async () => undefined}
        onTransferAdmin={async () => undefined}
        onUsersPageChange={() => undefined}
        onInvitesPageChange={() => undefined}
      />
    );
  }

  return (
    <UsersPageView
      section={section}
      onSectionChange={(nextSection) => {
        setSearchParams((current) => {
          const next = new URLSearchParams(current);
          if (nextSection === "users") {
            next.delete("section");
          } else {
            next.set("section", nextSection);
          }
          return next;
        });
      }}
      users={usersQuery.data?.users ?? []}
      usersPagination={
        usersQuery.data?.pagination ?? {
          page: usersPage,
          pageSize: USERS_PAGE_SIZE,
          totalItems: 0,
          totalPages: 1,
        }
      }
      usersPaginationMode="server"
      invites={invitesQuery.data?.invites ?? []}
      invitesPagination={
        invitesQuery.data?.pagination ?? {
          page: invitesPage,
          pageSize: INVITES_PAGE_SIZE,
          totalItems: 0,
          totalPages: 1,
        }
      }
      invitesPaginationMode="server"
      settings={
        settingsQuery.data?.settings ?? {
          githubMode: "off",
          githubDailyLimit: 0,
          githubClientId: "",
          githubClientSecret: "",
          githubOauthScopes: "read:user",
          linuxdoMode: "off",
          linuxdoDailyLimit: 0,
          linuxdoClientId: "",
          linuxdoClientSecret: "",
          linuxdoOauthBaseUrl: "https://connect.linux.do",
          passkeyMode: "off",
          deletedUserMailboxRetentionDays: 7,
          updatedAt: new Date().toISOString(),
        }
      }
      currentAdminUserId={sessionQuery.data?.user.id ?? null}
      currentAdmin={{
        user: accountQuery.data?.user ?? sessionQuery.data?.user ?? null,
        externalAccounts: externalAccountsQuery.data ?? [],
        hasPasskeys: (passkeysQuery.data?.length ?? 0) > 0,
      }}
      pendingTransferVerification={pendingTransferVerification}
      onConsumePendingTransferVerification={consumePendingTransferVerification}
      onCreateInvite={async (values) => {
        await createInviteMutation.mutateAsync(values);
      }}
      onDeleteInvite={async (inviteId) => {
        await deleteInviteMutation.mutateAsync(inviteId);
      }}
      onUpdateSettings={async (values) => {
        await updateSettingsMutation.mutateAsync(values);
      }}
      onTransferAdmin={async ({ userId, verificationToken }) => {
        await transferAdminMutation.mutateAsync({ userId, verificationToken });
      }}
      onUsersPageChange={(page) => {
        setSearchParams((current) => {
          const next = new URLSearchParams(current);
          if (page <= 1) {
            next.delete("usersPage");
          } else {
            next.set("usersPage", String(page));
          }
          return next;
        });
      }}
      onInvitesPageChange={(page) => {
        setSearchParams((current) => {
          const next = new URLSearchParams(current);
          if (page <= 1) {
            next.delete("invitesPage");
          } else {
            next.set("invitesPage", String(page));
          }
          return next;
        });
      }}
    />
  );
};
