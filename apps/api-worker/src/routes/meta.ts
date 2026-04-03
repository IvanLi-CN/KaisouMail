import {
  apiMetaResponseSchema,
  mailboxLocalPartRegex,
  mailboxSubdomainRegex,
  maxMailboxTtlMinutes,
  minMailboxTtlMinutes,
} from "@cf-mail/shared";
import { Hono } from "hono";

import { parseRuntimeConfig } from "../env";
import { listActiveRootDomains } from "../services/domains";
import type { AppBindings } from "../types";

export const metaRoutes = new Hono<AppBindings>().get("/", async (c) => {
  const config = parseRuntimeConfig(c.env);
  const activeRootDomains = await listActiveRootDomains(c.env);

  return c.json(
    apiMetaResponseSchema.parse({
      domains: activeRootDomains,
      defaultMailboxTtlMinutes: config.DEFAULT_MAILBOX_TTL_MINUTES,
      minMailboxTtlMinutes,
      maxMailboxTtlMinutes,
      addressRules: {
        format: "localPart@subdomain.rootDomain",
        localPartPattern: mailboxLocalPartRegex.source,
        subdomainPattern: mailboxSubdomainRegex.source,
        examples: activeRootDomains
          .slice(0, 2)
          .flatMap((rootDomain) => [
            `build@alpha.${rootDomain}`,
            `spec@ops.alpha.${rootDomain}`,
          ]),
      },
    }),
  );
});
