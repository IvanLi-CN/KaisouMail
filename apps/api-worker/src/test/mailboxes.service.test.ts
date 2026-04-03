import { describe, expect, it } from "vitest";

import {
  classifyMailboxAddressState,
  resolveRequestedMailboxAddress,
} from "../services/mailboxes";

const baseMailbox = {
  id: "mbx_alpha",
  userId: "usr_1",
  localPart: "build",
  subdomain: "alpha",
  address: "build@alpha.707979.xyz",
  routingRuleId: "rule_alpha",
  status: "active",
  createdAt: "2026-04-03T12:00:00.000Z",
  expiresAt: "2026-04-03T13:00:00.000Z",
  destroyedAt: null,
} as const;

const memberUser = {
  id: "usr_1",
  email: "member@example.com",
  name: "Member",
  role: "member" as const,
};

const adminUser = {
  id: "usr_admin",
  email: "admin@example.com",
  name: "Admin",
  role: "admin" as const,
};

describe("mailbox service helpers", () => {
  it("reuses an active mailbox visible to the caller", () => {
    const result = classifyMailboxAddressState([baseMailbox], memberUser);
    expect(result.kind).toBe("reuse");
  });

  it("treats another user's active mailbox as a conflict", () => {
    const result = classifyMailboxAddressState(
      [{ ...baseMailbox, userId: "usr_2" }],
      memberUser,
    );
    expect(result.kind).toBe("conflict");
  });

  it("does not let admins reuse another user's active mailbox", () => {
    const result = classifyMailboxAddressState([baseMailbox], adminUser);
    expect(result.kind).toBe("conflict");
  });

  it("allows recreating an address when only destroyed mailboxes remain", () => {
    const result = classifyMailboxAddressState(
      [
        {
          ...baseMailbox,
          status: "destroyed" as const,
          destroyedAt: "2026-04-03T12:30:00.000Z",
          routingRuleId: null,
        },
      ],
      memberUser,
    );
    expect(result.kind).toBe("create");
  });

  it("parses an ensured address against the configured root domain", () => {
    expect(
      resolveRequestedMailboxAddress(
        {
          address: "Build@Ops.Alpha.707979.xyz",
        },
        "707979.xyz",
      ),
    ).toEqual({
      localPart: "build",
      subdomain: "ops.alpha",
      address: "build@ops.alpha.707979.xyz",
    });
  });

  it("builds an ensured address from localPart and subdomain", () => {
    expect(
      resolveRequestedMailboxAddress(
        {
          localPart: "Build",
          subdomain: "Ops.Alpha",
        },
        "707979.xyz",
      ),
    ).toEqual({
      localPart: "build",
      subdomain: "ops.alpha",
      address: "build@ops.alpha.707979.xyz",
    });
  });
});
