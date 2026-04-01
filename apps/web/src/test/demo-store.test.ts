import { beforeEach, describe, expect, it } from "vitest";

import { demoApi } from "@/lib/demo-store";

describe("demoApi", () => {
  beforeEach(() => {
    demoApi.reset();
  });

  it("creates and destroys a mailbox lifecycle", async () => {
    const created = await demoApi.createMailbox({ expiresInMinutes: 60 });
    expect(created.status).toBe("active");

    const listed = await demoApi.listMailboxes();
    expect(listed.some((mailbox) => mailbox.id === created.id)).toBe(true);

    const destroyed = await demoApi.destroyMailbox(created.id);
    expect(destroyed.status).toBe("destroyed");
    expect(destroyed.routingRuleId).toBeNull();
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
