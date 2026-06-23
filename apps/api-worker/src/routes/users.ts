import { listUsersResponseSchema } from "@kaisoumail/shared";
import { Hono } from "hono";
import { requireAuth } from "../services/auth";
import { listAdminUsers } from "../services/identity";
import type { AppBindings } from "../types";

export const userRoutes = new Hono<AppBindings>()
  .use("*", requireAuth({ admin: true }))
  .get("/", async (c) =>
    c.json(
      listUsersResponseSchema.parse({ users: await listAdminUsers(c.env) }),
    ),
  );
