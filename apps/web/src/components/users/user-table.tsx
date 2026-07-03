import { startAuthentication } from "@simplewebauthn/browser";
import {
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  ExternalLink,
  Fingerprint,
  Github,
  KeyRound,
  Search,
  ShieldCheck,
} from "lucide-react";
import type { ComponentType, SVGProps } from "react";
import { useEffect, useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { LinuxDoIcon } from "@/components/icons/linuxdo-icon";
import { CopyTextButton } from "@/components/shared/copy-text-button";
import {
  FormCardSkeleton,
  LoadingShellContainer,
  TableCardSkeleton,
} from "@/components/shared/loading-shells";
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
import { Select } from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
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
  PaginationMeta,
  RegistrationSettings,
  SessionUser,
} from "@/lib/contracts";
import { formatDateTime } from "@/lib/format";
import {
  buildOAuthCallbackUrl,
  type OAuthProvider,
} from "@/lib/oauth-callbacks";
import type { PublicDocsLinks } from "@/lib/public-docs";
import { cn } from "@/lib/utils";

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
type PaginationMode = "local" | "server";
type RegistrationSettingsValues = Pick<
  RegistrationSettings,
  | "githubMode"
  | "githubDailyLimit"
  | "githubClientId"
  | "githubClientSecret"
  | "githubOauthScopes"
  | "linuxdoMode"
  | "linuxdoDailyLimit"
  | "linuxdoClientId"
  | "linuxdoClientSecret"
  | "linuxdoOauthBaseUrl"
  | "passkeyMode"
  | "deletedUserMailboxRetentionDays"
> & {
  clearGithubClientSecret: boolean;
  clearLinuxdoClientSecret: boolean;
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
  "space-y-4 border-t border-border/70 pt-5 first:border-t-0 first:pt-0";

const feedbackCardClassName =
  "rounded-2xl border border-border/70 bg-background/60 px-4 py-3 text-sm";

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

const DEFAULT_USERS_PAGE_SIZE = 10;
const DEFAULT_INVITES_PAGE_SIZE = 10;

const defaultPaginationMeta = (
  totalItems: number,
  pageSize: number,
): PaginationMeta => ({
  page: 1,
  pageSize,
  totalItems,
  totalPages: Math.max(1, Math.ceil(totalItems / pageSize)),
});

const clampPage = (page: number, totalPages: number) =>
  Math.min(Math.max(page, 1), totalPages);

const SliderField = ({
  id,
  label,
  value,
  min,
  max,
  onChange,
}: {
  id: string;
  label: string;
  value: number;
  min: number;
  max: number;
  onChange: (value: number) => void;
}) => (
  <div className="space-y-3">
    <div className="flex items-center justify-between gap-3">
      <Label htmlFor={id}>{label}</Label>
      <span className="rounded-full border border-border bg-background/70 px-2.5 py-1 text-xs font-medium text-foreground">
        {value}
      </span>
    </div>
    <div className="px-1">
      <Slider
        min={min}
        max={max}
        step={1}
        value={[value]}
        onValueChange={(nextValue) => onChange(nextValue[0] ?? min)}
        aria-label={label}
      />
    </div>
    <div className="flex items-center justify-between text-xs text-muted-foreground">
      <span>{min}</span>
      <span>{max}</span>
    </div>
  </div>
);

const ChannelCardTitle = ({
  icon: Icon,
  title,
  iconClassName,
}: {
  icon: ComponentType<SVGProps<SVGSVGElement>>;
  title: string;
  iconClassName?: string;
}) => (
  <div className="flex items-center gap-3">
    <Icon className={cn("h-5 w-5 shrink-0 text-primary", iconClassName)} />
    <p className="text-sm font-semibold text-foreground">{title}</p>
  </div>
);

const providerCallbackLabel = (provider: OAuthProvider) =>
  provider === "github" ? "GitHub 回调地址" : "LinuxDO 回调地址";

const OAuthCallbackUrlField = ({ provider }: { provider: OAuthProvider }) => {
  const callbackUrl = buildOAuthCallbackUrl(provider);
  const label = providerCallbackLabel(provider);

  return (
    <div className="space-y-2">
      <div className="space-y-1">
        <p className="text-sm font-medium text-foreground">OAuth 回调地址</p>
        <p className="text-xs leading-5 text-muted-foreground">
          在{" "}
          {provider === "github" ? "GitHub OAuth App" : "LinuxDO OAuth Client"}{" "}
          里填写这个 callback URL。
        </p>
      </div>
      <div className="flex flex-col gap-2 rounded-lg border border-border bg-background/70 px-3 py-2 sm:flex-row sm:items-center">
        <code className="min-w-0 flex-1 break-all font-mono text-xs leading-5 text-foreground">
          {callbackUrl}
        </code>
        <CopyTextButton value={callbackUrl} label={label} />
      </div>
    </div>
  );
};

const modeLabel = (mode: RegistrationSettingsValues["githubMode"]) => {
  switch (mode) {
    case "off":
      return "关闭";
    case "invite-only":
      return "仅邀请码";
    case "open":
      return "开放";
  }
};

const providerConfigStatusLabel = (configured: boolean) =>
  configured ? "已配置" : "未配置";

export const UserTable = ({
  section = "users",
  users,
  isUsersLoading = false,
  usersPagination = defaultPaginationMeta(
    users.length,
    DEFAULT_USERS_PAGE_SIZE,
  ),
  invites,
  isInvitesLoading = false,
  invitesPagination = defaultPaginationMeta(
    invites.length,
    DEFAULT_INVITES_PAGE_SIZE,
  ),
  settings,
  isSettingsLoading = false,
  currentAdminUserId,
  currentAdmin,
  pendingTransferVerification,
  onConsumePendingTransferVerification,
  onCreateInvite,
  onDeleteInvite,
  onUpdateSettings,
  onTransferAdmin,
  onUsersPageChange = () => undefined,
  onInvitesPageChange = () => undefined,
  usersPaginationMode = "local",
  invitesPaginationMode = "local",
  docsLinks = null,
}: {
  section?: SystemSection;
  users: AdminUserRecord[];
  isUsersLoading?: boolean;
  usersPagination?: PaginationMeta;
  usersPaginationMode?: PaginationMode;
  invites: InviteRecord[];
  isInvitesLoading?: boolean;
  invitesPagination?: PaginationMeta;
  invitesPaginationMode?: PaginationMode;
  settings: RegistrationSettings;
  isSettingsLoading?: boolean;
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
  onUsersPageChange?: (page: number) => void;
  onInvitesPageChange?: (page: number) => void;
  docsLinks?: PublicDocsLinks | null;
}) => {
  const inviteForm = useForm<CreateInviteValues>({
    defaultValues: { note: "", count: 10 },
  });
  const [settingsDraft, setSettingsDraft] =
    useState<RegistrationSettingsValues>({
      githubMode: settings.githubMode,
      githubDailyLimit: settings.githubDailyLimit,
      githubClientId: settings.githubClientId,
      githubClientSecret: settings.githubClientSecret,
      clearGithubClientSecret: false,
      githubOauthScopes: settings.githubOauthScopes,
      linuxdoMode: settings.linuxdoMode,
      linuxdoDailyLimit: settings.linuxdoDailyLimit,
      linuxdoClientId: settings.linuxdoClientId,
      linuxdoClientSecret: settings.linuxdoClientSecret,
      clearLinuxdoClientSecret: false,
      linuxdoOauthBaseUrl: settings.linuxdoOauthBaseUrl,
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
  const [localUsersPage, setLocalUsersPage] = useState(1);
  const [localInvitesPage, setLocalInvitesPage] = useState(1);
  const [userSearch, setUserSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState<"all" | AdminUserRecord["role"]>(
    "all",
  );
  const [inviteActionMessage, setInviteActionMessage] = useState<string | null>(
    null,
  );
  const [inviteActionError, setInviteActionError] = useState<string | null>(
    null,
  );
  const [isCreatingInvite, setIsCreatingInvite] = useState(false);
  const [settingsMessage, setSettingsMessage] = useState<string | null>(null);
  const [settingsError, setSettingsError] = useState<string | null>(null);
  const [isSavingSettings, setIsSavingSettings] = useState(false);
  const [expandedProvider, setExpandedProvider] = useState<
    "github" | "linuxdo" | "passkey" | null
  >("github");
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
      githubClientId: settings.githubClientId,
      githubClientSecret: settings.githubClientSecret,
      clearGithubClientSecret: false,
      githubOauthScopes: settings.githubOauthScopes,
      linuxdoMode: settings.linuxdoMode,
      linuxdoDailyLimit: settings.linuxdoDailyLimit,
      linuxdoClientId: settings.linuxdoClientId,
      linuxdoClientSecret: settings.linuxdoClientSecret,
      clearLinuxdoClientSecret: false,
      linuxdoOauthBaseUrl: settings.linuxdoOauthBaseUrl,
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

  const usersAreServerPaginated = usersPaginationMode === "server";
  const invitesAreServerPaginated = invitesPaginationMode === "server";
  const userFiltersEnabled = !usersAreServerPaginated;
  const derivedInvitesTotalPages = Math.max(
    1,
    Math.ceil(invites.length / Math.max(invitesPagination.pageSize, 1)),
  );
  const effectiveInvitesPage = invitesAreServerPaginated
    ? invitesPagination.page
    : clampPage(localInvitesPage, derivedInvitesTotalPages);
  const visibleInvites = invitesAreServerPaginated
    ? invites
    : invites.slice(
        (effectiveInvitesPage - 1) * invitesPagination.pageSize,
        effectiveInvitesPage * invitesPagination.pageSize,
      );
  const effectiveInvitesPagination = invitesAreServerPaginated
    ? invitesPagination
    : {
        page: effectiveInvitesPage,
        pageSize: invitesPagination.pageSize,
        totalItems: invites.length,
        totalPages: derivedInvitesTotalPages,
      };

  useEffect(() => {
    setLocalInvitesPage((current) =>
      clampPage(current, derivedInvitesTotalPages),
    );
  }, [derivedInvitesTotalPages]);

  useEffect(() => {
    setSettingsMessage(null);
    setSettingsError(null);
  }, []);

  const providerConfigured = {
    github: Boolean(settings.githubClientId),
    linuxdo: Boolean(settings.linuxdoClientId && settings.linuxdoOauthBaseUrl),
    passkey: settings.passkeyMode !== "off",
  };

  const normalizedUserSearch = userSearch.trim().toLowerCase();
  const filteredUsers = useMemo(() => {
    if (!userFiltersEnabled) {
      return users;
    }

    return users.filter((user) => {
      const matchesRole = roleFilter === "all" || user.role === roleFilter;
      const matchesSearch =
        normalizedUserSearch.length === 0 ||
        user.nickname.toLowerCase().includes(normalizedUserSearch) ||
        user.username.toLowerCase().includes(normalizedUserSearch) ||
        user.externalAccounts.some((account) =>
          [account.provider, account.providerUsername, account.providerNickname]
            .filter(Boolean)
            .some((value) =>
              value?.toLowerCase().includes(normalizedUserSearch),
            ),
        );
      return matchesRole && matchesSearch;
    });
  }, [normalizedUserSearch, roleFilter, userFiltersEnabled, users]);

  const usersVisibleSource = filteredUsers;
  const filteredUsersTotalPages = Math.max(
    1,
    Math.ceil(filteredUsers.length / Math.max(usersPagination.pageSize, 1)),
  );
  const effectiveUsersPageResolved = usersAreServerPaginated
    ? usersPagination.page
    : clampPage(localUsersPage, filteredUsersTotalPages);
  const visibleUsers = usersAreServerPaginated
    ? usersVisibleSource
    : usersVisibleSource.slice(
        (effectiveUsersPageResolved - 1) * usersPagination.pageSize,
        effectiveUsersPageResolved * usersPagination.pageSize,
      );
  const effectiveUsersPagination = usersAreServerPaginated
    ? usersPagination
    : {
        page: effectiveUsersPageResolved,
        pageSize: usersPagination.pageSize,
        totalItems: filteredUsers.length,
        totalPages: filteredUsersTotalPages,
      };

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

  const handleCreateInvite = inviteForm.handleSubmit(async (values) => {
    try {
      setIsCreatingInvite(true);
      setInviteActionError(null);
      setInviteActionMessage(null);
      const parsed = createInviteSchema.parse(values);
      await onCreateInvite(parsed);
      inviteForm.reset({
        note: parsed.note ?? "",
        count: parsed.count,
      });
      setInviteActionMessage(
        parsed.count === 1
          ? "邀请码已生成。"
          : `已生成 ${parsed.count} 个邀请码。`,
      );
    } catch (error) {
      setInviteActionError(
        error instanceof Error ? error.message : "生成邀请码失败",
      );
    } finally {
      setIsCreatingInvite(false);
    }
  });

  const handleSaveSettings = async () => {
    try {
      setIsSavingSettings(true);
      setSettingsError(null);
      setSettingsMessage(null);
      await onUpdateSettings({
        ...settingsDraft,
        githubClientSecret: settingsDraft.githubClientSecret.trim(),
        clearGithubClientSecret: settingsDraft.clearGithubClientSecret,
        linuxdoClientSecret: settingsDraft.linuxdoClientSecret.trim(),
        clearLinuxdoClientSecret: settingsDraft.clearLinuxdoClientSecret,
      });
      setSettingsMessage("注册设置已保存。");
    } catch (error) {
      setSettingsError(
        error instanceof Error ? error.message : "保存注册设置失败",
      );
    } finally {
      setIsSavingSettings(false);
    }
  };

  const hasUnsavedSettings =
    settingsDraft.githubMode !== settings.githubMode ||
    settingsDraft.githubDailyLimit !== settings.githubDailyLimit ||
    settingsDraft.githubClientId !== settings.githubClientId ||
    settingsDraft.githubClientSecret.trim().length > 0 ||
    settingsDraft.clearGithubClientSecret ||
    settingsDraft.githubOauthScopes !== settings.githubOauthScopes ||
    settingsDraft.linuxdoMode !== settings.linuxdoMode ||
    settingsDraft.linuxdoDailyLimit !== settings.linuxdoDailyLimit ||
    settingsDraft.linuxdoClientId !== settings.linuxdoClientId ||
    settingsDraft.linuxdoClientSecret.trim().length > 0 ||
    settingsDraft.clearLinuxdoClientSecret ||
    settingsDraft.linuxdoOauthBaseUrl !== settings.linuxdoOauthBaseUrl ||
    settingsDraft.passkeyMode !== settings.passkeyMode ||
    settingsDraft.deletedUserMailboxRetentionDays !==
      settings.deletedUserMailboxRetentionDays;

  return (
    <div className="space-y-6">
      {section === "users" ? (
        <Card>
          <CardHeader className="space-y-4">
            <div className="space-y-1">
              <CardTitle>用户</CardTitle>
              <CardDescription>
                查看当前页账号、绑定状态与管理员转移入口。
              </CardDescription>
            </div>
            {userFiltersEnabled ? (
              <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_180px]">
                <div className="relative">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    value={userSearch}
                    onChange={(event) => {
                      setUserSearch(event.target.value);
                      setLocalUsersPage(1);
                    }}
                    className="pl-9"
                    placeholder="筛选当前页用户、用户名或绑定账号"
                    aria-label="筛选当前页用户"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="system-user-role-filter">角色</Label>
                  <Select
                    id="system-user-role-filter"
                    value={roleFilter}
                    onChange={(event) => {
                      setRoleFilter(
                        event.target.value as "all" | AdminUserRecord["role"],
                      );
                      setLocalUsersPage(1);
                    }}
                  >
                    <option value="all">全部角色</option>
                    <option value="admin">管理员</option>
                    <option value="member">成员</option>
                  </Select>
                </div>
              </div>
            ) : (
              <div className={`${feedbackCardClassName} text-muted-foreground`}>
                当前按服务端分页展示完整结果，暂不提供页内搜索或角色筛选。
              </div>
            )}
          </CardHeader>
          <CardContent>
            {isUsersLoading ? (
              <TableCardSkeleton
                className="border-0 shadow-none"
                columnCount={5}
                rowCount={5}
                testId="users-page-skeleton"
              />
            ) : (
              <>
                {userFiltersEnabled &&
                (normalizedUserSearch.length > 0 || roleFilter !== "all") ? (
                  <div
                    className={`${feedbackCardClassName} mb-5 flex items-center justify-between gap-3`}
                  >
                    <p className="text-muted-foreground">
                      当前筛出 {filteredUsers.length} 个用户。
                    </p>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="min-h-10"
                      onClick={() => {
                        setUserSearch("");
                        setRoleFilter("all");
                      }}
                    >
                      清除筛选
                    </Button>
                  </div>
                ) : null}
                {visibleUsers.length === 0 ? (
                  <div
                    className={`${feedbackCardClassName} flex items-center justify-between gap-3`}
                  >
                    <p className="text-muted-foreground">
                      {userFiltersEnabled
                        ? "当前页没有符合条件的用户。"
                        : "当前页没有用户。"}
                    </p>
                  </div>
                ) : null}
                <div className="space-y-3 md:hidden">
                  {visibleUsers.map((user) => {
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
                                <span className="text-muted-foreground">
                                  无
                                </span>
                              )}
                            </div>
                          </div>
                          <div className="grid gap-3 sm:grid-cols-2">
                            <div className="space-y-1">
                              <p className="text-xs font-medium text-muted-foreground">
                                Passkey
                              </p>
                              <p className="text-foreground">
                                {user.passkeyCount}
                              </p>
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
                        <TableHeaderCell>Passkey</TableHeaderCell>
                        <TableHeaderCell>状态</TableHeaderCell>
                        <TableHeaderCell className="text-right">
                          操作
                        </TableHeaderCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {visibleUsers.map((user) => {
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
                                <Badge
                                  className={roleBadgeClassName(user.role)}
                                >
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
                                disabled={
                                  !canTransfer || Boolean(user.deletedAt)
                                }
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
                  page={effectiveUsersPagination.page}
                  totalPages={effectiveUsersPagination.totalPages}
                  totalItems={effectiveUsersPagination.totalItems}
                  visibleRangeStart={
                    effectiveUsersPagination.totalItems === 0
                      ? 0
                      : (effectiveUsersPagination.page - 1) *
                          effectiveUsersPagination.pageSize +
                        1
                  }
                  visibleRangeEnd={
                    effectiveUsersPagination.totalItems === 0
                      ? 0
                      : (effectiveUsersPagination.page - 1) *
                          effectiveUsersPagination.pageSize +
                        visibleUsers.length
                  }
                  onPageChange={(page) => {
                    if (usersAreServerPaginated) {
                      onUsersPageChange(page);
                      return;
                    }
                    setLocalUsersPage(page);
                  }}
                />
              </>
            )}
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
            <CardTitle>邀请</CardTitle>
            <CardDescription>
              批量生成邀请码，并查看当前分页列表。
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            {inviteActionMessage ? (
              <div
                className={`${feedbackCardClassName} flex items-center gap-3 text-foreground`}
              >
                <CheckCircle2 className="h-4 w-4 shrink-0 text-primary" />
                <p>{inviteActionMessage}</p>
              </div>
            ) : null}
            {inviteActionError ? (
              <div
                className={`${feedbackCardClassName} flex items-center gap-3 text-destructive`}
              >
                <AlertTriangle className="h-4 w-4 shrink-0" />
                <p>{inviteActionError}</p>
              </div>
            ) : null}
            <form
              className="rounded-2xl border border-border/70 bg-background/60 p-4"
              onSubmit={(event) => {
                event.preventDefault();
                void handleCreateInvite();
              }}
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
                  <Button
                    type="submit"
                    className="h-11 w-full"
                    disabled={isCreatingInvite}
                  >
                    {isCreatingInvite ? "生成中…" : "批量生成邀请码"}
                  </Button>
                </div>
              </div>
            </form>

            {isInvitesLoading ? (
              <TableCardSkeleton
                columnCount={8}
                rowCount={5}
                testId="invites-page-skeleton"
              />
            ) : (
              <div className="rounded-2xl border border-border/70 bg-card">
                <div className="px-4 py-3 text-xs font-medium text-muted-foreground">
                  共 {invites.length} 个邀请码
                </div>
                <div className="md:hidden">
                  <div className="divide-y divide-border">
                    {visibleInvites.map((invite) => (
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
                  <Table>
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
                      {visibleInvites.map((invite) => (
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
                    page={effectiveInvitesPagination.page}
                    totalPages={effectiveInvitesPagination.totalPages}
                    totalItems={effectiveInvitesPagination.totalItems}
                    visibleRangeStart={
                      effectiveInvitesPagination.totalItems === 0
                        ? 0
                        : (effectiveInvitesPagination.page - 1) *
                            effectiveInvitesPagination.pageSize +
                          1
                    }
                    visibleRangeEnd={
                      effectiveInvitesPagination.totalItems === 0
                        ? 0
                        : (effectiveInvitesPagination.page - 1) *
                            effectiveInvitesPagination.pageSize +
                          visibleInvites.length
                    }
                    onPageChange={(page) => {
                      if (invitesAreServerPaginated) {
                        onInvitesPageChange(page);
                        return;
                      }
                      setLocalInvitesPage(page);
                    }}
                  />
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      ) : null}

      {section === "registration" ? (
        <Card>
          <CardHeader className="space-y-3">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div className="space-y-1">
                <CardTitle>注册设置</CardTitle>
                <CardDescription>
                  先看每个注册入口的当前状态，再按需展开配置。
                </CardDescription>
              </div>
              {docsLinks ? (
                <Button
                  asChild
                  variant="outline"
                  size="sm"
                  className="min-h-10 shrink-0"
                >
                  <a
                    href={docsLinks.oauthConfiguration}
                    target="_blank"
                    rel="noreferrer"
                  >
                    <ExternalLink className="h-3.5 w-3.5" />
                    OAuth 配置说明
                  </a>
                </Button>
              ) : null}
            </div>
            <div className="flex flex-wrap gap-2">
              <Badge className="border border-border bg-background/70 text-foreground">
                更新于 {formatDateTime(settings.updatedAt)}
              </Badge>
              {hasUnsavedSettings ? (
                <Badge className="border border-primary/40 bg-primary/10 text-primary">
                  有未保存更改
                </Badge>
              ) : null}
            </div>
          </CardHeader>
          <CardContent>
            {isSettingsLoading ? (
              <LoadingShellContainer data-testid="registration-settings-skeleton">
                <FormCardSkeleton fieldCount={4} />
                <FormCardSkeleton fieldCount={4} />
                <FormCardSkeleton fieldCount={2} />
              </LoadingShellContainer>
            ) : (
              <form
                className="space-y-6"
                onSubmit={(event) => {
                  event.preventDefault();
                  void handleSaveSettings();
                }}
              >
                {settingsMessage ? (
                  <div
                    className={`${feedbackCardClassName} flex items-center gap-3 text-foreground`}
                  >
                    <CheckCircle2 className="h-4 w-4 shrink-0 text-primary" />
                    <p>{settingsMessage}</p>
                  </div>
                ) : null}
                {settingsError ? (
                  <div
                    className={`${feedbackCardClassName} flex items-center gap-3 text-destructive`}
                  >
                    <AlertTriangle className="h-4 w-4 shrink-0" />
                    <p>{settingsError}</p>
                  </div>
                ) : null}

                <div className="space-y-4">
                  <div className={channelCardClassName}>
                    <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                      <div className="space-y-3">
                        <ChannelCardTitle icon={Github} title="GitHub" />
                        <div className="flex flex-wrap gap-2">
                          <Badge className="border border-border bg-background/70 text-foreground">
                            {modeLabel(settingsDraft.githubMode)}
                          </Badge>
                          <Badge className="border border-border bg-background/70 text-foreground">
                            上限 {settingsDraft.githubDailyLimit}
                          </Badge>
                          <Badge className="border border-border bg-background/70 text-foreground">
                            {providerConfigStatusLabel(
                              providerConfigured.github,
                            )}
                          </Badge>
                        </div>
                      </div>
                      <Button
                        type="button"
                        variant="outline"
                        className="min-h-11 shrink-0"
                        onClick={() =>
                          setExpandedProvider((current) =>
                            current === "github" ? null : "github",
                          )
                        }
                      >
                        {expandedProvider === "github" ? (
                          <ChevronUp className="mr-2 h-4 w-4" />
                        ) : (
                          <ChevronDown className="mr-2 h-4 w-4" />
                        )}
                        {expandedProvider === "github"
                          ? "收起配置"
                          : "展开配置"}
                      </Button>
                    </div>
                    {expandedProvider === "github" ? (
                      <div className="space-y-4 border-t border-border/70 pt-4">
                        <OAuthCallbackUrlField provider="github" />
                        <div className="space-y-2">
                          <Label htmlFor="github-mode">模式</Label>
                          <Select
                            id="github-mode"
                            value={settingsDraft.githubMode}
                            onChange={(event) =>
                              setSettingsDraft((current) => ({
                                ...current,
                                githubMode: event.target
                                  .value as RegistrationSettingsValues["githubMode"],
                              }))
                            }
                          >
                            <option value="off">关闭</option>
                            <option value="invite-only">仅邀请码</option>
                            <option value="open">开放</option>
                          </Select>
                        </div>
                        <SliderField
                          id="github-limit"
                          label="每日开放注册上限"
                          min={0}
                          max={100}
                          value={settingsDraft.githubDailyLimit}
                          onChange={(value) =>
                            setSettingsDraft((current) => ({
                              ...current,
                              githubDailyLimit: value,
                            }))
                          }
                        />
                        <div className="space-y-2">
                          <Label htmlFor="github-client-id">客户端 ID</Label>
                          <Input
                            id="github-client-id"
                            value={settingsDraft.githubClientId}
                            onChange={(event) =>
                              setSettingsDraft((current) => ({
                                ...current,
                                githubClientId: event.target.value,
                              }))
                            }
                          />
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="github-client-secret">
                            客户端密钥
                          </Label>
                          <Input
                            id="github-client-secret"
                            type="password"
                            autoComplete="new-password"
                            placeholder="输入新密钥"
                            value={settingsDraft.githubClientSecret}
                            onChange={(event) =>
                              setSettingsDraft((current) => ({
                                ...current,
                                githubClientSecret: event.target.value,
                                clearGithubClientSecret: false,
                              }))
                            }
                          />
                          <div className="flex justify-end">
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              className="min-h-10"
                              onClick={() =>
                                setSettingsDraft((current) => ({
                                  ...current,
                                  githubClientSecret: "",
                                  clearGithubClientSecret: true,
                                }))
                              }
                            >
                              清空已存密钥
                            </Button>
                          </div>
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="github-oauth-scopes">授权范围</Label>
                          <Input
                            id="github-oauth-scopes"
                            value={settingsDraft.githubOauthScopes}
                            onChange={(event) =>
                              setSettingsDraft((current) => ({
                                ...current,
                                githubOauthScopes: event.target.value,
                              }))
                            }
                          />
                        </div>
                      </div>
                    ) : null}
                  </div>

                  <div className={channelCardClassName}>
                    <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                      <div className="space-y-3">
                        <ChannelCardTitle
                          icon={LinuxDoIcon}
                          title="LinuxDO"
                          iconClassName="text-foreground"
                        />
                        <div className="flex flex-wrap gap-2">
                          <Badge className="border border-border bg-background/70 text-foreground">
                            {modeLabel(settingsDraft.linuxdoMode)}
                          </Badge>
                          <Badge className="border border-border bg-background/70 text-foreground">
                            上限 {settingsDraft.linuxdoDailyLimit}
                          </Badge>
                          <Badge className="border border-border bg-background/70 text-foreground">
                            {providerConfigStatusLabel(
                              providerConfigured.linuxdo,
                            )}
                          </Badge>
                        </div>
                      </div>
                      <Button
                        type="button"
                        variant="outline"
                        className="min-h-11 shrink-0"
                        onClick={() =>
                          setExpandedProvider((current) =>
                            current === "linuxdo" ? null : "linuxdo",
                          )
                        }
                      >
                        {expandedProvider === "linuxdo" ? (
                          <ChevronUp className="mr-2 h-4 w-4" />
                        ) : (
                          <ChevronDown className="mr-2 h-4 w-4" />
                        )}
                        {expandedProvider === "linuxdo"
                          ? "收起配置"
                          : "展开配置"}
                      </Button>
                    </div>
                    {expandedProvider === "linuxdo" ? (
                      <div className="space-y-4 border-t border-border/70 pt-4">
                        <OAuthCallbackUrlField provider="linuxdo" />
                        <div className="space-y-2">
                          <Label htmlFor="linuxdo-mode">模式</Label>
                          <Select
                            id="linuxdo-mode"
                            value={settingsDraft.linuxdoMode}
                            onChange={(event) =>
                              setSettingsDraft((current) => ({
                                ...current,
                                linuxdoMode: event.target
                                  .value as RegistrationSettingsValues["linuxdoMode"],
                              }))
                            }
                          >
                            <option value="off">关闭</option>
                            <option value="invite-only">仅邀请码</option>
                            <option value="open">开放</option>
                          </Select>
                        </div>
                        <SliderField
                          id="linuxdo-limit"
                          label="每日开放注册上限"
                          min={0}
                          max={100}
                          value={settingsDraft.linuxdoDailyLimit}
                          onChange={(value) =>
                            setSettingsDraft((current) => ({
                              ...current,
                              linuxdoDailyLimit: value,
                            }))
                          }
                        />
                        <div className="space-y-2">
                          <Label htmlFor="linuxdo-client-id">客户端 ID</Label>
                          <Input
                            id="linuxdo-client-id"
                            value={settingsDraft.linuxdoClientId}
                            onChange={(event) =>
                              setSettingsDraft((current) => ({
                                ...current,
                                linuxdoClientId: event.target.value,
                              }))
                            }
                          />
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="linuxdo-client-secret">
                            客户端密钥
                          </Label>
                          <Input
                            id="linuxdo-client-secret"
                            type="password"
                            autoComplete="new-password"
                            placeholder="输入新密钥"
                            value={settingsDraft.linuxdoClientSecret}
                            onChange={(event) =>
                              setSettingsDraft((current) => ({
                                ...current,
                                linuxdoClientSecret: event.target.value,
                                clearLinuxdoClientSecret: false,
                              }))
                            }
                          />
                          <div className="flex justify-end">
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              className="min-h-10"
                              onClick={() =>
                                setSettingsDraft((current) => ({
                                  ...current,
                                  linuxdoClientSecret: "",
                                  clearLinuxdoClientSecret: true,
                                }))
                              }
                            >
                              清空已存密钥
                            </Button>
                          </div>
                        </div>
                      </div>
                    ) : null}
                  </div>

                  <div className={channelCardClassName}>
                    <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                      <div className="space-y-3">
                        <ChannelCardTitle icon={Fingerprint} title="Passkey" />
                        <div className="flex flex-wrap gap-2">
                          <Badge className="border border-border bg-background/70 text-foreground">
                            {modeLabel(settingsDraft.passkeyMode)}
                          </Badge>
                          <Badge className="border border-border bg-background/70 text-foreground">
                            保留 {settingsDraft.deletedUserMailboxRetentionDays}{" "}
                            天
                          </Badge>
                          <Badge className="border border-border bg-background/70 text-foreground">
                            {providerConfigStatusLabel(
                              providerConfigured.passkey,
                            )}
                          </Badge>
                        </div>
                      </div>
                      <Button
                        type="button"
                        variant="outline"
                        className="min-h-11 shrink-0"
                        onClick={() =>
                          setExpandedProvider((current) =>
                            current === "passkey" ? null : "passkey",
                          )
                        }
                      >
                        {expandedProvider === "passkey" ? (
                          <ChevronUp className="mr-2 h-4 w-4" />
                        ) : (
                          <ChevronDown className="mr-2 h-4 w-4" />
                        )}
                        {expandedProvider === "passkey"
                          ? "收起配置"
                          : "展开配置"}
                      </Button>
                    </div>
                    {expandedProvider === "passkey" ? (
                      <div className="space-y-4 border-t border-border/70 pt-4">
                        <div className="space-y-2">
                          <Label htmlFor="passkey-mode">模式</Label>
                          <Select
                            id="passkey-mode"
                            value={settingsDraft.passkeyMode}
                            onChange={(event) =>
                              setSettingsDraft((current) => ({
                                ...current,
                                passkeyMode: event.target
                                  .value as RegistrationSettingsValues["passkeyMode"],
                              }))
                            }
                          >
                            <option value="off">关闭</option>
                            <option value="invite-only">仅邀请码</option>
                          </Select>
                        </div>
                        <SliderField
                          id="retention-days"
                          label="注销后邮箱保留天数"
                          min={0}
                          max={30}
                          value={settingsDraft.deletedUserMailboxRetentionDays}
                          onChange={(value) =>
                            setSettingsDraft((current) => ({
                              ...current,
                              deletedUserMailboxRetentionDays: value,
                            }))
                          }
                        />
                      </div>
                    ) : null}
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-3">
                  <Button
                    type="submit"
                    className="min-h-11"
                    disabled={isSavingSettings || !hasUnsavedSettings}
                  >
                    {isSavingSettings ? "保存中…" : "保存注册设置"}
                  </Button>
                  <p className="text-sm text-muted-foreground">
                    未填写的新密钥会保持现有配置，不会回显。
                  </p>
                </div>
              </form>
            )}
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
};
