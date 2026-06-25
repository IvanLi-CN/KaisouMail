import { zValidator } from "@hono/zod-validator";
import {
  listUsersResponseSchema,
  paginationQuerySchema,
} from "@kaisoumail/shared";
import { Hono } from "hono";

import { apiValidationHook } from "../lib/validation";
import { requireAuth } from "../services/auth";
import { listAdminUsersPaginated } from "../services/identity";
import type { AppBindings } from "../types";

export const userRoutes = new Hono<AppBindings>()
  .use("*", requireAuth({ admin: true }))
  .get(
    "/",
    zValidator("query", paginationQuerySchema, apiValidationHook),
    async (c) =>
      c.json(
        listUsersResponseSchema.parse(
          await listAdminUsersPaginated(c.env, c.req.valid("query")),
        ),
      ),
  );
