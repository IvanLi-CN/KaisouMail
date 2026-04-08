import { zValidator } from "@hono/zod-validator";
import {
  listMessagesQuerySchema,
  listMessagesResponseSchema,
  messageDetailResponseSchema,
} from "@kaisoumail/shared";
import { Hono } from "hono";
import { apiValidationHook } from "../lib/validation";
import { requireAuth } from "../services/auth";
import {
  getMessageDetailForUser,
  getRawMessageResponseForUser,
  listMessagesForUser,
  resolveReceivedAfter,
} from "../services/messages";
import type { AppBindings } from "../types";

export const messageRoutes = new Hono<AppBindings>()
  .use("*", requireAuth())
  .get(
    "/",
    zValidator("query", listMessagesQuerySchema, apiValidationHook),
    async (c) => {
      const user = c.get("authUser");
      const mailboxAddresses = c.req.queries("mailbox") ?? [];
      const query = c.req.valid("query");
      const messages = await listMessagesForUser(
        c.env,
        user,
        mailboxAddresses,
        resolveReceivedAfter(query),
        query.scope ?? "default",
      );
      return c.json(listMessagesResponseSchema.parse({ messages }));
    },
  )
  .get("/:id", async (c) => {
    const message = await getMessageDetailForUser(
      c.env,
      c.get("authUser"),
      c.req.param("id"),
    );
    return c.json(messageDetailResponseSchema.parse({ message }));
  })
  .get("/:id/raw", async (c) =>
    getRawMessageResponseForUser(c.env, c.get("authUser"), c.req.param("id")),
  );
