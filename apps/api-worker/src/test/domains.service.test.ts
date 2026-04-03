import { describe, expect, it } from "vitest";

import { classifyDomainCreateState } from "../services/domains";

const baseDomain = {
  id: "dom_primary",
  rootDomain: "707979.xyz",
  zoneId: "zone_123",
  status: "active",
  lastProvisionError: null,
  createdAt: "2026-04-03T12:00:00.000Z",
  updatedAt: "2026-04-03T12:00:00.000Z",
  lastProvisionedAt: "2026-04-03T12:00:00.000Z",
  disabledAt: null,
} as const;

describe("domain create state", () => {
  it("creates a new record when the root domain is unknown", () => {
    expect(classifyDomainCreateState(null)).toEqual({ kind: "create" });
  });

  it("blocks duplicates while the domain is active", () => {
    const result = classifyDomainCreateState(baseDomain);
    expect(result.kind).toBe("conflict");
  });

  it("reuses non-active records so admins can repair the zone id", () => {
    const result = classifyDomainCreateState({
      ...baseDomain,
      status: "provisioning_error",
      lastProvisionError: "Zone access denied",
      lastProvisionedAt: null,
    });
    expect(result.kind).toBe("replace");
  });
});
