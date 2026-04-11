import type { DomainCatalogItem, DomainRecord } from "@/lib/contracts";
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
  hasDelegationRecoveryState(domain);

const toTimestamp = (value?: string | null) => {
  if (!value) return null;

  const timestamp = Date.parse(value);
  return Number.isNaN(timestamp) ? null : timestamp;
};

export const isFreshDomainCatalogEntry = ({
  domain,
  result,
}: {
  domain: DomainCatalogItem;
  result: DomainRecord | DomainCatalogItem;
}) => {
  if (domain.rootDomain !== result.rootDomain) return false;

  const domainUpdatedAt = toTimestamp(domain.updatedAt);
  const resultUpdatedAt = toTimestamp(result.updatedAt);

  if (domainUpdatedAt !== null && resultUpdatedAt !== null) {
    return domainUpdatedAt >= resultUpdatedAt;
  }

  const resultProjectStatus =
    "projectStatus" in result ? result.projectStatus : result.status;

  return (
    domain.bindingSource === result.bindingSource &&
    domain.zoneId === result.zoneId &&
    domain.projectStatus === resultProjectStatus
  );
};

export const shouldAutoRefreshDomainCatalogEntry = (
  domain: DomainCatalogItem,
) => hasDelegationRecoveryState(domain);

export const shouldPollDomainCatalog = (domains?: DomainCatalogItem[]) =>
  (domains ?? []).some(shouldAutoRefreshDomainCatalogEntry);

export const buildFallbackBoundDomainCatalogEntry = (
  domain: DomainRecord,
): DomainCatalogItem | null => {
  if (
    domain.bindingSource !== "project_bind" ||
    domain.status !== "provisioning_error"
  ) {
    return null;
  }

  if (!hasDelegationPendingProvisionError(domain.lastProvisionError)) {
    return null;
  }

  return {
    id: domain.id,
    rootDomain: domain.rootDomain,
    zoneId: domain.zoneId,
    bindingSource: domain.bindingSource,
    cloudflareAvailability: "available",
    cloudflareStatus: "pending",
    nameServers: [],
    projectStatus: domain.status,
    lastProvisionError: domain.lastProvisionError,
    createdAt: domain.createdAt,
    updatedAt: domain.updatedAt,
    lastProvisionedAt: domain.lastProvisionedAt,
    disabledAt: domain.disabledAt,
  };
};

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
