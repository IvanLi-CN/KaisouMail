import { startAuthentication } from "@simplewebauthn/browser";
import { AlertTriangle, KeyRound, ShieldCheck } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogBody,
  DialogFooter,
  DialogHeader,
  DialogPanel,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeaderCell,
  TableRow,
} from "@/components/ui/table";
import { apiClient } from "@/lib/api";
import type {
  AdminUserRecord,
  ExternalAccountRecord,
  InviteRecord,
  RegistrationSettings,
  SessionUser,
} from "@/lib/contracts";
import { formatDateTime } from "@/lib/format";

const createInviteSchema = z.object({
  note: z.string().trim().max(160, "备注最多 160 个字符").optional(),
  count: z.coerce
    .number()
    .int("请输入整数")
    .min(1, "至少生成 1 个邀请码")
    .max(100, "单次最多生成 100 个邀请码"),
});

type CreateInviteValues = z.infer<typeof createInviteSchema>;
export type SystemSection = "users" | "invites" | "registration";
type PaginationState = {
  page: number;
  resetKey: string;
};
type RegistrationSettingsValues = Pick<
  RegistrationSettings,
  | "githubMode"
  | "githubDailyLimit"
  | "linuxdoMode"
  | "linuxdoDailyLimit"
  | "passkeyMode"
  | "deletedUserMailboxRetentionDays"
>;

const USERS_PER_PAGE = 10;
const INVITES_PER_PAGE = 10;

const clampPage = (page: number, totalPages: number) =>
  Math.min(Math.max(page, 1), totalPages);

const getPagination = <T,>(
  items: T[],
  pageSize: number,
  state: PaginationState,
  resetKey: string,
) => {
  const totalPages = Math.max(1, Math.ceil(items.length / pageSize));
  const page =
    state.resetKey === resetKey ? clampPage(state.page, totalPages) : 1;
  const pageStart = (page - 1) * pageSize;
  const pageItems = items.slice(pageStart, pageStart + pageSize);

  return {
    page,
    pageItems,
    totalPages,
    visibleRangeStart: items.length === 0 ? 0 : pageStart + 1,
    visibleRangeEnd: pageStart + pageItems.length,
  };
};

const PaginationControls = ({
  itemLabel,
  page,
  totalPages,
  totalItems,
  visibleRangeStart,
  visibleRangeEnd,
  onPageChange,
}: {
  itemLabel: string;
  page: number;
  totalPages: number;
  totalItems: number;
  visibleRangeStart: number;
  visibleRangeEnd: number;
  onPageChange: (page: number) => void;
}) => {
  if (totalPages <= 1) {
    return null;
  }

  return (
    <div className="mt-4 flex flex-col gap-3 border-t border-border/70 pt-4 text-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
      <p>
        显示 {visibleRangeStart}-{visibleRangeEnd} / {totalItems} 个{itemLabel}
      </p>
      <div className="flex items-center justify-end gap-2">
        <span>
          第 {page} / {totalPages} 页
        </span>
        <Button
          variant="outline"
          size="sm"
          className="min-h-11"
          onClick={() => onPageChange(page - 1)}
          disabled={page === 1}
        >
          上一页
        </Button>
        <Button
          variant="outline"
          size="sm"
          className="min-h-11"
          onClick={() => onPageChange(page + 1)}
          disabled={page === totalPages}
        >
          下一页
        </Button>
      </div>
    </div>
  );
};

const roleBadgeClassName = (role: AdminUserRecord["role"]) =>
  role === "admin"
    ? "border-primary/40 bg-primary/15 text-primary"
    : "border-border bg-muted/20 text-foreground";

const channelCardClassName =
  "space-y-4 rounded-2xl border border-border/70 bg-card p-4";

const transferApiKeySchema = z.object({
  apiKey: z.string().trim().min(8, "请输入可用的 API Key"),
});

type TransferApiKeyValues = z.infer<typeof transferApiKeySchema>;
type ReauthMethod = "passkey" | "github" | "linuxdo" | "api-key";

const providerBadgeLabel = (account: ExternalAccountRecord) =>
  `${account.provider.toUpperCase()}${
    account.providerUsername ? ` · ${account.providerUsername}` : ""
  }`;

const transferMethodLabel = (method: ReauthMethod) => {
  switch (method) {
    case "passkey":
      return "Passkey";
    case "github":
      return "GitHub";
    case "linuxdo":
      return "LinuxDO";
    case "api-key":
      return "API Key";
  }
};

const inviteKindLabel = (invite: InviteRecord) =>
  invite.kind === "bootstrap_admin" ? "Bootstrap" : "标准";

const inviteStatusLabel = (invite: InviteRecord) =>
  invite.usedAt ? "已使用" : "未使用";

export const UserTable = ({
  section = "users",
  users,
  invites,
  settings,
  currentAdminUserId,
  currentAdmin,
  pendingTransferVerification,
  onConsumePendingTransferVerification,
  onCreateInvite,
  onDeleteInvite,
  onUpdateSettings,
  onTransferAdmin,
}: {
  section?: SystemSection;
  users: AdminUserRecord[];
  invites: InviteRecord[];
  settings: RegistrationSettings;
  currentAdminUserId: string | null;
  currentAdmin: {
    user: SessionUser | null;
    externalAccounts: ExternalAccountRecord[];
    hasPasskeys: boolean;
  };
  pendingTransferVerification?: {
    verificationToken: string;
    targetUserId: string;
    method: ReauthMethod;
  } | null;
  onConsumePendingTransferVerification?: () => void;
  onCreateInvite: (values: CreateInviteValues) => Promise<void> | void;
  onDeleteInvite: (inviteId: string) => Promise<void> | void;
  onUpdateSettings: (
    values: RegistrationSettingsValues,
  ) => Promise<void> | void;
  onTransferAdmin: (input: {
    userId: string;
    verificationToken: string;
  }) => Promise<void> | void;
}) => {
  const inviteForm = useForm<CreateInviteValues>({
    defaultValues: { note: "", count: 10 },
  });
  const [settingsDraft, setSettingsDraft] =
    useState<RegistrationSettingsValues>({
      githubMode: settings.githubMode,
      githubDailyLimit: settings.githubDailyLimit,
      linuxdoMode: settings.linuxdoMode,
      linuxdoDailyLimit: settings.linuxdoDailyLimit,
      passkeyMode: settings.passkeyMode,
      deletedUserMailboxRetentionDays: settings.deletedUserMailboxRetentionDays,
    });
  const [transferTargetId, setTransferTargetId] = useState<string | null>(null);
  const [transferIntentToken, setTransferIntentToken] = useState<string | null>(
    null,
  );
  const [transferVerificationToken, setTransferVerificationToken] = useState<
    string | null
  >(null);
  const [transferVerifiedMethod, setTransferVerifiedMethod] =
    useState<ReauthMethod | null>(null);
  const [transferPendingMethod, setTransferPendingMethod] =
    useState<ReauthMethod | null>(null);
  const [usersPaginationState, setUsersPaginationState] =
    useState<PaginationState>({ page: 1, resetKey: "" });
  const [invitesPaginationState, setInvitesPaginationState] =
    useState<PaginationState>({ page: 1, resetKey: "" });
  const [transferError, setTransferError] = useState<string | null>(null);
  const [isCreatingIntent, setIsCreatingIntent] = useState(false);
  const [isSubmittingTransfer, setIsSubmittingTransfer] = useState(false);
  const transferApiKeyForm = useForm<TransferApiKeyValues>({
    defaultValues: { apiKey: "" },
  });

  useEffect(() => {
    setSettingsDraft({
      githubMode: settings.githubMode,
      githubDailyLimit: settings.githubDailyLimit,
      linuxdoMode: settings.linuxdoMode,
      linuxdoDailyLimit: settings.linuxdoDailyLimit,
      passkeyMode: settings.passkeyMode,
      deletedUserMailboxRetentionDays: settings.deletedUserMailboxRetentionDays,
    });
  }, [settings]);

  useEffect(() => {
    if (!pendingTransferVerification) {
      return;
    }
    setTransferTargetId(pendingTransferVerification.targetUserId);
    setTransferVerificationToken(pendingTransferVerification.verificationToken);
    setTransferVerifiedMethod(pendingTransferVerification.method);
    setTransferPendingMethod(null);
    setTransferError(null);
    onConsumePendingTransferVerification?.();
  }, [onConsumePendingTransferVerification, pendingTransferVerification]);

  const transferTarget = useMemo(
    () => users.find((user) => user.id === transferTargetId) ?? null,
    [transferTargetId, users],
  );

  const availableReauthMethods = useMemo(() => {
    const methods: ReauthMethod[] = [];
    if (currentAdmin.hasPasskeys) {
      methods.push("passkey");
    }
    for (const account of currentAdmin.externalAccounts) {
      if (!methods.includes(account.provider)) {
        methods.push(account.provider);
      }
    }
    methods.push("api-key");
    return methods;
  }, [currentAdmin.externalAccounts, currentAdmin.hasPasskeys]);

  const usersPaginationResetKey = useMemo(
    () =>
      users
        .map((user) => `${user.id}:${user.updatedAt}:${user.deletedAt ?? ""}`)
        .join("|"),
    [users],
  );
  const usersPagination = getPagination(
    users,
    USERS_PER_PAGE,
    usersPaginationState,
    usersPaginationResetKey,
  );
  const invitesPaginationResetKey = useMemo(
    () =>
      invites
        .map(
          (invite) => `${invite.id}:${invite.createdAt}:${invite.usedAt ?? ""}`,
        )
        .join("|"),
    [invites],
  );
  const invitesPagination = getPagination(
    invites,
    INVITES_PER_PAGE,
    invitesPaginationState,
    invitesPaginationResetKey,
  );

  const closeTransferDialog = () => {
    setTransferTargetId(null);
    setTransferIntentToken(null);
    setTransferVerificationToken(null);
    setTransferVerifiedMethod(null);
    setTransferPendingMethod(null);
    setTransferError(null);
    setIsCreatingIntent(false);
    setIsSubmittingTransfer(false);
    transferApiKeyForm.reset();
  };

  const openTransferDialog = async (userId: string) => {
    try {
      setTransferTargetId(userId);
      setTransferError(null);
      setTransferVerificationToken(null);
      setTransferVerifiedMethod(null);
      setTransferPendingMethod(null);
      setIsCreatingIntent(true);
      const result = await apiClient.createAdminTransferIntent(userId);
      setTransferIntentToken(result.intentToken);
    } catch (error) {
      setTransferError(
        error instanceof Error ? error.message : "无法开始管理员转移",
      );
    } finally {
      setIsCreatingIntent(false);
    }
  };

  const handleProviderReauth = (provider: "github" | "linuxdo") => {
    if (!transferTarget || !transferIntentToken) {
      return;
    }
    setTransferPendingMethod(provider);
    window.location.href = apiClient.getProviderStartUrl(provider, {
      intent: "admin-transfer",
      returnTo: "/users",
      intentToken: transferIntentToken,
    });
  };

  const handlePasskeyReauth = async () => {
    if (!transferTarget || !transferIntentToken) {
      return;
    }
    try {
      setTransferPendingMethod("passkey");
      setTransferError(null);
      const options = await apiClient.createAdminTransferPasskeyOptions(
        transferTarget.id,
        transferIntentToken,
      );
      const response = await startAuthentication({
        optionsJSON: options,
      });
      const result = await apiClient.verifyAdminTransferPasskey(
        transferTarget.id,
        {
          intentToken: transferIntentToken,
          response,
        },
      );
      setTransferVerificationToken(result.verificationToken);
      setTransferVerifiedMethod("passkey");
    } catch (error) {
      setTransferError(
        error instanceof Error ? error.message : "Passkey 验证失败",
      );
    } finally {
      setTransferPendingMethod(null);
    }
  };

  const handleApiKeyReauth = transferApiKeyForm.handleSubmit(async (values) => {
    if (!transferTarget || !transferIntentToken) {
      return;
    }
    try {
      setTransferPendingMethod("api-key");
      setTransferError(null);
      const parsed = transferApiKeySchema.parse(values);
      const result = await apiClient.verifyAdminTransferApiKey(
        transferTarget.id,
        {
          intentToken: transferIntentToken,
          apiKey: parsed.apiKey,
        },
      );
      setTransferVerificationToken(result.verificationToken);
      setTransferVerifiedMethod("api-key");
      transferApiKeyForm.reset();
    } catch (error) {
      setTransferError(
        error instanceof Error ? error.message : "API Key 验证失败",
      );
    } finally {
      setTransferPendingMethod(null);
    }
  });

  const submitAdminTransfer = async () => {
    if (!transferTarget || !transferVerificationToken) {
      return;
    }
    try {
      setIsSubmittingTransfer(true);
      setTransferError(null);
      await onTransferAdmin({
        userId: transferTarget.id,
        verificationToken: transferVerificationToken,
      });
      closeTransferDialog();
    } catch (error) {
      setTransferError(
        error instanceof Error ? error.message : "管理员转移失败",
      );
    } finally {
      setIsSubmittingTransfer(false);
    }
  };

  const parseIntField = (value: string, max: number) => {
    const parsed = Number(value);
    if (!Number.isInteger(parsed) || parsed < 0) return 0;
    return Math.min(parsed, max);
  };

  return (
    <div className="space-y-6">
      {section === "users" ? (
        <Card>
          <CardHeader>
            <CardTitle>Users</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3 md:hidden">
              {usersPagination.pageItems.map((user) => {
                const canTransfer = user.id !== currentAdminUserId;
                return (
                  <div
                    key={user.id}
                    className="rounded-2xl border border-border/70 bg-card p-4"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0 space-y-1">
                        <p className="font-medium text-foreground">
                          {user.nickname}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          @{user.username}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          创建于 {formatDateTime(user.createdAt)}
                        </p>
                      </div>
                      <Badge className={roleBadgeClassName(user.role)}>
                        {user.role}
                      </Badge>
                    </div>
                    <div className="mt-4 space-y-3 text-sm">
                      <div className="space-y-1">
                        <p className="text-xs font-medium text-muted-foreground">
                          外部绑定
                        </p>
                        <div className="flex flex-wrap gap-2">
                          {user.externalAccounts.length > 0 ? (
                            user.externalAccounts.map((account) => (
                              <Badge
                                key={account.id}
                                className="border border-border"
                              >
                                {account.provider}
                                {account.providerUsername
                                  ? ` · ${account.providerUsername}`
                                  : ""}
                              </Badge>
                            ))
                          ) : (
                            <span className="text-muted-foreground">无</span>
                          )}
                        </div>
                      </div>
                      <div className="grid gap-3 sm:grid-cols-2">
                        <div className="space-y-1">
                          <p className="text-xs font-medium text-muted-foreground">
                            Passkeys
                          </p>
                          <p className="text-foreground">{user.passkeyCount}</p>
                        </div>
                        <div className="space-y-1">
                          <p className="text-xs font-medium text-muted-foreground">
                            状态
                          </p>
                          <p className="text-foreground">
                            {user.deletedAt
                              ? `已注销 · ${formatDateTime(user.deletedAt)}`
                              : `更新于 ${formatDateTime(user.updatedAt)}`}
                          </p>
                        </div>
                      </div>
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      className="mt-4 min-h-11 w-full"
                      onClick={() => {
                        void openTransferDialog(user.id);
                      }}
                      disabled={!canTransfer || Boolean(user.deletedAt)}
                    >
                      {canTransfer ? "转移管理员" : "当前管理员"}
                    </Button>
                  </div>
                );
              })}
            </div>
            <div className="hidden md:block">
              <Table>
                <TableHead>
                  <TableRow>
                    <TableHeaderCell>账号</TableHeaderCell>
                    <TableHeaderCell>外部绑定</TableHeaderCell>
                    <TableHeaderCell>Passkeys</TableHeaderCell>
                    <TableHeaderCell>状态</TableHeaderCell>
                    <TableHeaderCell className="text-right">
                      操作
                    </TableHeaderCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {usersPagination.pageItems.map((user) => {
                    const canTransfer = user.id !== currentAdminUserId;
                    return (
                      <TableRow key={user.id}>
                        <TableCell>
                          <div className="space-y-1">
                            <p className="font-medium text-foreground">
                              {user.nickname}
                            </p>
                            <p className="text-xs text-muted-foreground">
                              @{user.username}
                            </p>
                            <p className="text-xs text-muted-foreground">
                              创建于 {formatDateTime(user.createdAt)}
                            </p>
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="flex flex-wrap gap-2">
                            {user.externalAccounts.length > 0 ? (
                              user.externalAccounts.map((account) => (
                                <Badge
                                  key={account.id}
                                  className="border border-border"
                                >
                                  {account.provider}
                                  {account.providerUsername
                                    ? ` · ${account.providerUsername}`
                                    : ""}
                                </Badge>
                              ))
                            ) : (
                              <span className="text-sm text-muted-foreground">
                                无
                              </span>
                            )}
                          </div>
                        </TableCell>
                        <TableCell>{user.passkeyCount}</TableCell>
                        <TableCell>
                          <div className="space-y-2">
                            <Badge className={roleBadgeClassName(user.role)}>
                              {user.role}
                            </Badge>
                            <p className="text-xs text-muted-foreground">
                              {user.deletedAt
                                ? `已注销 · ${formatDateTime(user.deletedAt)}`
                                : `更新于 ${formatDateTime(user.updatedAt)}`}
                            </p>
                          </div>
                        </TableCell>
                        <TableCell className="text-right">
                          <Button
                            variant="outline"
                            size="sm"
                            className="min-h-10"
                            onClick={() => {
                              void openTransferDialog(user.id);
                            }}
                            disabled={!canTransfer || Boolean(user.deletedAt)}
                          >
                            {canTransfer ? "转移管理员" : "当前管理员"}
                          </Button>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
            <PaginationControls
              itemLabel="用户"
              page={usersPagination.page}
              totalPages={usersPagination.totalPages}
              totalItems={users.length}
              visibleRangeStart={usersPagination.visibleRangeStart}
              visibleRangeEnd={usersPagination.visibleRangeEnd}
              onPageChange={(page) =>
                setUsersPaginationState({
                  page,
                  resetKey: usersPaginationResetKey,
                })
              }
            />
          </CardContent>
        </Card>
      ) : null}

      <Dialog
        open={Boolean(transferTarget)}
        onOpenChange={(open) => !open && closeTransferDialog()}
      >
        <DialogPanel>
          <DialogHeader
            title="转移管理员"
            description={
              transferTarget
                ? `把管理员角色转移给 @${transferTarget.username} 之前，需要当前管理员重新验证登录。`
                : undefined
            }
          />
          <DialogBody className="space-y-5">
            {transferTarget ? (
              <>
                <div className="grid gap-4 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
                  <div className="rounded-2xl border border-border/70 bg-card/70 p-4">
                    <p className="text-xs font-medium uppercase tracking-[0.24em] text-muted-foreground">
                      目标账号
                    </p>
                    <div className="mt-3 space-y-2">
                      <p className="text-lg font-semibold text-foreground">
                        {transferTarget.nickname}
                      </p>
                      <p className="text-sm text-muted-foreground">
                        @{transferTarget.username}
                      </p>
                      <div className="flex flex-wrap gap-2">
                        {transferTarget.externalAccounts.length > 0 ? (
                          transferTarget.externalAccounts.map((account) => (
                            <Badge
                              key={account.id}
                              className="border border-border bg-background/60"
                            >
                              {providerBadgeLabel(account)}
                            </Badge>
                          ))
                        ) : (
                          <Badge className="border border-border bg-background/60">
                            无第三方绑定
                          </Badge>
                        )}
                        <Badge className="border border-border bg-background/60">
                          Passkeys · {transferTarget.passkeyCount}
                        </Badge>
                      </div>
                    </div>
                  </div>

                  <div className="rounded-2xl border border-border/70 bg-card/70 p-4">
                    <div className="flex items-start gap-3">
                      <span className="mt-0.5 flex h-10 w-10 items-center justify-center rounded-2xl border border-border bg-background/80 text-primary">
                        <ShieldCheck className="h-5 w-5" />
                      </span>
                      <div className="space-y-1">
                        <p className="font-medium text-foreground">
                          重新验证当前管理员
                        </p>
                        <p className="text-sm text-muted-foreground">
                          选择你已绑定的登录方案完成一次新验证，验证通过后才可提交角色转移。
                        </p>
                      </div>
                    </div>
                    <div className="mt-4 flex flex-wrap gap-2">
                      {availableReauthMethods.map((method) => (
                        <Badge
                          key={method}
                          className="border border-border bg-background/60"
                        >
                          {transferMethodLabel(method)}
                        </Badge>
                      ))}
                    </div>
                  </div>
                </div>

                <div className="space-y-3">
                  {currentAdmin.hasPasskeys ? (
                    <Button
                      variant="outline"
                      className="min-h-11 w-full justify-start"
                      onClick={() => {
                        void handlePasskeyReauth();
                      }}
                      disabled={
                        isCreatingIntent || Boolean(transferPendingMethod)
                      }
                    >
                      使用 Passkey 重新验证
                    </Button>
                  ) : null}
                  {currentAdmin.externalAccounts.some(
                    (account) => account.provider === "github",
                  ) ? (
                    <Button
                      variant="outline"
                      className="min-h-11 w-full justify-start"
                      onClick={() => handleProviderReauth("github")}
                      disabled={
                        isCreatingIntent || Boolean(transferPendingMethod)
                      }
                    >
                      使用 GitHub 重新验证
                    </Button>
                  ) : null}
                  {currentAdmin.externalAccounts.some(
                    (account) => account.provider === "linuxdo",
                  ) ? (
                    <Button
                      variant="outline"
                      className="min-h-11 w-full justify-start"
                      onClick={() => handleProviderReauth("linuxdo")}
                      disabled={
                        isCreatingIntent || Boolean(transferPendingMethod)
                      }
                    >
                      使用 LinuxDO 重新验证
                    </Button>
                  ) : null}

                  <form
                    className="space-y-3 rounded-2xl border border-border/70 bg-card/70 p-4"
                    onSubmit={(event) => {
                      event.preventDefault();
                      void handleApiKeyReauth();
                    }}
                  >
                    <div className="space-y-2">
                      <Label htmlFor="transfer-api-key">API Key</Label>
                      <Input
                        id="transfer-api-key"
                        placeholder="cfm_xxx"
                        {...transferApiKeyForm.register("apiKey")}
                      />
                      <p className="text-sm text-destructive">
                        {transferApiKeyForm.formState.errors.apiKey?.message ??
                          " "}
                      </p>
                    </div>
                    <Button
                      type="submit"
                      variant="outline"
                      className="min-h-11 w-full justify-start"
                      disabled={
                        isCreatingIntent || Boolean(transferPendingMethod)
                      }
                    >
                      <KeyRound className="mr-2 h-4 w-4" />
                      使用 API Key 重新验证
                    </Button>
                  </form>
                </div>

                <div className="rounded-2xl border border-border/70 bg-background/60 p-4">
                  <div className="flex items-start gap-3">
                    <span className="mt-0.5 flex h-9 w-9 items-center justify-center rounded-2xl border border-border bg-card text-amber-500">
                      <AlertTriangle className="h-4 w-4" />
                    </span>
                    <div className="space-y-1">
                      <p className="font-medium text-foreground">
                        {transferVerificationToken && transferVerifiedMethod
                          ? `已通过 ${transferMethodLabel(transferVerifiedMethod)} 验证`
                          : "尚未完成重新验证"}
                      </p>
                      <p className="text-sm text-muted-foreground">
                        {transferError ??
                          (isCreatingIntent
                            ? "正在准备验证上下文…"
                            : "完成一次新的登录验证后，底部确认按钮才会生效。")}
                      </p>
                    </div>
                  </div>
                </div>
              </>
            ) : null}
          </DialogBody>
          <DialogFooter>
            <Button variant="outline" onClick={closeTransferDialog}>
              取消
            </Button>
            <Button
              onClick={() => {
                void submitAdminTransfer();
              }}
              disabled={!transferVerificationToken || isSubmittingTransfer}
            >
              {isSubmittingTransfer ? "转移中…" : "确认转移管理员"}
            </Button>
          </DialogFooter>
        </DialogPanel>
      </Dialog>

      {section === "invites" ? (
        <Card>
          <CardHeader>
            <CardTitle>Invites</CardTitle>
            <CardDescription>邀请码列表与批量生成。</CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            <form
              className="rounded-2xl border border-border/70 bg-background/60 p-4"
              onSubmit={inviteForm.handleSubmit(async (values) => {
                const parsed = createInviteSchema.parse(values);
                await onCreateInvite(parsed);
                inviteForm.reset({
                  note: parsed.note ?? "",
                  count: parsed.count,
                });
              })}
            >
              <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_120px_180px]">
                <div className="space-y-2">
                  <Label htmlFor="invite-note">备注</Label>
                  <Input
                    id="invite-note"
                    placeholder="例如 QA onboarding"
                    {...inviteForm.register("note")}
                  />
                  <p className="text-sm text-destructive">
                    {inviteForm.formState.errors.note?.message ?? " "}
                  </p>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="invite-count">数量</Label>
                  <Input
                    id="invite-count"
                    type="number"
                    min={1}
                    max={100}
                    inputMode="numeric"
                    {...inviteForm.register("count", { valueAsNumber: true })}
                  />
                  <p className="text-sm text-destructive">
                    {inviteForm.formState.errors.count?.message ?? " "}
                  </p>
                </div>
                <div className="flex lg:pt-7">
                  <Button type="submit" className="h-11 w-full">
                    批量生成邀请码
                  </Button>
                </div>
              </div>
            </form>

            <div className="rounded-2xl border border-border/70 bg-card">
              <div className="px-4 py-3 text-xs font-medium text-muted-foreground">
                共 {invites.length} 个邀请码
              </div>
              <div className="md:hidden">
                <div className="divide-y divide-border">
                  {invitesPagination.pageItems.map((invite) => (
                    <div key={invite.id} className="space-y-3 px-4 py-4">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0 space-y-1">
                          <p className="truncate font-medium text-foreground">
                            {invite.code}
                          </p>
                          <div className="flex flex-wrap gap-2">
                            <Badge className="border border-border bg-background/60">
                              {inviteKindLabel(invite)}
                            </Badge>
                            <Badge className="border border-border bg-background/60">
                              {invite.role}
                            </Badge>
                            <Badge className="border border-border bg-background/60">
                              {inviteStatusLabel(invite)}
                            </Badge>
                          </div>
                        </div>
                        <Button
                          variant="outline"
                          size="sm"
                          className="min-h-11 shrink-0"
                          onClick={() => onDeleteInvite(invite.id)}
                          disabled={Boolean(invite.usedAt)}
                        >
                          删除
                        </Button>
                      </div>
                      <div className="space-y-1 text-sm text-muted-foreground">
                        <p>备注：{invite.note ?? "无"}</p>
                        <p>创建于 {formatDateTime(invite.createdAt)}</p>
                        <p>
                          使用时间：
                          {invite.usedAt
                            ? formatDateTime(invite.usedAt)
                            : "未使用"}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
              <div className="hidden md:block">
                <Table className="min-w-0">
                  <TableHead>
                    <TableRow>
                      <TableHeaderCell>邀请码</TableHeaderCell>
                      <TableHeaderCell>类型</TableHeaderCell>
                      <TableHeaderCell>角色</TableHeaderCell>
                      <TableHeaderCell>备注</TableHeaderCell>
                      <TableHeaderCell>状态</TableHeaderCell>
                      <TableHeaderCell>创建时间</TableHeaderCell>
                      <TableHeaderCell>使用时间</TableHeaderCell>
                      <TableHeaderCell className="text-right">
                        操作
                      </TableHeaderCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {invitesPagination.pageItems.map((invite) => (
                      <TableRow key={invite.id}>
                        <TableCell className="font-medium text-foreground">
                          {invite.code}
                        </TableCell>
                        <TableCell>{inviteKindLabel(invite)}</TableCell>
                        <TableCell>{invite.role}</TableCell>
                        <TableCell className="text-muted-foreground">
                          {invite.note ?? "无"}
                        </TableCell>
                        <TableCell>{inviteStatusLabel(invite)}</TableCell>
                        <TableCell className="text-muted-foreground">
                          {formatDateTime(invite.createdAt)}
                        </TableCell>
                        <TableCell className="text-muted-foreground">
                          {invite.usedAt
                            ? formatDateTime(invite.usedAt)
                            : "未使用"}
                        </TableCell>
                        <TableCell className="text-right">
                          <Button
                            variant="outline"
                            size="sm"
                            className="min-h-10"
                            onClick={() => onDeleteInvite(invite.id)}
                            disabled={Boolean(invite.usedAt)}
                          >
                            删除
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
              <div className="px-4 pb-4">
                <PaginationControls
                  itemLabel="邀请码"
                  page={invitesPagination.page}
                  totalPages={invitesPagination.totalPages}
                  totalItems={invites.length}
                  visibleRangeStart={invitesPagination.visibleRangeStart}
                  visibleRangeEnd={invitesPagination.visibleRangeEnd}
                  onPageChange={(page) =>
                    setInvitesPaginationState({
                      page,
                      resetKey: invitesPaginationResetKey,
                    })
                  }
                />
              </div>
            </div>
          </CardContent>
        </Card>
      ) : null}

      {section === "registration" ? (
        <Card>
          <CardHeader>
            <CardTitle>Registration</CardTitle>
          </CardHeader>
          <CardContent>
            <form
              className="grid gap-6 lg:grid-cols-3"
              onSubmit={(event) => {
                event.preventDefault();
                void onUpdateSettings(settingsDraft);
              }}
            >
              <div className={channelCardClassName}>
                <div className="space-y-1">
                  <p className="text-sm font-semibold text-foreground">
                    GitHub
                  </p>
                  <p className="text-xs text-muted-foreground">
                    `off | invite-only | open`
                  </p>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="github-mode">模式</Label>
                  <select
                    id="github-mode"
                    className="flex h-11 w-full rounded-lg border border-input bg-muted/40 px-3 text-sm outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20"
                    value={settingsDraft.githubMode}
                    onChange={(event) =>
                      setSettingsDraft((current) => ({
                        ...current,
                        githubMode: event.target
                          .value as RegistrationSettingsValues["githubMode"],
                      }))
                    }
                  >
                    <option value="off">off</option>
                    <option value="invite-only">invite-only</option>
                    <option value="open">open</option>
                  </select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="github-limit">每日开放注册上限</Label>
                  <Input
                    id="github-limit"
                    type="number"
                    min={0}
                    max={10000}
                    value={settingsDraft.githubDailyLimit}
                    onChange={(event) =>
                      setSettingsDraft((current) => ({
                        ...current,
                        githubDailyLimit: parseIntField(
                          event.target.value,
                          10_000,
                        ),
                      }))
                    }
                  />
                </div>
              </div>

              <div className={channelCardClassName}>
                <div className="space-y-1">
                  <p className="text-sm font-semibold text-foreground">
                    LinuxDO
                  </p>
                  <p className="text-xs text-muted-foreground">
                    `off | invite-only | open`
                  </p>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="linuxdo-mode">模式</Label>
                  <select
                    id="linuxdo-mode"
                    className="flex h-11 w-full rounded-lg border border-input bg-muted/40 px-3 text-sm outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20"
                    value={settingsDraft.linuxdoMode}
                    onChange={(event) =>
                      setSettingsDraft((current) => ({
                        ...current,
                        linuxdoMode: event.target
                          .value as RegistrationSettingsValues["linuxdoMode"],
                      }))
                    }
                  >
                    <option value="off">off</option>
                    <option value="invite-only">invite-only</option>
                    <option value="open">open</option>
                  </select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="linuxdo-limit">每日开放注册上限</Label>
                  <Input
                    id="linuxdo-limit"
                    type="number"
                    min={0}
                    max={10000}
                    value={settingsDraft.linuxdoDailyLimit}
                    onChange={(event) =>
                      setSettingsDraft((current) => ({
                        ...current,
                        linuxdoDailyLimit: parseIntField(
                          event.target.value,
                          10_000,
                        ),
                      }))
                    }
                  />
                </div>
              </div>

              <div className={channelCardClassName}>
                <div className="space-y-1">
                  <p className="text-sm font-semibold text-foreground">
                    Passkey
                  </p>
                  <p className="text-xs text-muted-foreground">
                    首登只支持邀请码。
                  </p>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="passkey-mode">模式</Label>
                  <select
                    id="passkey-mode"
                    className="flex h-11 w-full rounded-lg border border-input bg-muted/40 px-3 text-sm outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20"
                    value={settingsDraft.passkeyMode}
                    onChange={(event) =>
                      setSettingsDraft((current) => ({
                        ...current,
                        passkeyMode: event.target
                          .value as RegistrationSettingsValues["passkeyMode"],
                      }))
                    }
                  >
                    <option value="off">off</option>
                    <option value="invite-only">invite-only</option>
                  </select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="retention-days">注销后邮箱保留天数</Label>
                  <Input
                    id="retention-days"
                    type="number"
                    min={0}
                    max={30}
                    value={settingsDraft.deletedUserMailboxRetentionDays}
                    onChange={(event) =>
                      setSettingsDraft((current) => ({
                        ...current,
                        deletedUserMailboxRetentionDays: parseIntField(
                          event.target.value,
                          30,
                        ),
                      }))
                    }
                  />
                </div>
                <p className="text-xs text-muted-foreground">
                  当前配置更新于 {formatDateTime(settings.updatedAt)}
                </p>
              </div>

              <div className="lg:col-span-3">
                <Button type="submit" className="min-h-11">
                  保存注册策略
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
};
