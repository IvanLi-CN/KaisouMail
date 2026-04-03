import { beforeEach, describe, expect, it } from "vitest";

import { demoApi } from "@/lib/demo-store";

describe("demoApi", () => {
  beforeEach(() => {
    demoApi.reset();
  });

  it("creates and destroys a mailbox lifecycle", async () => {
    const created = await demoApi.createMailbox({
      subdomain: "ops.alpha",
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

  it("reuses active mailboxes through ensure and exposes meta", async () => {
    const meta = await demoApi.getMeta();
    expect(meta.rootDomain).toBe("707979.xyz");

    const reused = await demoApi.ensureMailbox({
      address: "build@alpha.707979.xyz",
    });
    expect(reused.id).toBe("mbx_alpha");
  });

  it("filters messages by after/since cursor aliases", async () => {
    const filtered = await demoApi.listMessages([], {
      after: "2026-04-01T08:31:00.000Z",
      since: "2026-04-01T08:35:00.000Z",
    });
    expect(filtered.map((message) => message.id)).toEqual(["msg_beta"]);
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
