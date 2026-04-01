import {
  createMailboxRequestSchema,
  listMailboxesResponseSchema,
  mailboxSchema,
} from "@cf-mail/shared";
import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";

import { parseRuntimeConfig } from "../env";
import { requireAuth } from "../services/auth";
import {
  createMailboxForUser,
  destroyMailbox,
  getMailboxForUser,
  listMailboxesForUser,
} from "../services/mailboxes";
import type { AppBindings } from "../types";

export const mailboxRoutes = new Hono<AppBindings>()
  .use("*", requireAuth())
  .get("/", async (c) => {
    const user = c.get("authUser");
    return c.json(
      listMailboxesResponseSchema.parse({
        mailboxes: await listMailboxesForUser(c.env, user),
      }),
    );
  })
  .post("/", zValidator("json", createMailboxRequestSchema), async (c) => {
    const user = c.get("authUser");
    const mailbox = await createMailboxForUser(
      c.env,
      parseRuntimeConfig(c.env),
      user,
      c.req.valid("json"),
    );
    return c.json(mailboxSchema.parse(mailbox), 201);
  })
  .get("/:id", async (c) =>
    c.json(
      mailboxSchema.parse(
        await getMailboxForUser(c.env, c.get("authUser"), c.req.param("id")),
      ),
    ),
  )
  .delete("/:id", async (c) => {
    const mailbox = await destroyMailbox(
      c.env,
      parseRuntimeConfig(c.env),
      c.req.param("id"),
      c.get("authUser"),
    );
    return c.json(mailboxSchema.parse(mailbox));
  });
