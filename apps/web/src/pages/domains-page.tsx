import { DomainTable } from "@/components/domains/domain-table";
import { EmptyState } from "@/components/shared/empty-state";
import { PageHeader } from "@/components/shared/page-header";
import {
  useCreateDomainMutation,
  useDisableDomainMutation,
  useDomainCatalogQuery,
  useRetryDomainMutation,
} from "@/hooks/use-domains";
import { useSessionQuery } from "@/hooks/use-session";
import type { DomainCatalogItem } from "@/lib/contracts";

type DomainsPageViewProps = {
  domains: DomainCatalogItem[];
  isEnablePending?: boolean;
  onEnable: Parameters<typeof DomainTable>[0]["onEnable"];
  onDisable: (domainId: string) => void;
  onRetry: (domainId: string) => void;
};

export const DomainsPageView = ({
  domains,
  isEnablePending = false,
  onEnable,
  onDisable,
  onRetry,
}: DomainsPageViewProps) => (
  <div className="space-y-6">
    <PageHeader
      title="邮箱域名"
      description="Cloudflare 里先加域，控制台会实时发现并允许你在项目内启用、停用或重试接入。"
      eyebrow="Domains"
    />
    <DomainTable
      domains={domains}
      isEnablePending={isEnablePending}
      onEnable={onEnable}
      onDisable={onDisable}
      onRetry={onRetry}
    />
  </div>
);

export const DomainsPage = () => {
  const sessionQuery = useSessionQuery();
  const domainCatalogQuery = useDomainCatalogQuery();
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
      domains={domainCatalogQuery.data ?? []}
      isEnablePending={createDomainMutation.isPending}
      onEnable={async (values) => {
        await createDomainMutation.mutateAsync(values);
      }}
      onDisable={(domainId) => disableDomainMutation.mutate(domainId)}
      onRetry={(domainId) => retryDomainMutation.mutate(domainId)}
    />
  );
};
