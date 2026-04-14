import type {
  CloudflareSync,
  DomainCatalogItem,
  DomainRecord,
} from "@/lib/contracts";
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
    normalized.includes("pending activation") ||
    (normalized.includes("pending") && normalized.includes("zone")) ||
    normalized.includes("delegat") ||
    normalized.includes("nameserver") ||
    normalized.includes("name server")
  );
};

const getDomainResultProjectStatus = (
  result: DomainRecord | DomainCatalogItem,
) => ("projectStatus" in result ? result.projectStatus : result.status);

const getDomainResultCloudflareStatus = (
  result: DomainRecord | DomainCatalogItem,
) => ("cloudflareStatus" in result ? result.cloudflareStatus : null);

const getDomainResultCatchAllEnabled = (
  result: DomainRecord | DomainCatalogItem,
) => result.catchAllEnabled ?? false;

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

  if (domain.bindingSource !== result.bindingSource) return false;
  if (domain.zoneId !== result.zoneId) return false;
  if (domain.catchAllEnabled !== getDomainResultCatchAllEnabled(result)) {
    return false;
  }

  const domainUpdatedAt = toTimestamp(domain.updatedAt);
  const resultUpdatedAt = toTimestamp(result.updatedAt);
  const resultProjectStatus = getDomainResultProjectStatus(result);
  const resultCloudflareStatus = getDomainResultCloudflareStatus(result);

  if (
    (domain.projectStatus === "active" && resultProjectStatus !== "active") ||
    (domain.cloudflareStatus === "active" &&
      resultCloudflareStatus !== "active") ||
    (!domain.lastProvisionError && !!result.lastProvisionError)
  ) {
    return true;
  }

  if (domainUpdatedAt !== null && resultUpdatedAt !== null) {
    return domainUpdatedAt >= resultUpdatedAt;
  }

  return domain.projectStatus === resultProjectStatus;
};

export const shouldAutoRefreshDomainCatalogEntry = (
  domain: DomainCatalogItem,
) => hasDelegationRecoveryState(domain);

export const shouldPollDomainCatalog = (domains?: DomainCatalogItem[]) =>
  (domains ?? []).some(shouldAutoRefreshDomainCatalogEntry);

export const buildFallbackBoundDomainCatalogEntry = (
  domain: DomainRecord,
): DomainCatalogItem | null => {
  if (domain.bindingSource !== "project_bind") {
    return null;
  }

  const projectStatus = domain.status;
  if (projectStatus !== "active" && projectStatus !== "provisioning_error") {
    return null;
  }

  const cloudflareStatus =
    projectStatus === "active"
      ? "active"
      : hasDelegationPendingProvisionError(domain.lastProvisionError)
        ? "pending"
        : null;

  return {
    id: domain.id,
    rootDomain: domain.rootDomain,
    zoneId: domain.zoneId,
    bindingSource: domain.bindingSource,
    cloudflareAvailability: "available",
    cloudflareStatus,
    nameServers: [],
    projectStatus,
    catchAllEnabled: domain.catchAllEnabled ?? false,
    lastProvisionError: domain.lastProvisionError,
    createdAt: domain.createdAt,
    updatedAt: domain.updatedAt,
    lastProvisionedAt: domain.lastProvisionedAt,
    disabledAt: domain.disabledAt,
  };
};

export const resolveDomainCatalogPollingInterval = ({
  domains,
  cloudflareSync,
  requestedIntervalMs,
  isDocumentVisible,
  isOnline,
}: {
  domains?: DomainCatalogItem[];
  cloudflareSync?: CloudflareSync | null;
  requestedIntervalMs?: number;
  isDocumentVisible: boolean;
  isOnline: boolean;
}) => {
  if (cloudflareSync?.status === "rate_limited") {
    if (!isDocumentVisible || !isOnline) return false;
    return cloudflareSync.retryAfterSeconds
      ? cloudflareSync.retryAfterSeconds * 1000
      : false;
  }

  if (!shouldPollDomainCatalog(domains)) return false;

  return resolveAutoRefreshInterval({
    requestedIntervalMs,
    isDocumentVisible,
    isOnline,
  });
};
