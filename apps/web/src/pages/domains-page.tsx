import { RefreshCw } from "lucide-react";
import { Link } from "react-router-dom";
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
import { type PublicDocsLinks, publicDocsLinks } from "@/lib/public-docs";
import { appRoutes } from "@/lib/routes";

type DomainsPageViewProps = {
  domains: DomainCatalogItem[];
  isDomainBindingEnabled?: boolean;
  isDomainLifecycleEnabled?: boolean;
  docsLinks?: PublicDocsLinks | null;
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
  docsLinks = null,
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
      description="管理可接收邮件的域名、绑定状态和生命周期。"
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
          <DomainBindCard
            domains={domains}
            isPending={isBindPending}
            docsLinks={docsLinks}
            onSubmit={onBind}
          />
        ) : null}
        <DomainTable
          domains={domains}
          docsLinks={docsLinks}
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
        description="仅管理员可以管理邮箱域名。"
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
          description: "暂时无法获取域名目录，请重试后再继续操作。",
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
      docsLinks={publicDocsLinks}
      isBindPending={bindDomainMutation.isPending}
      isEnablePending={createDomainMutation.isPending}
      onBind={async (values) => {
        const boundDomain = await bindDomainMutation.mutateAsync(values);
        const refreshedCatalog = await domainCatalogQuery.refetch();
        return (
          refreshedCatalog.data?.find(
            (domain) => domain.rootDomain === boundDomain.rootDomain,
          ) ?? boundDomain
        );
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
