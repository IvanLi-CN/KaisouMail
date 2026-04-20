import { zValidator } from "@hono/zod-validator";
import {
  bindDomainRequestSchema,
  createDomainRequestSchema,
  domainCutoverTaskAcceptedResponseSchema,
  domainSchema,
  listDomainCatalogResponseSchema,
  listDomainsResponseSchema,
} from "@kaisoumail/shared";
import { Hono } from "hono";

import { parseRuntimeConfig } from "../env";
import { logOperationalEvent } from "../lib/observability";
import { requireAuth } from "../services/auth";
import { createDomainCutoverTask } from "../services/domain-cutover";
import { resumeDomainCutoverTaskById } from "../services/domain-cutover-dispatch";
import {
  bindDomain,
  createDomain,
  deleteDomain,
  disableDomain,
  listDomainCatalog,
  listDomains,
  retryDomainProvision,
} from "../services/domains";
import type { AppBindings } from "../types";

const resolveExecutionContext = (c: unknown) =>
  (c as {
    executionCtx?: { waitUntil?: (promise: Promise<unknown>) => void };
  }).executionCtx;

const scheduleDomainCutoverTask = (
  c: unknown,
  env: AppBindings["Bindings"],
  runtimeConfig: ReturnType<typeof parseRuntimeConfig>,
  taskId: string,
) => {
  const runPromise = resumeDomainCutoverTaskById(
    env,
    runtimeConfig,
    taskId,
  ).catch((error) => {
    logOperationalEvent("warn", "domains.cutover.dispatch.failed", {
      taskId,
      error: error instanceof Error ? error.message : String(error),
    });
  });

  const executionContext = resolveExecutionContext(c);
  if (executionContext?.waitUntil) {
    executionContext.waitUntil(runPromise);
    return;
  }

  void runPromise;
};

export const domainRoutes = new Hono<AppBindings>()
  .use("*", requireAuth({ admin: true }))
  .get("/", async (c) =>
    c.json(
      listDomainsResponseSchema.parse({ domains: await listDomains(c.env) }),
    ),
  )
  .get("/catalog", async (c) =>
    c.json(
      listDomainCatalogResponseSchema.parse(
        await listDomainCatalog(c.env, parseRuntimeConfig(c.env)),
      ),
    ),
  )
  .post("/bind", zValidator("json", bindDomainRequestSchema), async (c) => {
    const result = await bindDomain(
      c.env,
      parseRuntimeConfig(c.env),
      c.req.valid("json"),
    );
    return c.json(
      domainSchema.parse(result.domain),
      result.created ? 201 : 200,
    );
  })
  .post("/", zValidator("json", createDomainRequestSchema), async (c) => {
    const result = await createDomain(
      c.env,
      parseRuntimeConfig(c.env),
      c.req.valid("json"),
    );
    return c.json(
      domainSchema.parse(result.domain),
      result.created ? 201 : 200,
    );
  })
  .post("/:id/catch-all/enable", async (c) => {
    const runtimeConfig = parseRuntimeConfig(c.env);
    const task = await createDomainCutoverTask(c.env, runtimeConfig, {
      action: "enable",
      domainId: c.req.param("id"),
      requestedByUserId: c.get("authUser")?.id ?? null,
    });

    scheduleDomainCutoverTask(c, c.env, runtimeConfig, task.id);

    return c.json(
      domainCutoverTaskAcceptedResponseSchema.parse({ taskId: task.id }),
      202,
    );
  })
  .post("/:id/catch-all/disable", async (c) => {
    const runtimeConfig = parseRuntimeConfig(c.env);
    const task = await createDomainCutoverTask(c.env, runtimeConfig, {
      action: "disable",
      domainId: c.req.param("id"),
      requestedByUserId: c.get("authUser")?.id ?? null,
    });

    scheduleDomainCutoverTask(c, c.env, runtimeConfig, task.id);

    return c.json(
      domainCutoverTaskAcceptedResponseSchema.parse({ taskId: task.id }),
      202,
    );
  })
  .post("/:id/disable", async (c) =>
    c.json(
      domainSchema.parse(
        await disableDomain(
          c.env,
          parseRuntimeConfig(c.env),
          c.req.param("id"),
        ),
      ),
    ),
  )
  .post("/:id/retry", async (c) =>
    c.json(
      domainSchema.parse(
        await retryDomainProvision(
          c.env,
          parseRuntimeConfig(c.env),
          c.req.param("id"),
        ),
      ),
    ),
  )
  .post("/:id/delete", async (c) => {
    await deleteDomain(c.env, parseRuntimeConfig(c.env), c.req.param("id"));
    return c.body(null, 204);
  });
