import type { DomainCatalogItem } from "@/lib/contracts";
import { resolveAutoRefreshInterval } from "@/lib/message-refresh";

export const needsDomainBindingFollowUp = (domain: DomainCatalogItem) =>
  domain.bindingSource === "project_bind" &&
  (domain.cloudflareStatus === "pending" ||
    domain.projectStatus === "provisioning_error");

export const needsNameserverDelegation = (domain: DomainCatalogItem) =>
  needsDomainBindingFollowUp(domain) && domain.nameServers.length > 0;

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

export const shouldAutoRefreshDomainCatalogEntry = (
  domain: DomainCatalogItem,
) =>
  domain.bindingSource === "project_bind" &&
  (domain.cloudflareStatus === "pending" ||
    (domain.projectStatus === "provisioning_error" &&
      hasDelegationPendingError(domain)));

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
