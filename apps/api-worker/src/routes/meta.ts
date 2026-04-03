import {
  apiMetaResponseSchema,
  mailboxLocalPartRegex,
  mailboxSubdomainRegex,
  maxMailboxTtlMinutes,
  minMailboxTtlMinutes,
} from "@cf-mail/shared";
import { Hono } from "hono";

import { parseRuntimeConfig } from "../env";
import type { AppBindings } from "../types";

export const metaRoutes = new Hono<AppBindings>().get("/", async (c) => {
  const config = parseRuntimeConfig(c.env);

  return c.json(
    apiMetaResponseSchema.parse({
      rootDomain: config.MAIL_DOMAIN,
      defaultMailboxTtlMinutes: config.DEFAULT_MAILBOX_TTL_MINUTES,
      minMailboxTtlMinutes,
      maxMailboxTtlMinutes,
      addressRules: {
        format: "localPart@subdomain.rootDomain",
        localPartPattern: mailboxLocalPartRegex.source,
        subdomainPattern: mailboxSubdomainRegex.source,
        examples: [
          `build@alpha.${config.MAIL_DOMAIN}`,
          `spec@ops.alpha.${config.MAIL_DOMAIN}`,
        ],
      },
    }),
  );
});
