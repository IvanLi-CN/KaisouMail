import type { DomainCatalogItem } from "@/lib/contracts";
import { resolveAutoRefreshInterval } from "@/lib/message-refresh";

export const needsDomainBindingFollowUp = (domain: DomainCatalogItem) =>
  domain.bindingSource === "project_bind" &&
  (domain.cloudflareStatus === "pending" ||
    domain.projectStatus === "provisioning_error");

const hasDelegationPendingError = (domain: DomainCatalogItem) => {
  const normalized = domain.lastProvisionError?.toLowerCase() ?? "";

  return (
    normalized.includes("pending") ||
    normalized.includes("activation") ||
    normalized.includes("activate") ||
    normalized.includes("delegat") ||
    normalized.includes("nameserver") ||
    normalized.includes("name server")
  );
};

const hasDelegationRecoveryState = (domain: DomainCatalogItem) =>
  domain.bindingSource === "project_bind" &&
  ((domain.cloudflareStatus === "pending" && !domain.lastProvisionError) ||
    hasDelegationPendingError(domain));

export const needsNameserverDelegation = (domain: DomainCatalogItem) =>
  domain.nameServers.length > 0 && hasDelegationRecoveryState(domain);

export const shouldAutoRefreshDomainCatalogEntry = (
  domain: DomainCatalogItem,
) => hasDelegationRecoveryState(domain);

export const shouldPollDomainCatalog = (domains?: DomainCatalogItem[]) =>
  (domains ?? []).some(shouldAutoRefreshDomainCatalogEntry);

export const resolveDomainCatalogPollingInterval = ({
  domains,
  requestedIntervalMs,
  isDocumentVisible,
  isOnline,
}: {
  domains?: DomainCatalogItem[];
  requestedIntervalMs?: number;
  isDocumentVisible: boolean;
  isOnline: boolean;
}) => {
  if (!shouldPollDomainCatalog(domains)) return false;

  return resolveAutoRefreshInterval({
    requestedIntervalMs,
    isDocumentVisible,
    isOnline,
  });
};
