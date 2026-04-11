import { describe, expect, it } from "vitest";

import {
  hasDelegationRecoveryStatus,
  needsNameserverDelegation,
  resolveDomainCatalogPollingInterval,
  shouldAutoRefreshDomainCatalogEntry,
  shouldPollDomainCatalog,
} from "@/lib/domain-catalog";
import { demoDomainCatalog } from "@/mocks/data";

describe("domain catalog polling helpers", () => {
  it("detects project-bound domains that still need nameserver delegation", () => {
    const pendingDomain = demoDomainCatalog.find(
      (domain) => domain.rootDomain === "staging.example.dev",
    );
    const activeDomain = demoDomainCatalog.find(
      (domain) => domain.rootDomain === "mail.example.net",
    );

    expect(pendingDomain && needsNameserverDelegation(pendingDomain)).toBe(
      true,
    );
    expect(activeDomain && needsNameserverDelegation(activeDomain)).toBe(false);
  });

  it("enables polling only when there is at least one pending delegated domain", () => {
    expect(shouldPollDomainCatalog(demoDomainCatalog)).toBe(true);
    expect(
      shouldPollDomainCatalog(
        demoDomainCatalog.filter(
          (domain) => domain.rootDomain !== "staging.example.dev",
        ),
      ),
    ).toBe(false);

    expect(
      shouldPollDomainCatalog([
        {
          ...demoDomainCatalog[0],
          bindingSource: "project_bind",
          cloudflareStatus: "pending",
          projectStatus: "provisioning_error",
          nameServers: [],
        },
      ]),
    ).toBe(true);
  });

  it("does not auto-refresh permanent project-bind provisioning errors", () => {
    const permissionFailureDomain = {
      ...demoDomainCatalog[0],
      bindingSource: "project_bind" as const,
      cloudflareStatus: "pending" as const,
      projectStatus: "provisioning_error" as const,
      nameServers: ["amy.ns.cloudflare.com", "kai.ns.cloudflare.com"],
      lastProvisionError: "Zone access denied",
    };

    expect(needsNameserverDelegation(permissionFailureDomain)).toBe(false);
    expect(shouldAutoRefreshDomainCatalogEntry(permissionFailureDomain)).toBe(
      false,
    );
    expect(shouldPollDomainCatalog([permissionFailureDomain])).toBe(false);
  });

  it("stops delegation guidance once Cloudflare is no longer pending", () => {
    const delegatedDomain = {
      ...demoDomainCatalog[0],
      bindingSource: "project_bind" as const,
      cloudflareStatus: "active" as const,
      projectStatus: "provisioning_error" as const,
      nameServers: ["amy.ns.cloudflare.com", "kai.ns.cloudflare.com"],
      lastProvisionError:
        "Zone is pending activation in Cloudflare; retry after nameservers are delegated",
    };

    expect(needsNameserverDelegation(delegatedDomain)).toBe(false);
    expect(shouldAutoRefreshDomainCatalogEntry(delegatedDomain)).toBe(false);
    expect(shouldPollDomainCatalog([delegatedDomain])).toBe(false);
  });

  it("can keep delegation recovery guidance when the bind result has not been refreshed into the catalog yet", () => {
    expect(
      hasDelegationRecoveryStatus({
        cloudflareStatus: null,
        lastProvisionError:
          "Zone is pending activation in Cloudflare; retry after nameservers are delegated",
        allowMissingCloudflareStatus: true,
      }),
    ).toBe(true);
    expect(
      hasDelegationRecoveryStatus({
        cloudflareStatus: null,
        lastProvisionError:
          "Zone is pending activation in Cloudflare; retry after nameservers are delegated",
      }),
    ).toBe(false);
  });

  it("returns a polling interval only while the page is visible and online", () => {
    expect(
      resolveDomainCatalogPollingInterval({
        domains: demoDomainCatalog,
        requestedIntervalMs: 15_000,
        isDocumentVisible: true,
        isOnline: true,
      }),
    ).toBe(15_000);

    expect(
      resolveDomainCatalogPollingInterval({
        domains: demoDomainCatalog,
        requestedIntervalMs: 15_000,
        isDocumentVisible: false,
        isOnline: true,
      }),
    ).toBe(false);

    expect(
      resolveDomainCatalogPollingInterval({
        domains: demoDomainCatalog,
        requestedIntervalMs: 15_000,
        isDocumentVisible: false,
        isOnline: true,
        allowHidden: true,
      }),
    ).toBe(15_000);

    expect(
      resolveDomainCatalogPollingInterval({
        domains: demoDomainCatalog,
        requestedIntervalMs: 15_000,
        isDocumentVisible: true,
        isOnline: false,
      }),
    ).toBe(false);
  });
});
