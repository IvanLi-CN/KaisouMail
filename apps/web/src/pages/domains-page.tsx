import { DomainTable } from "@/components/domains/domain-table";
import { EmptyState } from "@/components/shared/empty-state";
import { PageHeader } from "@/components/shared/page-header";
import {
  useCreateDomainMutation,
  useDisableDomainMutation,
  useDomainsQuery,
  useRetryDomainMutation,
} from "@/hooks/use-domains";
import { useSessionQuery } from "@/hooks/use-session";
import type { DomainRecord } from "@/lib/contracts";

type DomainsPageViewProps = {
  domains: DomainRecord[];
  isCreatePending?: boolean;
  onCreate: Parameters<typeof DomainTable>[0]["onCreate"];
  onDisable: (domainId: string) => void;
  onRetry: (domainId: string) => void;
};

export const DomainsPageView = ({
  domains,
  isCreatePending = false,
  onCreate,
  onDisable,
  onRetry,
}: DomainsPageViewProps) => (
  <div className="space-y-6">
    <PageHeader
      title="邮箱域名"
      description="管理员可以把多个 Cloudflare 邮箱根域名接入同一套控制台，并统一分配给邮箱创建流程。"
      eyebrow="Domains"
    />
    <DomainTable
      domains={domains}
      isCreatePending={isCreatePending}
      onCreate={onCreate}
      onDisable={onDisable}
      onRetry={onRetry}
    />
  </div>
);

export const DomainsPage = () => {
  const sessionQuery = useSessionQuery();
  const domainsQuery = useDomainsQuery();
  const createDomainMutation = useCreateDomainMutation();
  const disableDomainMutation = useDisableDomainMutation();
  const retryDomainMutation = useRetryDomainMutation();

  if (sessionQuery.data?.user.role !== "admin") {
    return (
      <EmptyState
        title="需要管理员权限"
        description="只有 admin 才能接入、停用和重试邮箱域名。"
      />
    );
  }

  return (
    <DomainsPageView
      domains={domainsQuery.data ?? []}
      isCreatePending={createDomainMutation.isPending}
      onCreate={async (values) => {
        await createDomainMutation.mutateAsync(values);
      }}
      onDisable={(domainId) => disableDomainMutation.mutate(domainId)}
      onRetry={(domainId) => retryDomainMutation.mutate(domainId)}
    />
  );
};
