import {
  listMessagesResponseSchema,
  messageDetailResponseSchema,
} from "@cf-mail/shared";
import { Hono } from "hono";
import { requireAuth } from "../services/auth";
import {
  getMessageDetailForUser,
  getRawMessageResponseForUser,
  listMessagesForUser,
} from "../services/messages";
import type { AppBindings } from "../types";

export const messageRoutes = new Hono<AppBindings>()
  .use("*", requireAuth())
  .get("/", async (c) => {
    const user = c.get("authUser");
    const mailboxAddresses = c.req.queries("mailbox") ?? [];
    const messages = await listMessagesForUser(c.env, user, mailboxAddresses);
    return c.json(listMessagesResponseSchema.parse({ messages }));
  })
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
