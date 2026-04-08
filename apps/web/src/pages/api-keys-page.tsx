import { useQueryClient } from "@tanstack/react-query";
import { BookOpenText, RefreshCw } from "lucide-react";
import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";

import { ApiKeyTable } from "@/components/api-keys/api-key-table";
import {
  type IdentityAuthTab,
  IdentityAuthTabsList,
  isIdentityAuthTab,
} from "@/components/identity/identity-auth-tabs";
import { PasskeyTable } from "@/components/passkeys/passkey-table";
import { PageHeader } from "@/components/shared/page-header";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent } from "@/components/ui/tabs";
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
import { getPasskeyErrorMessage } from "@/lib/passkeys";
import { appRoutes, latestApiKeySecretQueryKey } from "@/lib/routes";

export type { IdentityAuthTab } from "@/components/identity/identity-auth-tabs";

type ApiKeysPageViewProps = {
  apiKeys: Parameters<typeof ApiKeyTable>[0]["apiKeys"];
  passkeys: Parameters<typeof PasskeyTable>[0]["passkeys"];
  activeTab: IdentityAuthTab;
  passkeyEmptyMessage?: string | null;
  passkeySupported: boolean;
  passkeyError?: string | null;
  passkeyPending?: boolean;
  latestSecret?: string | null;
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
  onRetry?: () => void;
  onRetryPasskeys?: () => void;
  onActiveTabChange: (tab: IdentityAuthTab) => void;
  onCreate: Parameters<typeof ApiKeyTable>[0]["onCreate"];
  onRevoke: Parameters<typeof ApiKeyTable>[0]["onRevoke"];
  onCreatePasskey: Parameters<typeof PasskeyTable>[0]["onCreate"];
  onRevokePasskey: Parameters<typeof PasskeyTable>[0]["onRevoke"];
};

export const ApiKeysPageView = ({
  apiKeys,
  passkeys,
  activeTab,
  passkeyEmptyMessage,
  passkeySupported,
  passkeyError,
  passkeyPending,
  latestSecret,
  error = null,
  passkeyLoadError = null,
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
        description="在同一页管理浏览器 Passkey 与自动化 API Key：Passkey 负责控制台登录，API Key 继续服务自动化、应急恢复与 Bearer 调用。"
        eyebrow="Identity"
        action={
          <Button asChild variant="outline">
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
        <div className="rounded-[30px] border border-white/8 bg-card/[0.16] px-5 py-6 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] sm:px-6">
          <div className="relative z-10 flex justify-start">
            <IdentityAuthTabsList />
          </div>

          <div className="mt-4 rounded-[28px] border border-white/8 bg-background/40 p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.03)] sm:p-5">
            <TabsContent value="api-keys" className="mt-0">
              <ApiKeyTable
                apiKeys={apiKeys}
                latestSecret={latestSecret}
                onCreate={onCreate}
                onRevoke={onRevoke}
              />
            </TabsContent>

            <TabsContent value="passkey" className="mt-0">
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
                  secondaryAction={
                    <Button asChild variant="outline">
                      <Link to={appRoutes.apiKeysDocs}>查看对接文档</Link>
                    </Button>
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
          </div>
        </div>
      </Tabs>
    </div>
  );
};

export const ApiKeysPage = () => {
  const apiKeysQuery = useApiKeysQuery();
  const passkeySupport = usePasskeySupport();
  const passkeysQuery = usePasskeysQuery(passkeySupport.backendConfigured);
  const createApiKeyMutation = useCreateApiKeyMutation();
  const revokeApiKeyMutation = useRevokeApiKeyMutation();
  const createPasskeyMutation = useCreatePasskeyMutation();
  const revokePasskeyMutation = useRevokePasskeyMutation();
  const queryClient = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();
  const hasApiKeysData = apiKeysQuery.data !== undefined;
  const hasPasskeysData = passkeysQuery.data !== undefined;
  const [latestSecret, setLatestSecret] = useState<string | null>(
    () => queryClient.getQueryData<string>(latestApiKeySecretQueryKey) ?? null,
  );
  const requestedTab = searchParams.get("tab");
  const activeTab: IdentityAuthTab = isIdentityAuthTab(requestedTab)
    ? requestedTab
    : "api-keys";

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
      apiKeys={apiKeysQuery.data ?? []}
      passkeys={passkeysQuery.data ?? []}
      activeTab={activeTab}
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
        passkeySupport.backendConfigured &&
        passkeysQuery.error &&
        !hasPasskeysData
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
        if (passkeySupport.backendConfigured) {
          void passkeysQuery.refetch();
        }
      }}
      onActiveTabChange={(tab) => {
        setSearchParams((current) => {
          const next = new URLSearchParams(current);

          if (tab === "api-keys") {
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
