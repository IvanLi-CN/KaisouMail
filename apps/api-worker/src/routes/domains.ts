import {
  createDomainRequestSchema,
  domainSchema,
  listDomainCatalogResponseSchema,
  listDomainsResponseSchema,
} from "@cf-mail/shared";
import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";

import { parseRuntimeConfig } from "../env";
import { requireAuth } from "../services/auth";
import {
  createDomain,
  disableDomain,
  listDomainCatalog,
  listDomains,
  retryDomainProvision,
} from "../services/domains";
import type { AppBindings } from "../types";

export const domainRoutes = new Hono<AppBindings>()
  .use("*", requireAuth({ admin: true }))
  .get("/", async (c) =>
    c.json(
      listDomainsResponseSchema.parse({ domains: await listDomains(c.env) }),
    ),
  )
  .get("/catalog", async (c) =>
    c.json(
      listDomainCatalogResponseSchema.parse({
        domains: await listDomainCatalog(c.env, parseRuntimeConfig(c.env)),
      }),
    ),
  )
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
  .post("/:id/disable", async (c) =>
    c.json(domainSchema.parse(await disableDomain(c.env, c.req.param("id")))),
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
  );
