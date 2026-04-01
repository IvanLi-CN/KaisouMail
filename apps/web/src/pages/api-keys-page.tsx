import { useState } from "react";

import { ApiKeyTable } from "@/components/api-keys/api-key-table";
import { PageHeader } from "@/components/shared/page-header";
import {
  useApiKeysQuery,
  useCreateApiKeyMutation,
  useRevokeApiKeyMutation,
} from "@/hooks/use-api-keys";

export const ApiKeysPage = () => {
  const apiKeysQuery = useApiKeysQuery();
  const createApiKeyMutation = useCreateApiKeyMutation();
  const revokeApiKeyMutation = useRevokeApiKeyMutation();
  const [latestSecret, setLatestSecret] = useState<string | null>(null);

  return (
    <div className="space-y-6">
      <PageHeader
        title="API Keys"
        description="每个用户都可以持有多把 API Key；Web 登录也通过它换取 session cookie。"
        eyebrow="Security"
      />
      <ApiKeyTable
        apiKeys={apiKeysQuery.data ?? []}
        latestSecret={latestSecret}
        onCreate={async (values) => {
          const created = await createApiKeyMutation.mutateAsync(values);
          setLatestSecret(created.apiKey);
        }}
        onRevoke={(keyId) => revokeApiKeyMutation.mutate(keyId)}
      />
    </div>
  );
};
