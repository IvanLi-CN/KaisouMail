import {
  mailboxLocalPartRegex,
  mailboxSubdomainRegex,
} from "@kaisoumail/shared";
import { beforeEach, describe, expect, it } from "vitest";

import { demoApi } from "@/lib/demo-store";

describe("demoApi", () => {
  beforeEach(() => {
    demoApi.reset();
  });

  it("creates and destroys a mailbox lifecycle", async () => {
    const created = await demoApi.createMailbox({
      subdomain: "ops.alpha",
      rootDomain: "relay.example.test",
      expiresInMinutes: 60,
    });
    expect(created.status).toBe("active");
    expect(created.address).toContain("@ops.alpha.relay.example.test");

    const listed = await demoApi.listMailboxes();
    expect(listed.some((mailbox) => mailbox.id === created.id)).toBe(true);

    const destroyed = await demoApi.destroyMailbox(created.id);
    expect(destroyed.status).toBe("destroyed");
    expect(destroyed.routingRuleId).toBeNull();
  });

  it("creates a mailbox with a random active domain when rootDomain is omitted", async () => {
    const meta = await demoApi.getMeta();
    const created = await demoApi.createMailbox({
      localPart: "randomized",
      subdomain: "ops.alpha",
      expiresInMinutes: 60,
    });

    expect(meta.domains).toContain(created.rootDomain);
    expect(created.address).toBe(`randomized@ops.alpha.${created.rootDomain}`);
  });

  it("retries generated mailbox candidates and keeps them readable", async () => {
    const originalRandom = Math.random;
    Math.random = () => 0;

    try {
      await demoApi.createMailbox({
        localPart: "ava-lin",
        subdomain: "mail",
        rootDomain: "relay.example.test",
        expiresInMinutes: 60,
      });

      const created = await demoApi.createMailbox({
        rootDomain: "relay.example.test",
        expiresInMinutes: 60,
      });

      expect(created.address).toBe("ava-lin00@mail00.relay.example.test");
      expect(created.localPart).toMatch(mailboxLocalPartRegex);
      expect(created.subdomain).toMatch(mailboxSubdomainRegex);
      expect(created.localPart).not.toMatch(/^mail-/);
      expect(created.subdomain).not.toMatch(/^box-/);
    } finally {
      Math.random = originalRandom;
    }
  });

  it("reuses active mailboxes through ensure and recreates destroyed addresses", async () => {
    const reused = await demoApi.ensureMailbox({
      address: "build@alpha.relay.example.test",
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
    expect(meta.domains).toContain("relay.example.test");

    const messages = await demoApi.listMessages([], {
      after: "2026-04-01T08:35:00.000Z",
      since: "2026-04-01T08:31:00.000Z",
    });
    expect(messages).toHaveLength(2);
    expect(messages.map((message) => message.id)).toEqual([
      "msg_catch_all",
      "msg_beta",
    ]);
  });

  it("hides stale destroyed mailboxes from workspace-scoped lists", async () => {
    const mailboxes = await demoApi.listMailboxes({
      scope: "workspace",
    });

    expect(mailboxes.some((mailbox) => mailbox.id === "mbx_gamma")).toBe(false);
    expect(mailboxes.every((mailbox) => mailbox.status !== "destroyed")).toBe(
      true,
    );
  });

  it("allows re-enabling a discovered non-active domain", async () => {
    const repaired = await demoApi.createDomain({
      rootDomain: "staging.example.dev",
      zoneId: "zone_failed",
    });
    expect(repaired.status).toBe("active");

    await demoApi.disableDomain(repaired.id);

    const retried = await demoApi.createDomain({
      rootDomain: "staging.example.dev",
      zoneId: "zone_failed",
    });
    expect(retried.id).toBe(repaired.id);
    expect(retried.zoneId).toBe("zone_failed");
    expect(retried.disabledAt).toBeNull();
  });

  it("binds new domains as project-bound provisioning errors until retried", async () => {
    const bound = await demoApi.bindDomain({
      rootDomain: "bound.example.org",
    });

    expect(bound.bindingSource).toBe("project_bind");
    expect(bound.status).toBe("provisioning_error");

    const retried = await demoApi.retryDomain(bound.id);
    expect(retried.status).toBe("active");
  });

  it("deletes project-bound domains only when they have no non-destroyed mailboxes", async () => {
    await expect(demoApi.deleteDomain("dom_secondary")).rejects.toThrow(
      "Mailbox domain still has non-destroyed mailboxes",
    );

    const bound = await demoApi.bindDomain({
      rootDomain: "cleanup.example.org",
    });
    await demoApi.deleteDomain(bound.id);

    const domains = await demoApi.listDomains();
    expect(domains.some((domain) => domain.id === bound.id)).toBe(false);
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
