import { useQueryClient } from "@tanstack/react-query";
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
  domainCatalogQueryKey,
  useBindDomainMutation,
  useCreateDomainMutation,
  useDeleteDomainMutation,
  useDisableDomainCatchAllMutation,
  useDisableDomainMutation,
  useDomainCatalogQuery,
  useEnableDomainCatchAllMutation,
  useRetryDomainMutation,
} from "@/hooks/use-domains";
import { useMetaQuery } from "@/hooks/use-meta";
import { useSessionQuery } from "@/hooks/use-session";
import { getCloudflareRateLimitBannerCopy } from "@/lib/cloudflare-rate-limit";
import type {
  CloudflareSync,
  DomainCatalogItem,
  DomainCatalogResponse,
} from "@/lib/contracts";
import {
  buildFallbackBoundDomainCatalogEntry,
  isFreshDomainCatalogEntry,
} from "@/lib/domain-catalog";
import { getErrorDetails } from "@/lib/error-utils";
import { formatDateTime } from "@/lib/format";
import { type PublicDocsLinks, publicDocsLinks } from "@/lib/public-docs";
import { appRoutes } from "@/lib/routes";

type DomainsPageViewProps = {
  domains: DomainCatalogItem[];
  cloudflareSync?: CloudflareSync | null;
  isDomainBindingEnabled?: boolean;
  isDomainLifecycleEnabled?: boolean;
  docsLinks?: PublicDocsLinks | null;
  isBindPending?: boolean;
  isEnablePending?: boolean;
  isCatchAllPending?: boolean;
  isCatchAllManagementEnabled?: boolean;
  isCatchAllEnablementEnabled?: boolean;
  error?: {
    variant: ErrorStateVariant;
    title: string;
    description: string;
    details?: string | null;
  } | null;
  onReload?: () => void;
  onBind: (values: {
    mailDomain: string;
    rootDomain?: string;
  }) => Promise<unknown> | unknown;
  onEnable: (values: {
    mailDomain: string;
    zoneId: string;
    rootDomain?: string;
  }) => Promise<unknown> | unknown;
  onDisable: (domainId: string) => Promise<unknown> | unknown;
  onDelete: (domainId: string) => Promise<unknown> | unknown;
  onRetry: (domainId: string) => Promise<unknown> | unknown;
  onEnableCatchAll?: (domainId: string) => Promise<unknown> | unknown;
  onDisableCatchAll?: (domainId: string) => Promise<unknown> | unknown;
};

export const DomainsPageView = ({
  domains,
  cloudflareSync = null,
  isDomainBindingEnabled = true,
  isDomainLifecycleEnabled = true,
  docsLinks = null,
  isBindPending = false,
  isEnablePending = false,
  isCatchAllPending = false,
  isCatchAllManagementEnabled = true,
  isCatchAllEnablementEnabled = true,
  error = null,
  onReload,
  onBind,
  onEnable,
  onDisable,
  onDelete,
  onRetry,
  onEnableCatchAll = async () => undefined,
  onDisableCatchAll = async () => undefined,
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
        {cloudflareSync?.status === "rate_limited" ? (
          <div
            className="rounded-2xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-100"
            data-testid="domain-catalog-rate-limit-banner"
          >
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="space-y-1">
                <p className="font-medium">Cloudflare 域名目录正在冷却</p>
                <p className="text-xs leading-5 text-amber-100/90">
                  当前先展示项目内已知域名；Cloudflare 实时目录暂时不可用。
                  {cloudflareSync.retryAfter
                    ? `预计可在 ${formatDateTime(cloudflareSync.retryAfter)} 后重试。`
                    : "请稍后再试。"}
                </p>
                {getCloudflareRateLimitBannerCopy(cloudflareSync) ? (
                  <p className="text-xs leading-5 text-amber-100/80">
                    {getCloudflareRateLimitBannerCopy(cloudflareSync)}
                  </p>
                ) : null}
              </div>
              {onReload ? (
                <Button size="sm" variant="outline" onClick={onReload}>
                  <RefreshCw className="mr-2 h-4 w-4" />
                  立即重试
                </Button>
              ) : null}
            </div>
          </div>
        ) : null}
        {isDomainBindingEnabled ? (
          <DomainBindCard
            domains={domains}
            isPending={isBindPending}
            isCatalogLive={cloudflareSync?.status !== "rate_limited"}
            docsLinks={docsLinks}
            onSubmit={
              onBind as Parameters<typeof DomainBindCard>[0]["onSubmit"]
            }
          />
        ) : null}
        <DomainTable
          domains={domains}
          docsLinks={docsLinks}
          isCatchAllPending={isCatchAllPending}
          isCatchAllManagementEnabled={isCatchAllManagementEnabled}
          isCatchAllEnablementEnabled={isCatchAllEnablementEnabled}
          isDomainLifecycleEnabled={isDomainLifecycleEnabled}
          isEnablePending={isEnablePending}
          onEnable={async (values) => {
            await onEnable(values);
          }}
          onDisable={async (domainId) => {
            await onDisable(domainId);
          }}
          onDelete={async (domainId) => {
            await onDelete(domainId);
          }}
          onRetry={async (domainId) => {
            await onRetry(domainId);
          }}
          onEnableCatchAll={async (domainId) => {
            await onEnableCatchAll(domainId);
          }}
          onDisableCatchAll={async (domainId) => {
            await onDisableCatchAll(domainId);
          }}
        />
      </>
    )}
  </div>
);

export const DomainsPage = () => {
  const queryClient = useQueryClient();
  const sessionQuery = useSessionQuery();
  const metaQuery = useMetaQuery();
  const domainCatalogQuery = useDomainCatalogQuery();
  const bindDomainMutation = useBindDomainMutation();
  const createDomainMutation = useCreateDomainMutation();
  const deleteDomainMutation = useDeleteDomainMutation();
  const disableDomainMutation = useDisableDomainMutation();
  const enableDomainCatchAllMutation = useEnableDomainCatchAllMutation();
  const disableDomainCatchAllMutation = useDisableDomainCatchAllMutation();
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
        onEnableCatchAll={async () => undefined}
        onDisableCatchAll={async () => undefined}
      />
    );
  }

  return (
    <DomainsPageView
      domains={domainCatalogQuery.data?.domains ?? []}
      cloudflareSync={domainCatalogQuery.data?.cloudflareSync ?? null}
      isDomainBindingEnabled={
        metaQuery.data?.cloudflareDomainBindingEnabled ?? false
      }
      isDomainLifecycleEnabled={
        metaQuery.data?.cloudflareDomainLifecycleEnabled ?? false
      }
      docsLinks={publicDocsLinks}
      isBindPending={bindDomainMutation.isPending}
      isEnablePending={createDomainMutation.isPending}
      isCatchAllPending={
        enableDomainCatchAllMutation.isPending ||
        disableDomainCatchAllMutation.isPending
      }
      isCatchAllManagementEnabled={
        metaQuery.data?.cloudflareCatchAllManagementEnabled ?? false
      }
      isCatchAllEnablementEnabled={
        metaQuery.data?.cloudflareCatchAllEnablementEnabled ?? false
      }
      onBind={async (values) => {
        const boundDomain = await bindDomainMutation.mutateAsync(values);
        const refreshedCatalog = await domainCatalogQuery.refetch();
        const refreshedMatch = refreshedCatalog.data?.domains.find((domain) =>
          isFreshDomainCatalogEntry({ domain, result: boundDomain }),
        );
        if (refreshedMatch) return refreshedMatch;

        const fallbackCatalogEntry =
          buildFallbackBoundDomainCatalogEntry(boundDomain);
        if (fallbackCatalogEntry) {
          queryClient.setQueryData<DomainCatalogResponse>(
            domainCatalogQueryKey,
            (current) => {
              const currentDomains = current?.domains ?? [];
              const currentIndex = currentDomains.findIndex(
                (domain) =>
                  domain.rootDomain === fallbackCatalogEntry.rootDomain,
              );

              if (currentIndex >= 0) {
                return {
                  domains: currentDomains.map((domain, index) =>
                    index === currentIndex ? fallbackCatalogEntry : domain,
                  ),
                  cloudflareSync: current?.cloudflareSync ?? {
                    status: "live",
                    retryAfter: null,
                    retryAfterSeconds: null,
                    rateLimitContext: null,
                  },
                };
              }

              return {
                domains: [fallbackCatalogEntry, ...currentDomains],
                cloudflareSync: current?.cloudflareSync ?? {
                  status: "live",
                  retryAfter: null,
                  retryAfterSeconds: null,
                  rateLimitContext: null,
                },
              };
            },
          );
          return fallbackCatalogEntry;
        }

        return boundDomain;
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
      onEnableCatchAll={async (domainId) => {
        await enableDomainCatchAllMutation.mutateAsync(domainId);
      }}
      onDisableCatchAll={async (domainId) => {
        await disableDomainCatchAllMutation.mutateAsync(domainId);
      }}
    />
  );
};
