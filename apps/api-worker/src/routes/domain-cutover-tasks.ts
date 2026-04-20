import { domainCutoverTaskResponseSchema } from "@kaisoumail/shared";
import { Hono } from "hono";
import { streamSSE } from "hono/streaming";

import { logOperationalEvent } from "../lib/observability";
import { requireAuth } from "../services/auth";
import { getDomainCutoverTaskById } from "../services/domain-cutover";
import {
  isDomainCutoverTaskResumable,
  resumeDomainCutoverTaskById,
} from "../services/domain-cutover-dispatch";
import type { AppBindings } from "../types";

const resolveExecutionContext = (c: unknown) =>
  (c as {
    executionCtx?: { waitUntil?: (promise: Promise<unknown>) => void };
  }).executionCtx;

const scheduleDomainCutoverResume = (
  c: unknown,
  env: AppBindings["Bindings"],
  runtimeConfig: AppBindings["Variables"]["runtimeConfig"],
  taskId: string,
) => {
  const resumePromise = resumeDomainCutoverTaskById(
    env,
    runtimeConfig,
    taskId,
  ).catch((error) => {
    logOperationalEvent("warn", "domains.cutover.resume.dispatch_failed", {
      taskId,
      error: error instanceof Error ? error.message : String(error),
    });
  });

  const executionContext = resolveExecutionContext(c);
  if (executionContext?.waitUntil) {
    executionContext.waitUntil(resumePromise);
    return;
  }

  void resumePromise;
};

export const domainCutoverTaskRoutes = new Hono<AppBindings>()
  .use("*", requireAuth({ admin: true }))
  .get("/:taskId", async (c) => {
    const taskId = c.req.param("taskId");
    const task = await getDomainCutoverTaskById(c.env, taskId);

    if (isDomainCutoverTaskResumable(task)) {
      scheduleDomainCutoverResume(c, c.env, c.get("runtimeConfig"), taskId);
    }

    return c.json(
      domainCutoverTaskResponseSchema.parse({
        task,
      }),
    );
  })
  .get("/:taskId/events", async (c) => {
    const taskId = c.req.param("taskId");
    const runtimeConfig = c.get("runtimeConfig");
    const initialTask = await getDomainCutoverTaskById(c.env, taskId);

    c.header("cache-control", "no-cache");
    c.header("connection", "keep-alive");

    return streamSSE(c, async (stream) => {
      let lastUpdatedAt = "";
      let lastResumeRequestedAt = 0;

      const maybeResume = (
        task: Awaited<ReturnType<typeof getDomainCutoverTaskById>>,
      ) => {
        if (!isDomainCutoverTaskResumable(task)) {
          return;
        }

        const now = Date.now();
        if (now - lastResumeRequestedAt < 5_000) {
          return;
        }

        lastResumeRequestedAt = now;
        scheduleDomainCutoverResume(c, c.env, runtimeConfig, taskId);
      };

      const sendTask = async (
        task: Awaited<ReturnType<typeof getDomainCutoverTaskById>>,
      ) => {
        const event =
          task.status === "completed"
            ? "completed"
            : task.status === "failed"
              ? "failed"
              : "progress";
        await stream.writeSSE({
          event,
          data: JSON.stringify(domainCutoverTaskResponseSchema.parse({ task })),
        });
        lastUpdatedAt = task.updatedAt;
      };

      await sendTask(initialTask);
      if (
        initialTask.status === "completed" ||
        initialTask.status === "failed"
      ) {
        return;
      }

      maybeResume(initialTask);

      for (let attempt = 0; attempt < 600; attempt += 1) {
        await stream.sleep(500);
        const task = await getDomainCutoverTaskById(c.env, taskId);
        if (task.updatedAt !== lastUpdatedAt) {
          await sendTask(task);
        } else {
          maybeResume(task);
        }
        if (task.status === "completed" || task.status === "failed") {
          return;
        }
      }
    });
  });
