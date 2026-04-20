import { beforeEach, describe, expect, it, vi } from "vitest";

const { getDomainCutoverTaskById } = vi.hoisted(() => ({
  getDomainCutoverTaskById: vi.fn(),
}));

vi.mock("../services/bootstrap", () => ({
  ensureBootstrapAdmin: vi.fn(),
  ensureBootstrapDomains: vi.fn(),
}));

vi.mock("../db/client", () => ({
  getDb: vi.fn(() => ({})),
}));

vi.mock("../services/auth", () => ({
  requireAuth: () => async (_c: never, next: () => Promise<void>) => {
    await next();
  },
}));

vi.mock("../services/domain-cutover", async () => {
  const actual = await vi.importActual<
    typeof import("../services/domain-cutover")
  >("../services/domain-cutover");
  return {
    ...actual,
    getDomainCutoverTaskById,
  };
});

import { createApp } from "../app";

const env = {
  APP_ENV: "development",
  DEFAULT_MAILBOX_TTL_MINUTES: "60",
  CLEANUP_BATCH_SIZE: "3",
  SUBDOMAIN_CLEANUP_BATCH_SIZE: "1",
  EMAIL_ROUTING_MANAGEMENT_ENABLED: "true",
  BOOTSTRAP_ADMIN_NAME: "Ivan",
  SESSION_SECRET: "super-secret-session-key",
  CF_ROUTE_RULESET_TAG: "kaisoumail",
} as never;

const completedTask = {
  id: "task_123",
  domainId: "dom_primary",
  rootDomain: "ivanli.asia",
  requestedByUserId: "usr_admin",
  action: "enable",
  targetMode: "wildcard",
  status: "completed",
  phase: "completed",
  currentHost: null,
  deletedCount: 4,
  rebuiltCount: 0,
  totalCount: 4,
  rollbackPhase: null,
  error: null,
  createdAt: "2026-04-21T10:00:00.000Z",
  startedAt: "2026-04-21T10:00:01.000Z",
  updatedAt: "2026-04-21T10:00:03.000Z",
  completedAt: "2026-04-21T10:00:03.000Z",
  failedAt: null,
};

describe("domain cutover task routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns task snapshots from /api/domain-cutover-tasks/:taskId", async () => {
    getDomainCutoverTaskById.mockResolvedValue(completedTask);

    const app = createApp();
    const response = await app.fetch(
      new Request("http://localhost/api/domain-cutover-tasks/task_123"),
      env,
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      task: completedTask,
    });
  });

  it("streams terminal snapshots from /api/domain-cutover-tasks/:taskId/events", async () => {
    getDomainCutoverTaskById.mockResolvedValue(completedTask);

    const app = createApp();
    const response = await app.fetch(
      new Request("http://localhost/api/domain-cutover-tasks/task_123/events"),
      env,
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("text/event-stream");
    await expect(response.text()).resolves.toContain('"status":"completed"');
  });
});
