import type { DomainCatalogItem } from "@/lib/contracts";
import { resolveAutoRefreshInterval } from "@/lib/message-refresh";

export const needsDomainBindingFollowUp = (domain: DomainCatalogItem) =>
  domain.bindingSource === "project_bind" &&
  (domain.cloudflareStatus === "pending" ||
    domain.projectStatus === "provisioning_error");

export const hasDelegationPendingProvisionError = (
  lastProvisionError?: string | null,
) => {
  const normalized = lastProvisionError?.toLowerCase() ?? "";
  return (
    normalized.includes("pending") ||
    normalized.includes("activation") ||
    normalized.includes("activate") ||
    normalized.includes("delegat") ||
    normalized.includes("nameserver") ||
    normalized.includes("name server")
  );
};

export const hasDelegationRecoveryStatus = ({
  cloudflareStatus,
  lastProvisionError,
  allowMissingCloudflareStatus = false,
}: {
  cloudflareStatus?: string | null;
  lastProvisionError?: string | null;
  allowMissingCloudflareStatus?: boolean;
}) =>
  (cloudflareStatus === "pending" ||
    (allowMissingCloudflareStatus && !cloudflareStatus)) &&
  (!lastProvisionError ||
    hasDelegationPendingProvisionError(lastProvisionError));

const hasDelegationRecoveryState = (domain: DomainCatalogItem) =>
  domain.bindingSource === "project_bind" &&
  hasDelegationRecoveryStatus({
    cloudflareStatus: domain.cloudflareStatus,
    lastProvisionError: domain.lastProvisionError,
  });

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
  allowHidden = false,
}: {
  domains?: DomainCatalogItem[];
  requestedIntervalMs?: number;
  isDocumentVisible: boolean;
  isOnline: boolean;
  allowHidden?: boolean;
}) => {
  if (!shouldPollDomainCatalog(domains)) return false;

  return resolveAutoRefreshInterval({
    requestedIntervalMs,
    isDocumentVisible: allowHidden ? true : isDocumentVisible,
    isOnline,
  });
};
