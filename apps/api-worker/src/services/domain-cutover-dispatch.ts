import { asc, eq, inArray } from "drizzle-orm";

import { getDb } from "../db/client";
import { domainCutoverTasks } from "../db/schema";
import type { RuntimeConfig, WorkerEnv } from "../env";
import { ApiError } from "../lib/errors";
import { logOperationalEvent } from "../lib/observability";
import {
  getDomainCutoverTaskById,
  runDomainCutoverTaskById,
} from "./domain-cutover";

type DomainCutoverTaskRow = typeof domainCutoverTasks.$inferSelect;
type DomainCutoverTaskState = Pick<
  DomainCutoverTaskRow,
  "status" | "phase" | "updatedAt"
>;

export const domainCutoverLoadingStateStaleAfterMs = 2_000;
export const domainCutoverRunningStateStaleAfterMs = 30_000;
export const defaultDomainCutoverResumeBatchSize = 4;

const activeTaskStatuses = ["pending", "running"] as const;

const parseIsoMs = (value: string) => {
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
};

const toErrorMessage = (error: unknown) =>
  error instanceof Error ? error.message : String(error);

const getStoredTaskById = async (
  db: ReturnType<typeof getDb>,
  taskId: string,
) => {
  const rows = await db
    .select()
    .from(domainCutoverTasks)
    .where(eq(domainCutoverTasks.id, taskId))
    .limit(1);
  return rows[0] ?? null;
};

const listOpenTasks = async (db: ReturnType<typeof getDb>, limit: number) => {
  const rows = await db
    .select()
    .from(domainCutoverTasks)
    .where(inArray(domainCutoverTasks.status, [...activeTaskStatuses]))
    .orderBy(asc(domainCutoverTasks.createdAt))
    .limit(limit);

  return rows as DomainCutoverTaskRow[];
};

export const isDomainCutoverTaskResumable = (
  task: DomainCutoverTaskState,
  nowMs = Date.now(),
) => {
  if (task.status === "pending") {
    return true;
  }
  if (task.status !== "running") {
    return false;
  }

  const updatedAtMs = parseIsoMs(task.updatedAt);
  if (updatedAtMs === null) {
    return true;
  }

  const staleAfterMs =
    task.phase === "loading_state"
      ? domainCutoverLoadingStateStaleAfterMs
      : domainCutoverRunningStateStaleAfterMs;

  return nowMs - updatedAtMs >= staleAfterMs;
};

export const resumeDomainCutoverTaskById = async (
  env: WorkerEnv,
  config: RuntimeConfig,
  taskId: string,
) => {
  const db = getDb(env);
  const task = await getStoredTaskById(db, taskId);
  if (!task) {
    throw new ApiError(404, "Domain cutover task not found");
  }
  if (!isDomainCutoverTaskResumable(task)) {
    return getDomainCutoverTaskById(env, taskId);
  }

  return runDomainCutoverTaskById(env, config, taskId);
};

export const resumeDomainCutoverTasks = async (
  env: WorkerEnv,
  config: RuntimeConfig,
  options?: {
    limit?: number;
  },
) => {
  const db = getDb(env);
  const limit = Math.max(
    options?.limit ?? defaultDomainCutoverResumeBatchSize,
    1,
  );
  const openTasks = await listOpenTasks(db, limit * 2);
  const resumableTasks = openTasks
    .filter((task) => isDomainCutoverTaskResumable(task))
    .slice(0, limit);
  const resumedTaskIds: string[] = [];

  for (const task of resumableTasks) {
    resumedTaskIds.push(task.id);
    try {
      await runDomainCutoverTaskById(env, config, task.id);
    } catch (error) {
      logOperationalEvent("warn", "domains.cutover.resume.failed", {
        taskId: task.id,
        domainId: task.domainId,
        rootDomain: task.rootDomain,
        error: toErrorMessage(error),
      });
    }
  }

  return { resumedTaskIds };
};
