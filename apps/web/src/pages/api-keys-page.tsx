import { useQueryClient } from "@tanstack/react-query";
import { BookOpenText, RefreshCw } from "lucide-react";
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ApiKeyTable } from "@/components/api-keys/api-key-table";
import {
  ErrorState,
  type ErrorStateVariant,
} from "@/components/shared/error-state";
import { PageHeader } from "@/components/shared/page-header";
import { Button } from "@/components/ui/button";
import {
  useApiKeysQuery,
  useCreateApiKeyMutation,
  useRevokeApiKeyMutation,
} from "@/hooks/use-api-keys";
import { getErrorDetails } from "@/lib/error-utils";
import { appRoutes, latestApiKeySecretQueryKey } from "@/lib/routes";

type ApiKeysPageViewProps = {
  apiKeys: Parameters<typeof ApiKeyTable>[0]["apiKeys"];
  latestSecret?: string | null;
  error?: {
    variant: ErrorStateVariant;
    title: string;
    description: string;
    details?: string | null;
  } | null;
  onRetry?: () => void;
  onCreate: Parameters<typeof ApiKeyTable>[0]["onCreate"];
  onRevoke: Parameters<typeof ApiKeyTable>[0]["onRevoke"];
};

export const ApiKeysPageView = ({
  apiKeys,
  latestSecret,
  error = null,
  onRetry,
  onCreate,
  onRevoke,
}: ApiKeysPageViewProps) => {
  return (
    <div className="space-y-6">
      <PageHeader
        title="API Keys"
        description="每个用户都可以持有多把 API Key；Web 登录也通过它换取 session cookie。"
        eyebrow="Security"
        action={
          <Button asChild variant="outline">
            <Link to={appRoutes.apiKeysDocs}>
              <BookOpenText className="mr-2 h-4 w-4" />
              对接文档
            </Link>
          </Button>
        }
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
    </div>
  );
};

export const ApiKeysPage = () => {
  const apiKeysQuery = useApiKeysQuery();
  const createApiKeyMutation = useCreateApiKeyMutation();
  const revokeApiKeyMutation = useRevokeApiKeyMutation();
  const queryClient = useQueryClient();
  const hasApiKeysData = apiKeysQuery.data !== undefined;
  const [latestSecret, setLatestSecret] = useState<string | null>(
    () => queryClient.getQueryData<string>(latestApiKeySecretQueryKey) ?? null,
  );

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
      latestSecret={latestSecret}
      error={
        apiKeysQuery.error && !hasApiKeysData
          ? {
              variant: "recoverable",
              title: "API Keys 暂时加载失败",
              description:
                "密钥列表现在不可用，所以控制台不会把它显示成空表。你可以重新加载，或先打开对接文档继续查看接口说明。",
              details: getErrorDetails(apiKeysQuery.error),
            }
          : null
      }
      onRetry={() => {
        void apiKeysQuery.refetch();
      }}
      onCreate={async (values) => {
        const created = await createApiKeyMutation.mutateAsync(values);
        setLatestSecret(created.apiKey);
      }}
      onRevoke={(keyId) => revokeApiKeyMutation.mutate(keyId)}
    />
  );
};
