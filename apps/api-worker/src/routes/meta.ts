import {
  apiMetaResponseSchema,
  buildRealisticMailboxAddressExamples,
  mailboxLocalPartRegex,
  mailboxSubdomainRegex,
  maxMailboxTtlMinutes,
  minMailboxTtlMinutes,
} from "@kaisoumail/shared";
import { Hono } from "hono";

import { parseRuntimeConfig } from "../env";
import { listActiveRootDomains } from "../services/domains";
import { isPasskeyAuthConfigured } from "../services/passkeys";
import type { AppBindings } from "../types";

export const metaRoutes = new Hono<AppBindings>().get("/", async (c) => {
  const config = parseRuntimeConfig(c.env);
  const activeRootDomains = await listActiveRootDomains(c.env);
  const hasCloudflareApiToken = Boolean(config.CLOUDFLARE_API_TOKEN);

  return c.json(
    apiMetaResponseSchema.parse({
      domains: activeRootDomains,
      cloudflareDomainBindingEnabled:
        config.EMAIL_ROUTING_MANAGEMENT_ENABLED &&
        hasCloudflareApiToken &&
        Boolean(config.CLOUDFLARE_ACCOUNT_ID),
      cloudflareDomainLifecycleEnabled:
        config.EMAIL_ROUTING_MANAGEMENT_ENABLED && hasCloudflareApiToken,
      passkeyAuthEnabled: isPasskeyAuthConfigured(config),
      passkeyTrustedOrigins: config.WEB_APP_ORIGINS ?? [],
      supportsUnlimitedMailboxTtl: true,
      defaultMailboxTtlMinutes: config.DEFAULT_MAILBOX_TTL_MINUTES,
      minMailboxTtlMinutes,
      maxMailboxTtlMinutes,
      addressRules: {
        format: "localPart@subdomain.rootDomain",
        localPartPattern: mailboxLocalPartRegex.source,
        subdomainPattern: mailboxSubdomainRegex.source,
        examples: buildRealisticMailboxAddressExamples(activeRootDomains),
      },
    }),
  );
});
