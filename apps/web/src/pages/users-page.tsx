import { LayoutList, RefreshCw, UserRound, UserRoundCog } from "lucide-react";
import { Link, useSearchParams } from "react-router-dom";

import {
  ErrorState,
  type ErrorStateVariant,
} from "@/components/shared/error-state";
import { PageHeader } from "@/components/shared/page-header";
import { Button } from "@/components/ui/button";
import { type SystemSection, UserTable } from "@/components/users/user-table";
import { useSessionQuery } from "@/hooks/use-session";
import {
  useCreateInviteMutation,
  useDeleteInviteMutation,
  useInvitesQuery,
  useRegistrationSettingsQuery,
  useTransferAdminMutation,
  useUpdateRegistrationSettingsMutation,
  useUsersQuery,
} from "@/hooks/use-users";
import { getErrorDetails } from "@/lib/error-utils";
import { appRoutes } from "@/lib/routes";
import { cn } from "@/lib/utils";

type UsersPageViewProps = {
  section?: SystemSection;
  onSectionChange?: (section: SystemSection) => void;
  users: Parameters<typeof UserTable>[0]["users"];
  invites: Parameters<typeof UserTable>[0]["invites"];
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
};

const systemSections = [
  {
    id: "users",
    label: "用户",
    icon: UserRound,
  },
  {
    id: "invites",
    label: "邀请",
    icon: LayoutList,
  },
  {
    id: "registration",
    label: "注册",
    icon: UserRoundCog,
  },
] satisfies ReadonlyArray<{
  id: SystemSection;
  label: string;
  icon: typeof UserRound;
}>;

const resolveSystemSection = (value: string | null): SystemSection =>
  systemSections.some((section) => section.id === value)
    ? (value as SystemSection)
    : "users";

export const UsersPageView = ({
  section = "users",
  onSectionChange,
  users,
  invites,
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
}: UsersPageViewProps) => {
  return (
    <div className="space-y-6">
      <PageHeader title="系统" description="用户、邀请与注册设置。" />
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
            <nav
              aria-label="系统模块导航"
              className="grid gap-2 md:grid-cols-3 xl:grid-cols-1"
            >
              {systemSections.map((item) => {
                const isActive = item.id === section;
                return (
                  <button
                    key={item.id}
                    type="button"
                    aria-pressed={isActive}
                    className={cn(
                      "flex min-h-11 items-center gap-3 rounded-lg px-3 text-left text-sm font-medium transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                      isActive
                        ? "bg-secondary text-foreground"
                        : "text-muted-foreground hover:bg-white/5 hover:text-foreground",
                    )}
                    onClick={() => {
                      onSectionChange?.(item.id);
                    }}
                  >
                    <item.icon className="h-4 w-4 shrink-0" />
                    <span>{item.label}</span>
                  </button>
                );
              })}
            </nav>
          </aside>

          <section className="space-y-4">
            <UserTable
              section={section}
              users={users}
              invites={invites}
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
  const sessionQuery = useSessionQuery();
  const usersQuery = useUsersQuery();
  const invitesQuery = useInvitesQuery();
  const settingsQuery = useRegistrationSettingsQuery();
  const createInviteMutation = useCreateInviteMutation();
  const deleteInviteMutation = useDeleteInviteMutation();
  const updateSettingsMutation = useUpdateRegistrationSettingsMutation();
  const transferAdminMutation = useTransferAdminMutation();
  const currentAdminRecord =
    (usersQuery.data ?? []).find(
      (user) => user.id === sessionQuery.data?.user.id,
    ) ?? null;
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
        invites={[]}
        settings={{
          githubMode: "off",
          githubDailyLimit: 0,
          linuxdoMode: "off",
          linuxdoDailyLimit: 0,
          passkeyMode: "off",
          deletedUserMailboxRetentionDays: 7,
          updatedAt: new Date(0).toISOString(),
        }}
        currentAdminUserId={sessionQuery.data?.user.id ?? null}
        currentAdmin={{
          user: sessionQuery.data?.user ?? null,
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
      users={usersQuery.data ?? []}
      invites={invitesQuery.data ?? []}
      settings={
        settingsQuery.data?.settings ?? {
          githubMode: "off",
          githubDailyLimit: 0,
          linuxdoMode: "off",
          linuxdoDailyLimit: 0,
          passkeyMode: "off",
          deletedUserMailboxRetentionDays: 7,
          updatedAt: new Date().toISOString(),
        }
      }
      currentAdminUserId={sessionQuery.data?.user.id ?? null}
      currentAdmin={{
        user: sessionQuery.data?.user ?? null,
        externalAccounts: currentAdminRecord?.externalAccounts ?? [],
        hasPasskeys: (currentAdminRecord?.passkeyCount ?? 0) > 0,
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
    />
  );
};
