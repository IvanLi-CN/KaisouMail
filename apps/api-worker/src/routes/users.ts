import {
  createUserRequestSchema,
  createUserResponseSchema,
  listUsersResponseSchema,
} from "@cf-mail/shared";
import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";

import { createUser, listUsers, requireAuth } from "../services/auth";
import type { AppBindings } from "../types";

export const userRoutes = new Hono<AppBindings>()
  .use("*", requireAuth({ admin: true }))
  .get("/", async (c) =>
    c.json(listUsersResponseSchema.parse({ users: await listUsers(c.env) })),
  )
  .post("/", zValidator("json", createUserRequestSchema), async (c) => {
    const created = await createUser(c.env, c.req.valid("json"));
    return c.json(createUserResponseSchema.parse(created), 201);
  });
