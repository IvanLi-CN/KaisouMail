import { beforeEach, describe, expect, it, vi } from "vitest";

import * as authService from "../services/auth";
import * as messageService from "../services/messages";

const authUser = {
  id: "usr_1",
  email: "owner@example.com",
  name: "Owner",
  role: "member" as const,
};

vi.spyOn(authService, "requireAuth").mockImplementation(
  () =>
    async (
      c: { set: (key: string, value: unknown) => void },
      next: () => Promise<void>,
    ) => {
      c.set("authUser", authUser);
      await next();
    },
);

const listMessagesForUser = vi.spyOn(messageService, "listMessagesForUser");
vi.spyOn(messageService, "getMessageDetailForUser").mockImplementation(vi.fn());
vi.spyOn(messageService, "getRawMessageResponseForUser").mockImplementation(
  vi.fn(),
);

const { messageRoutes } = await import("../routes/messages");

const env = {
  APP_ENV: "development",
  MAIL_DOMAIN: "707979.xyz",
  DEFAULT_MAILBOX_TTL_MINUTES: "60",
  CLEANUP_BATCH_SIZE: "3",
  SUBDOMAIN_CLEANUP_BATCH_SIZE: "1",
  SUBDOMAIN_CLEANUP_REQUEST_BUDGET: "400",
  EMAIL_ROUTING_MANAGEMENT_ENABLED: "false",
  BOOTSTRAP_ADMIN_NAME: "Ivan",
  SESSION_SECRET: "super-secret-session-key",
  CF_ROUTE_RULESET_TAG: "kaisoumail",
} as never;

describe("message routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    listMessagesForUser.mockResolvedValue([]);
  });

  it("uses the later timestamp when after and since are both supplied", async () => {
    await messageRoutes.fetch(
      new Request(
        "http://localhost/?mailbox=build@alpha.707979.xyz&after=2026-04-03T12:00:00.000Z&since=2026-04-03T12:05:00.000Z",
      ),
      env,
    );

    expect(listMessagesForUser).toHaveBeenCalledWith(
      env,
      authUser,
      ["build@alpha.707979.xyz"],
      [],
      "2026-04-03T12:05:00.000Z",
      "default",
    );
  });

  it("normalizes offset timestamps before applying the cursor filter", async () => {
    await messageRoutes.fetch(
      new Request(
        "http://localhost/?after=2026-04-03T12:00:00%2B08:00&since=2026-04-03T01:30:00-05:00",
      ),
      env,
    );

    expect(listMessagesForUser).toHaveBeenCalledWith(
      env,
      authUser,
      [],
      [],
      "2026-04-03T06:30:00.000Z",
      "default",
    );
  });

  it("passes workspace scope through to the service", async () => {
    await messageRoutes.fetch(
      new Request("http://localhost/?scope=workspace"),
      env,
    );

    expect(listMessagesForUser).toHaveBeenCalledWith(
      env,
      authUser,
      [],
      [],
      null,
      "workspace",
    );
  });

  it("returns verification metadata when the service provides it", async () => {
    listMessagesForUser.mockResolvedValue([
      {
        id: "msg_verify",
        mailboxId: "mbx_alpha",
        mailboxAddress: "build@alpha.707979.xyz",
        subject: "Build artifacts ready",
        previewText: "Use verification code 842911 to continue.",
        fromName: "CI Runner",
        fromAddress: "ci@example.net",
        receivedAt: "2026-04-03T12:05:00.000Z",
        sizeBytes: 128,
        attachmentCount: 0,
        hasHtml: false,
        verification: {
          code: "842911",
          source: "body",
          method: "rules",
        },
      },
    ]);

    const response = await messageRoutes.fetch(
      new Request("http://localhost/"),
      env,
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      messages: [
        {
          id: "msg_verify",
          verification: {
            code: "842911",
            source: "body",
            method: "rules",
          },
        },
      ],
    });
  });

  it("passes mailboxId filters through to the service", async () => {
    await messageRoutes.fetch(
      new Request("http://localhost/?mailboxId=mbx_alpha&scope=workspace"),
      env,
    );

    expect(listMessagesForUser).toHaveBeenCalledWith(
      env,
      authUser,
      [],
      ["mbx_alpha"],
      null,
      "workspace",
    );
  });

  it("rejects invalid cursor filters", async () => {
    const response = await messageRoutes.fetch(
      new Request("http://localhost/?after=not-a-date"),
      env,
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      error: "Invalid request",
      details: {
        fieldErrors: expect.any(Object),
      },
    });
  });
});

describe("message cursor helper", () => {
  it("returns the latest cursor alias", () => {
    expect(
      messageService.resolveReceivedAfter({
        after: "2026-04-03T12:00:00.000Z",
        since: "2026-04-03T12:05:00.000Z",
      }),
    ).toBe("2026-04-03T12:05:00.000Z");
  });
});
