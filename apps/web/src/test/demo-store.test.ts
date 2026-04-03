import { beforeEach, describe, expect, it } from "vitest";

import { demoApi } from "@/lib/demo-store";

describe("demoApi", () => {
  beforeEach(() => {
    demoApi.reset();
  });

  it("creates and destroys a mailbox lifecycle", async () => {
    const created = await demoApi.createMailbox({
      subdomain: "ops.alpha",
      rootDomain: "707979.xyz",
      expiresInMinutes: 60,
    });
    expect(created.status).toBe("active");
    expect(created.address).toContain("@ops.alpha.707979.xyz");

    const listed = await demoApi.listMailboxes();
    expect(listed.some((mailbox) => mailbox.id === created.id)).toBe(true);

    const destroyed = await demoApi.destroyMailbox(created.id);
    expect(destroyed.status).toBe("destroyed");
    expect(destroyed.routingRuleId).toBeNull();
  });

  it("reuses active mailboxes through ensure and recreates destroyed addresses", async () => {
    const reused = await demoApi.ensureMailbox({
      address: "build@alpha.707979.xyz",
    });
    expect(reused.id).toBe("mbx_alpha");

    const created = await demoApi.createMailbox({
      localPart: "qa",
      subdomain: "team.gamma",
      rootDomain: "mail.example.net",
      expiresInMinutes: 30,
    });
    await demoApi.destroyMailbox(created.id);

    const recreated = await demoApi.ensureMailbox({
      address: created.address,
      expiresInMinutes: 30,
    });
    expect(recreated.id).not.toBe(created.id);
    expect(recreated.status).toBe("active");
    expect(recreated.address).toBe(created.address);
  });

  it("exposes meta and filters messages by cursor aliases", async () => {
    const meta = await demoApi.getMeta();
    expect(meta.domains).toContain("707979.xyz");

    const messages = await demoApi.listMessages([], {
      after: "2026-04-01T08:35:00.000Z",
      since: "2026-04-01T08:31:00.000Z",
    });
    expect(messages).toHaveLength(1);
    expect(messages[0]?.id).toBe("msg_beta");
  });

  it("allows re-submitting a non-active domain with a corrected zone id", async () => {
    const repaired = await demoApi.createDomain({
      rootDomain: "mail.fail.example.net",
      zoneId: "zone_fixed",
    });
    expect(repaired.status).toBe("provisioning_error");

    await demoApi.disableDomain(repaired.id);

    const retried = await demoApi.createDomain({
      rootDomain: "mail.fail.example.net",
      zoneId: "zone_repaired",
    });
    expect(retried.id).toBe(repaired.id);
    expect(retried.zoneId).toBe("zone_repaired");
    expect(retried.disabledAt).toBeNull();
  });

  it("creates api keys and users with an initial key", async () => {
    const apiKey = await demoApi.createApiKey({
      name: "CI Bot",
      scopes: ["messages:read"],
    });
    expect(apiKey.apiKey).toContain("_secret");

    const createdUser = await demoApi.createUser({
      email: "new-user@example.com",
      name: "New User",
      role: "member",
    });
    expect(createdUser.user.email).toBe("new-user@example.com");
    expect(createdUser.initialKey.apiKey).toContain("_secret");
  });
});
