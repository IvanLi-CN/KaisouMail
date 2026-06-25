import { useQuery, useQueryClient } from "@tanstack/react-query";
import { BookOpenText, Link2, RefreshCw, UserRound } from "lucide-react";
import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { ApiKeyTable } from "@/components/api-keys/api-key-table";
import { PasskeyTable } from "@/components/passkeys/passkey-table";
import {
  ErrorState,
  type ErrorStateVariant,
} from "@/components/shared/error-state";
import { PageHeader } from "@/components/shared/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  useApiKeysQuery,
  useCreateApiKeyMutation,
  useRevokeApiKeyMutation,
} from "@/hooks/use-api-keys";
import {
  useCreatePasskeyMutation,
  usePasskeySupport,
  usePasskeysQuery,
  useRevokePasskeyMutation,
} from "@/hooks/use-passkeys";
import {
  useAccountQuery,
  useDeleteAccountMutation,
  useSessionQuery,
  useUpdateAccountMutation,
} from "@/hooks/use-session";
import { apiClient } from "@/lib/api";
import { getErrorDetails } from "@/lib/error-utils";
import { getPasskeyErrorMessage } from "@/lib/passkeys";
import { appRoutes, latestApiKeySecretQueryKey } from "@/lib/routes";

const identityTabs = [
  { id: "account", label: "Account" },
  { id: "connected-accounts", label: "Connected Accounts" },
  { id: "passkeys", label: "Passkeys" },
  { id: "api-keys", label: "API Keys" },
] as const;

export type IdentityAuthTab = (typeof identityTabs)[number]["id"];

const isIdentityAuthTab = (value: string | null): value is IdentityAuthTab =>
  identityTabs.some((tab) => tab.id === value);

type ApiKeysPageViewProps = {
  account: Awaited<ReturnType<typeof apiClient.getAccount>>["user"] | null;
  externalAccounts: Awaited<ReturnType<typeof apiClient.listExternalAccounts>>;
  apiKeys: Parameters<typeof ApiKeyTable>[0]["apiKeys"];
  passkeys: Parameters<typeof PasskeyTable>[0]["passkeys"];
  activeTab: IdentityAuthTab;
  nicknameDraft: string;
  onNicknameDraftChange: (value: string) => void;
  onAccountSave: () => void;
  onAccountDelete: () => void;
  onUnlinkExternalAccount: (externalAccountId: string) => void;
  onBindProvider: (provider: "github" | "linuxdo") => void;
  passkeyEmptyMessage?: string | null;
  passkeySupported: boolean;
  passkeyError?: string | null;
  passkeyPending?: boolean;
  latestSecret?: string | null;
  accountPending?: boolean;
  deletingAccount?: boolean;
  externalAccountPendingId?: string | null;
  error?: {
    variant: ErrorStateVariant;
    title: string;
    description: string;
    details?: string | null;
  } | null;
  passkeyLoadError?: {
    variant: ErrorStateVariant;
    title: string;
    description: string;
    details?: string | null;
  } | null;
  accountError?: string | null;
  onRetry?: () => void;
  onRetryPasskeys?: () => void;
  onActiveTabChange: (tab: IdentityAuthTab) => void;
  onCreate: Parameters<typeof ApiKeyTable>[0]["onCreate"];
  onRevoke: Parameters<typeof ApiKeyTable>[0]["onRevoke"];
  onCreatePasskey: Parameters<typeof PasskeyTable>[0]["onCreate"];
  onRevokePasskey: Parameters<typeof PasskeyTable>[0]["onRevoke"];
};

export const ApiKeysPageView = ({
  account,
  externalAccounts,
  apiKeys,
  passkeys,
  activeTab,
  nicknameDraft,
  onNicknameDraftChange,
  onAccountSave,
  onAccountDelete,
  onUnlinkExternalAccount,
  onBindProvider,
  passkeyEmptyMessage,
  passkeySupported,
  passkeyError,
  passkeyPending,
  latestSecret,
  accountPending,
  deletingAccount,
  externalAccountPendingId,
  error = null,
  passkeyLoadError = null,
  accountError = null,
  onRetry,
  onRetryPasskeys,
  onActiveTabChange,
  onCreate,
  onRevoke,
  onCreatePasskey,
  onRevokePasskey,
}: ApiKeysPageViewProps) => {
  return (
    <div className="space-y-8">
      <PageHeader
        title="身份认证"
        description="在同一页管理账号资料、第三方绑定、Passkeys 与 API Keys。用户名只读，昵称可编辑；第三方解绑与账号注销都会影响可用登录方式。"
        action={
          <Button asChild variant="outline" className="min-h-11">
            <Link to={appRoutes.apiKeysDocs}>
              <BookOpenText className="mr-2 h-4 w-4" />
              对接文档
            </Link>
          </Button>
        }
      />

      <Tabs
        value={activeTab}
        onValueChange={(value) => {
          if (isIdentityAuthTab(value)) {
            onActiveTabChange(value);
          }
        }}
        className="relative"
      >
        <div className="rounded-3xl border border-border/70 bg-card/20 px-4 py-5 sm:px-5 sm:py-6">
          <div className="relative z-10 flex justify-start">
            <TabsList
              aria-label="身份认证管理"
              className="grid h-auto w-full grid-cols-2 items-stretch justify-start gap-1 rounded-2xl border border-border/80 bg-background/80 p-1 sm:flex sm:w-auto sm:flex-wrap"
            >
              {identityTabs.map((tab) => (
                <TabsTrigger
                  key={tab.id}
                  value={tab.id}
                  className="min-h-11 min-w-0 whitespace-normal rounded-xl !border-transparent !bg-transparent px-3 py-2 text-center text-sm font-medium leading-5 sm:min-h-10 sm:whitespace-nowrap"
                >
                  {tab.label}
                </TabsTrigger>
              ))}
            </TabsList>
          </div>

          <div className="mt-4 rounded-2xl border border-border/70 bg-background/55 p-3 sm:p-5">
            <TabsContent value="account" className="mt-0">
              <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,0.8fr)]">
                <Card>
                  <CardHeader>
                    <CardTitle>Account</CardTitle>
                    <CardDescription>
                      用户名由系统生成且不可修改；昵称是唯一允许自助变更的身份字段。
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="space-y-2">
                      <Label htmlFor="account-username">用户名</Label>
                      <Input
                        id="account-username"
                        value={account ? `@${account.username}` : ""}
                        readOnly
                        disabled
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="account-nickname">昵称</Label>
                      <Input
                        id="account-nickname"
                        value={nicknameDraft}
                        onChange={(event) =>
                          onNicknameDraftChange(event.target.value)
                        }
                        disabled={!account || accountPending}
                      />
                      <p className="text-sm text-destructive">
                        {accountError ?? " "}
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-3">
                      <Button
                        className="min-h-11"
                        onClick={onAccountSave}
                        disabled={!account || accountPending}
                      >
                        {accountPending ? "保存中…" : "保存昵称"}
                      </Button>
                      <Button
                        variant="destructive"
                        className="min-h-11"
                        onClick={onAccountDelete}
                        disabled={!account || deletingAccount}
                      >
                        {deletingAccount ? "注销中…" : "注销账号"}
                      </Button>
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle>账号概览</CardTitle>
                    <CardDescription>当前会话与绑定状态概览。</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="rounded-2xl border border-border/70 bg-card p-4">
                      <div className="flex items-start gap-3">
                        <span className="flex h-11 w-11 items-center justify-center rounded-2xl border border-border bg-secondary text-primary">
                          <UserRound className="h-5 w-5" />
                        </span>
                        <div className="space-y-1">
                          <p className="font-medium text-foreground">
                            {account?.nickname ?? "-"}
                          </p>
                          <p className="text-sm text-muted-foreground">
                            @{account?.username ?? "-"}
                          </p>
                          <Badge className="mt-2 border border-border">
                            {account?.role ?? "member"}
                          </Badge>
                        </div>
                      </div>
                    </div>
                    <div className="grid gap-3 sm:grid-cols-3">
                      <div className="rounded-2xl border border-border/70 bg-card p-4">
                        <p className="text-xs font-medium text-muted-foreground">
                          Connected Accounts
                        </p>
                        <p className="mt-2 text-2xl font-semibold text-foreground">
                          {externalAccounts.length}
                        </p>
                      </div>
                      <div className="rounded-2xl border border-border/70 bg-card p-4">
                        <p className="text-xs font-medium text-muted-foreground">
                          Passkeys
                        </p>
                        <p className="mt-2 text-2xl font-semibold text-foreground">
                          {
                            passkeys.filter((passkey) => !passkey.revokedAt)
                              .length
                          }
                        </p>
                      </div>
                      <div className="rounded-2xl border border-border/70 bg-card p-4">
                        <p className="text-xs font-medium text-muted-foreground">
                          API Keys
                        </p>
                        <p className="mt-2 text-2xl font-semibold text-foreground">
                          {apiKeys.filter((apiKey) => !apiKey.revokedAt).length}
                        </p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </div>
            </TabsContent>

            <TabsContent value="connected-accounts" className="mt-0">
              <Card>
                <CardHeader>
                  <CardTitle>Connected Accounts</CardTitle>
                  <CardDescription>
                    每个用户每个 provider
                    最多一个活跃绑定。解绑最后一种交互式登录方式会被后端阻止。
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-5">
                  <div className="flex flex-wrap gap-3">
                    <Button
                      variant="outline"
                      className="min-h-11"
                      onClick={() => onBindProvider("github")}
                    >
                      <Link2 className="mr-2 h-4 w-4" />
                      绑定 GitHub
                    </Button>
                    <Button
                      variant="outline"
                      className="min-h-11"
                      onClick={() => onBindProvider("linuxdo")}
                    >
                      <Link2 className="mr-2 h-4 w-4" />
                      绑定 LinuxDO
                    </Button>
                  </div>
                  <div className="grid gap-4 lg:grid-cols-2">
                    {externalAccounts.map((account) => (
                      <div
                        key={account.id}
                        className="rounded-2xl border border-border/70 bg-card p-4"
                      >
                        <div className="flex items-start justify-between gap-4">
                          <div className="space-y-1">
                            <p className="text-sm font-semibold capitalize text-foreground">
                              {account.provider}
                            </p>
                            <p className="text-sm text-muted-foreground">
                              {account.providerUsername
                                ? `@${account.providerUsername}`
                                : account.providerUserId}
                            </p>
                            <p className="text-xs text-muted-foreground">
                              绑定于 {account.createdAt}
                            </p>
                          </div>
                          <Button
                            variant="outline"
                            size="sm"
                            className="min-h-11"
                            onClick={() => onUnlinkExternalAccount(account.id)}
                            disabled={externalAccountPendingId === account.id}
                          >
                            {externalAccountPendingId === account.id
                              ? "解绑中…"
                              : "解绑"}
                          </Button>
                        </div>
                      </div>
                    ))}
                    {externalAccounts.length === 0 ? (
                      <div className="rounded-2xl border border-dashed border-border/70 bg-card/50 p-6 text-sm text-muted-foreground">
                        当前还没有绑定任何第三方账号。
                      </div>
                    ) : null}
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="passkeys" className="mt-0">
              {passkeyLoadError ? (
                <ErrorState
                  variant={passkeyLoadError.variant}
                  title={passkeyLoadError.title}
                  description={passkeyLoadError.description}
                  details={passkeyLoadError.details}
                  primaryAction={
                    onRetryPasskeys ? (
                      <Button onClick={onRetryPasskeys}>
                        <RefreshCw className="mr-2 h-4 w-4" />
                        重新加载 Passkeys
                      </Button>
                    ) : undefined
                  }
                />
              ) : (
                <PasskeyTable
                  passkeys={passkeys}
                  passkeySupported={passkeySupported}
                  emptyMessage={passkeyEmptyMessage}
                  isPending={passkeyPending}
                  error={passkeyError}
                  onCreate={onCreatePasskey}
                  onRevoke={onRevokePasskey}
                />
              )}
            </TabsContent>

            <TabsContent value="api-keys" className="mt-0">
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
                        重新加载 API Keys
                      </Button>
                    ) : undefined
                  }
                  secondaryAction={
                    <Button asChild variant="outline">
                      <Link to={appRoutes.apiKeysDocs}>查看对接文档</Link>
                    </Button>
                  }
                />
              ) : (
                <ApiKeyTable
                  apiKeys={apiKeys}
                  latestSecret={latestSecret}
                  onCreate={onCreate}
                  onRevoke={onRevoke}
                />
              )}
            </TabsContent>
          </div>
        </div>
      </Tabs>
    </div>
  );
};

export const ApiKeysPage = () => {
  const _sessionQuery = useSessionQuery();
  const accountQuery = useAccountQuery();
  const externalAccountsQuery = useQuery({
    queryKey: ["account", "external-accounts"],
    queryFn: () => apiClient.listExternalAccounts(),
  });
  const apiKeysQuery = useApiKeysQuery();
  const passkeySupport = usePasskeySupport();
  const passkeysQuery = usePasskeysQuery();
  const createApiKeyMutation = useCreateApiKeyMutation();
  const revokeApiKeyMutation = useRevokeApiKeyMutation();
  const createPasskeyMutation = useCreatePasskeyMutation();
  const revokePasskeyMutation = useRevokePasskeyMutation();
  const updateAccountMutation = useUpdateAccountMutation();
  const deleteAccountMutation = useDeleteAccountMutation();
  const queryClient = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();
  const [latestSecret, setLatestSecret] = useState<string | null>(
    () => queryClient.getQueryData<string>(latestApiKeySecretQueryKey) ?? null,
  );
  const [nicknameDraft, setNicknameDraft] = useState("");
  const [accountError, setAccountError] = useState<string | null>(null);
  const [externalAccountPendingId, setExternalAccountPendingId] = useState<
    string | null
  >(null);
  const hasApiKeysData = apiKeysQuery.data !== undefined;
  const hasPasskeysData = passkeysQuery.data !== undefined;
  const requestedTab = searchParams.get("tab");
  const activeTab: IdentityAuthTab = isIdentityAuthTab(requestedTab)
    ? requestedTab
    : "account";

  useEffect(() => {
    const nextNickname = accountQuery.data?.user.nickname ?? "";
    setNicknameDraft(nextNickname);
  }, [accountQuery.data?.user.nickname]);

  useEffect(() => {
    if (latestSecret) {
      queryClient.setQueryData(latestApiKeySecretQueryKey, latestSecret);
      return;
    }

    void queryClient.removeQueries({
      queryKey: latestApiKeySecretQueryKey,
      exact: true,
    });
  }, [latestSecret, queryClient]);

  return (
    <ApiKeysPageView
      account={accountQuery.data?.user ?? null}
      externalAccounts={externalAccountsQuery.data ?? []}
      apiKeys={apiKeysQuery.data ?? []}
      passkeys={passkeysQuery.data ?? []}
      activeTab={activeTab}
      nicknameDraft={nicknameDraft}
      onNicknameDraftChange={setNicknameDraft}
      onAccountSave={() => {
        setAccountError(null);
        void updateAccountMutation
          .mutateAsync({ nickname: nicknameDraft })
          .catch((error: unknown) => {
            setAccountError(
              error instanceof Error ? error.message : "昵称更新失败",
            );
          });
      }}
      onAccountDelete={() => {
        setAccountError(null);
        void deleteAccountMutation.mutateAsync().catch((error: unknown) => {
          setAccountError(
            error instanceof Error ? error.message : "账号注销失败",
          );
        });
      }}
      onUnlinkExternalAccount={(externalAccountId) => {
        setExternalAccountPendingId(externalAccountId);
        void apiClient
          .unlinkExternalAccount(externalAccountId)
          .then(() =>
            queryClient.invalidateQueries({
              queryKey: ["account", "external-accounts"],
            }),
          )
          .catch((error: unknown) => {
            setAccountError(
              error instanceof Error ? error.message : "第三方解绑失败",
            );
          })
          .finally(() => {
            setExternalAccountPendingId(null);
          });
      }}
      onBindProvider={(provider) => {
        window.location.href = apiClient.getProviderStartUrl(provider, {
          intent: "bind",
        });
      }}
      passkeyEmptyMessage={passkeySupport.managementMessage}
      passkeySupported={passkeySupport.supported}
      passkeyError={
        createPasskeyMutation.error
          ? getPasskeyErrorMessage(
              createPasskeyMutation.error,
              "Passkey 注册失败",
            )
          : !passkeySupport.supported
            ? passkeySupport.message
            : null
      }
      passkeyPending={createPasskeyMutation.isPending}
      latestSecret={latestSecret}
      accountPending={updateAccountMutation.isPending}
      deletingAccount={deleteAccountMutation.isPending}
      externalAccountPendingId={externalAccountPendingId}
      accountError={accountError}
      error={
        apiKeysQuery.error && !hasApiKeysData
          ? {
              variant: "recoverable",
              title: "API Keys 暂时加载失败",
              description: "暂时无法获取密钥列表，请重新加载后再试。",
              details: getErrorDetails(apiKeysQuery.error),
            }
          : null
      }
      passkeyLoadError={
        passkeysQuery.error && !hasPasskeysData
          ? {
              variant: "recoverable",
              title: "Passkeys 暂时加载失败",
              description: "暂时无法获取 Passkey 列表，请重新加载后再试。",
              details: getErrorDetails(passkeysQuery.error),
            }
          : null
      }
      onRetry={() => {
        void apiKeysQuery.refetch();
      }}
      onRetryPasskeys={() => {
        void passkeysQuery.refetch();
      }}
      onActiveTabChange={(tab) => {
        setSearchParams((current) => {
          const next = new URLSearchParams(current);

          if (tab === "account") {
            next.delete("tab");
          } else {
            next.set("tab", tab);
          }

          return next;
        });
      }}
      onCreate={async (values) => {
        const created = await createApiKeyMutation.mutateAsync(values);
        setLatestSecret(created.apiKey);
      }}
      onRevoke={(keyId) => revokeApiKeyMutation.mutate(keyId)}
      onCreatePasskey={(name) => createPasskeyMutation.mutateAsync(name)}
      onRevokePasskey={(passkeyId) => revokePasskeyMutation.mutate(passkeyId)}
    />
  );
};
