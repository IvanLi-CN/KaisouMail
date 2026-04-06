import { DomainBindCard } from "@/components/domains/domain-bind-card";
import { DomainTable } from "@/components/domains/domain-table";
import {
  ErrorState,
  type ErrorStateVariant,
} from "@/components/shared/error-state";
import { PageHeader } from "@/components/shared/page-header";
import { Button } from "@/components/ui/button";
import {
  useBindDomainMutation,
  useCreateDomainMutation,
  useDeleteDomainMutation,
  useDisableDomainMutation,
  useDomainCatalogQuery,
  useRetryDomainMutation,
} from "@/hooks/use-domains";
import { useMetaQuery } from "@/hooks/use-meta";
import { useSessionQuery } from "@/hooks/use-session";
import type { DomainCatalogItem } from "@/lib/contracts";
import { getErrorDetails } from "@/lib/error-utils";
import { appRoutes } from "@/lib/routes";
import { RefreshCw } from "lucide-react";
import { Link } from "react-router-dom";

type DomainsPageViewProps = {
  domains: DomainCatalogItem[];
  isDomainBindingEnabled?: boolean;
  isDomainLifecycleEnabled?: boolean;
  isBindPending?: boolean;
  isEnablePending?: boolean;
  error?: {
    variant: ErrorStateVariant;
    title: string;
    description: string;
    details?: string | null;
  } | null;
  onReload?: () => void;
  onBind: Parameters<typeof DomainBindCard>[0]["onSubmit"];
  onEnable: Parameters<typeof DomainTable>[0]["onEnable"];
  onDisable: Parameters<typeof DomainTable>[0]["onDisable"];
  onDelete: Parameters<typeof DomainTable>[0]["onDelete"];
  onRetry: Parameters<typeof DomainTable>[0]["onRetry"];
};

export const DomainsPageView = ({
  domains,
  isDomainBindingEnabled = true,
  isDomainLifecycleEnabled = true,
  isBindPending = false,
  isEnablePending = false,
  error = null,
  onReload,
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
    {error ? (
      <ErrorState
        variant={error.variant}
        title={error.title}
        description={error.description}
        details={error.details}
        primaryAction={
          onReload ? (
            <Button onClick={onReload}>
              <RefreshCw className="mr-2 h-4 w-4" />
              重新加载域名目录
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
      <>
        {isDomainBindingEnabled ? (
          <DomainBindCard isPending={isBindPending} onSubmit={onBind} />
        ) : null}
        <DomainTable
          domains={domains}
          isDomainLifecycleEnabled={isDomainLifecycleEnabled}
          isEnablePending={isEnablePending}
          onEnable={onEnable}
          onDisable={onDisable}
          onDelete={onDelete}
          onRetry={onRetry}
        />
      </>
    )}
  </div>
);

export const DomainsPage = () => {
  const sessionQuery = useSessionQuery();
  const metaQuery = useMetaQuery();
  const domainCatalogQuery = useDomainCatalogQuery();
  const bindDomainMutation = useBindDomainMutation();
  const createDomainMutation = useCreateDomainMutation();
  const deleteDomainMutation = useDeleteDomainMutation();
  const disableDomainMutation = useDisableDomainMutation();
  const retryDomainMutation = useRetryDomainMutation();
  const hasDomainCatalog = domainCatalogQuery.data !== undefined;

  if (sessionQuery.data?.user.role !== "admin") {
    return (
      <ErrorState
        variant="permission"
        title="需要管理员权限"
        description="只有 admin 才能接入、停用和重试邮箱域名。"
        secondaryAction={
          <Button asChild variant="outline">
            <Link to={appRoutes.workspace}>回到工作台</Link>
          </Button>
        }
      />
    );
  }

  if (domainCatalogQuery.error && !hasDomainCatalog) {
    return (
      <DomainsPageView
        domains={[]}
        error={{
          variant: "recoverable",
          title: "域名目录暂时加载失败",
          description:
            "Cloudflare 域名目录目前不可用，控制台不会把它误判成空列表。先重试一次，确认后再继续启用、绑定或停用域名。",
          details: getErrorDetails(domainCatalogQuery.error),
        }}
        onReload={() => {
          void domainCatalogQuery.refetch();
        }}
        onBind={async () => undefined}
        onEnable={async () => undefined}
        onDisable={async () => undefined}
        onDelete={async () => undefined}
        onRetry={async () => undefined}
      />
    );
  }

  return (
    <DomainsPageView
      domains={domainCatalogQuery.data ?? []}
      isDomainBindingEnabled={
        metaQuery.data?.cloudflareDomainBindingEnabled ?? false
      }
      isDomainLifecycleEnabled={
        metaQuery.data?.cloudflareDomainLifecycleEnabled ?? false
      }
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
