import { DomainBindCard } from "@/components/domains/domain-bind-card";
import { DomainTable } from "@/components/domains/domain-table";
import { EmptyState } from "@/components/shared/empty-state";
import { PageHeader } from "@/components/shared/page-header";
import {
  useBindDomainMutation,
  useCreateDomainMutation,
  useDeleteDomainMutation,
  useDisableDomainMutation,
  useDomainCatalogQuery,
  useRetryDomainMutation,
} from "@/hooks/use-domains";
import { useSessionQuery } from "@/hooks/use-session";
import type { DomainCatalogItem } from "@/lib/contracts";

type DomainsPageViewProps = {
  domains: DomainCatalogItem[];
  isBindPending?: boolean;
  isEnablePending?: boolean;
  onBind: Parameters<typeof DomainBindCard>[0]["onSubmit"];
  onEnable: Parameters<typeof DomainTable>[0]["onEnable"];
  onDisable: Parameters<typeof DomainTable>[0]["onDisable"];
  onDelete: Parameters<typeof DomainTable>[0]["onDelete"];
  onRetry: Parameters<typeof DomainTable>[0]["onRetry"];
};

export const DomainsPageView = ({
  domains,
  isBindPending = false,
  isEnablePending = false,
  onBind,
  onEnable,
  onDisable,
  onDelete,
  onRetry,
}: DomainsPageViewProps) => (
  <div className="space-y-6">
    <PageHeader
      title="邮箱域名"
      description="既支持从 Cloudflare 目录启用已有 zone，也支持直接通过 Cloudflare API 绑定新域名并在项目里管理删除。"
      eyebrow="Domains"
    />
    <DomainBindCard isPending={isBindPending} onSubmit={onBind} />
    <DomainTable
      domains={domains}
      isEnablePending={isEnablePending}
      onEnable={onEnable}
      onDisable={onDisable}
      onDelete={onDelete}
      onRetry={onRetry}
    />
  </div>
);

export const DomainsPage = () => {
  const sessionQuery = useSessionQuery();
  const domainCatalogQuery = useDomainCatalogQuery();
  const bindDomainMutation = useBindDomainMutation();
  const createDomainMutation = useCreateDomainMutation();
  const deleteDomainMutation = useDeleteDomainMutation();
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
      isBindPending={bindDomainMutation.isPending}
      isEnablePending={createDomainMutation.isPending}
      onBind={async (values) => {
        await bindDomainMutation.mutateAsync(values);
      }}
      onEnable={async (values) => {
        await createDomainMutation.mutateAsync(values);
      }}
      onDisable={async (domainId) => {
        await disableDomainMutation.mutateAsync(domainId);
      }}
      onDelete={async (domainId) => {
        await deleteDomainMutation.mutateAsync(domainId);
      }}
      onRetry={async (domainId) => {
        await retryDomainMutation.mutateAsync(domainId);
      }}
    />
  );
};
