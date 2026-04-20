import { beforeEach, describe, expect, it, vi } from "vitest";

const { getDb } = vi.hoisted(() => ({
  getDb: vi.fn(),
}));
const { getDomainCutoverTaskById, runDomainCutoverTaskById } = vi.hoisted(
  () => ({
    getDomainCutoverTaskById: vi.fn(),
    runDomainCutoverTaskById: vi.fn(),
  }),
);

vi.mock("../db/client", () => ({
  getDb,
}));

vi.mock("../services/domain-cutover", async () => {
  const actual = await vi.importActual<
    typeof import("../services/domain-cutover")
  >("../services/domain-cutover");
  return {
    ...actual,
    getDomainCutoverTaskById,
    runDomainCutoverTaskById,
  };
});

import {
  isDomainCutoverTaskResumable,
  resumeDomainCutoverTaskById,
  resumeDomainCutoverTasks,
} from "../services/domain-cutover-dispatch";

const env = {} as never;
const runtimeConfig = {
  APP_ENV: "development",
  DEFAULT_MAILBOX_TTL_MINUTES: 60,
  CLEANUP_BATCH_SIZE: 3,
  SUBDOMAIN_CLEANUP_BATCH_SIZE: 50,
  EMAIL_ROUTING_MANAGEMENT_ENABLED: true,
  CLOUDFLARE_API_TOKEN: "cf-token",
  EMAIL_WORKER_NAME: "mail-worker",
  SESSION_SECRET: "super-secret-session-key",
  BOOTSTRAP_ADMIN_NAME: "Ivan",
  CF_ROUTE_RULESET_TAG: "kaisoumail",
} as const;

const baseTask = {
  id: "dct_123",
  domainId: "dom_primary",
  rootDomain: "ivanli.asia",
  requestedByUserId: "usr_admin",
  action: "enable",
  targetMode: "wildcard",
  status: "pending",
  phase: "queued",
  currentHost: null,
  deletedCount: 0,
  rebuiltCount: 0,
  totalCount: 0,
  rollbackPhase: null,
  error: null,
  createdAt: "2026-04-21T10:00:00.000Z",
  startedAt: null,
  updatedAt: "2026-04-21T10:00:00.000Z",
  completedAt: null,
  failedAt: null,
} as const;

const createDb = (rowsByQuery: unknown[][]) => ({
  select: vi.fn(() => ({
    from: vi.fn(() => ({
      where: vi.fn(() => ({
        limit: vi.fn(async () => rowsByQuery.shift() ?? []),
        orderBy: vi.fn(() => ({
          limit: vi.fn(async () => rowsByQuery.shift() ?? []),
        })),
      })),
    })),
  })),
});

describe("domain cutover dispatch service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("treats pending tasks and stale loading_state tasks as resumable", () => {
    expect(
      isDomainCutoverTaskResumable(
        {
          status: "pending",
          phase: "queued",
          updatedAt: "2026-04-21T10:00:00.000Z",
        },
        Date.parse("2026-04-21T10:00:01.000Z"),
      ),
    ).toBe(true);

    expect(
      isDomainCutoverTaskResumable(
        {
          status: "running",
          phase: "loading_state",
          updatedAt: "2026-04-21T10:00:09.500Z",
        },
        Date.parse("2026-04-21T10:00:10.000Z"),
      ),
    ).toBe(false);

    expect(
      isDomainCutoverTaskResumable(
        {
          status: "running",
          phase: "loading_state",
          updatedAt: "2026-04-21T10:00:07.000Z",
        },
        Date.parse("2026-04-21T10:00:10.000Z"),
      ),
    ).toBe(true);

    expect(
      isDomainCutoverTaskResumable(
        {
          status: "running",
          phase: "purging_exact_dns",
          updatedAt: "2026-04-21T09:59:45.000Z",
        },
        Date.parse("2026-04-21T10:00:10.000Z"),
      ),
    ).toBe(false);

    expect(
      isDomainCutoverTaskResumable(
        {
          status: "running",
          phase: "purging_exact_dns",
          updatedAt: "2026-04-21T09:59:35.000Z",
        },
        Date.parse("2026-04-21T10:00:10.000Z"),
      ),
    ).toBe(true);
  });

  it("reruns pending tasks by id", async () => {
    const db = createDb([[baseTask]]);
    getDb.mockReturnValue(db);
    runDomainCutoverTaskById.mockResolvedValue({
      id: baseTask.id,
      status: "completed",
    });

    const result = await resumeDomainCutoverTaskById(
      env,
      runtimeConfig,
      baseTask.id,
    );

    expect(runDomainCutoverTaskById).toHaveBeenCalledWith(
      env,
      runtimeConfig,
      baseTask.id,
    );
    expect(result).toMatchObject({ id: baseTask.id, status: "completed" });
  });

  it("returns fresh running tasks without rerunning them", async () => {
    const freshRunningTask = {
      ...baseTask,
      status: "running",
      phase: "loading_state",
      updatedAt: "2999-04-21T10:00:00.000Z",
    } as const;
    const db = createDb([[freshRunningTask]]);
    getDb.mockReturnValue(db);
    getDomainCutoverTaskById.mockResolvedValue({
      id: freshRunningTask.id,
      status: freshRunningTask.status,
      phase: freshRunningTask.phase,
      updatedAt: freshRunningTask.updatedAt,
    });

    const result = await resumeDomainCutoverTaskById(
      env,
      runtimeConfig,
      freshRunningTask.id,
    );

    expect(runDomainCutoverTaskById).not.toHaveBeenCalled();
    expect(getDomainCutoverTaskById).toHaveBeenCalledWith(
      env,
      freshRunningTask.id,
    );
    expect(result).toMatchObject({
      id: freshRunningTask.id,
      status: "running",
      phase: "loading_state",
    });
  });

  it("dispatcher resumes only resumable open tasks", async () => {
    const staleRunningTask = {
      ...baseTask,
      id: "dct_stale",
      status: "running",
      phase: "loading_state",
      updatedAt: "2026-04-21T10:00:00.000Z",
    } as const;
    const freshRunningTask = {
      ...baseTask,
      id: "dct_fresh",
      status: "running",
      phase: "purging_exact_dns",
      updatedAt: "2999-04-21T10:00:00.000Z",
    } as const;
    const db = createDb([[baseTask, staleRunningTask, freshRunningTask]]);
    getDb.mockReturnValue(db);
    runDomainCutoverTaskById.mockResolvedValue({ status: "completed" });

    const result = await resumeDomainCutoverTasks(env, runtimeConfig, {
      limit: 4,
    });

    expect(runDomainCutoverTaskById).toHaveBeenCalledTimes(2);
    expect(runDomainCutoverTaskById).toHaveBeenNthCalledWith(
      1,
      env,
      runtimeConfig,
      baseTask.id,
    );
    expect(runDomainCutoverTaskById).toHaveBeenNthCalledWith(
      2,
      env,
      runtimeConfig,
      staleRunningTask.id,
    );
    expect(result).toEqual({
      resumedTaskIds: [baseTask.id, staleRunningTask.id],
    });
  });
});
