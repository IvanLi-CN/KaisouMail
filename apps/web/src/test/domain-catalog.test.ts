import { describe, expect, it } from "vitest";

import {
  needsNameserverDelegation,
  resolveDomainCatalogPollingInterval,
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
        isDocumentVisible: true,
        isOnline: false,
      }),
    ).toBe(false);
  });
});
