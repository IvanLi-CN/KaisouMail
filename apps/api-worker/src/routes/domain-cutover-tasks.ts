import { domainCutoverTaskResponseSchema } from "@kaisoumail/shared";
import { Hono } from "hono";
import { streamSSE } from "hono/streaming";

import { requireAuth } from "../services/auth";
import { getDomainCutoverTaskById } from "../services/domain-cutover";
import type { AppBindings } from "../types";

export const domainCutoverTaskRoutes = new Hono<AppBindings>()
  .use("*", requireAuth({ admin: true }))
  .get("/:taskId", async (c) =>
    c.json(
      domainCutoverTaskResponseSchema.parse({
        task: await getDomainCutoverTaskById(c.env, c.req.param("taskId")),
      }),
    ),
  )
  .get("/:taskId/events", async (c) => {
    const taskId = c.req.param("taskId");
    const initialTask = await getDomainCutoverTaskById(c.env, taskId);

    c.header("cache-control", "no-cache");
    c.header("connection", "keep-alive");

    return streamSSE(c, async (stream) => {
      let lastUpdatedAt = "";
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
          data: JSON.stringify(
            domainCutoverTaskResponseSchema.parse({ task }),
          ),
        });
        lastUpdatedAt = task.updatedAt;
      };

      await sendTask(initialTask);
      if (initialTask.status === "completed" || initialTask.status === "failed") {
        return;
      }

      for (let attempt = 0; attempt < 600; attempt += 1) {
        await stream.sleep(500);
        const task = await getDomainCutoverTaskById(c.env, taskId);
        if (task.updatedAt !== lastUpdatedAt) {
          await sendTask(task);
        }
        if (task.status === "completed" || task.status === "failed") {
          return;
        }
      }
    });
  });
