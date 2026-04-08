# Deployment & Environment

## Required Worker bindings

| Name | Purpose |
| --- | --- |
| `DB` | D1 database |
| `MAIL_BUCKET` | R2 bucket for raw email storage |

## Required Worker secrets

| Name | Purpose |
| --- | --- |
| `SESSION_SECRET` | session signing |

## Optional bootstrap-only Worker secrets

| Name | Purpose |
| --- | --- |
| `BOOTSTRAP_ADMIN_API_KEY` | first admin bootstrap key; only needed when `BOOTSTRAP_ADMIN_EMAIL` is also set |

## Worker runtime variables

| Name | Purpose |
| --- | --- |
| `APP_ENV` | environment marker |
| `EMAIL_WORKER_NAME` | inbound Worker target for Email Routing |
| `DEFAULT_MAILBOX_TTL_MINUTES` | default mailbox TTL |
| `CLEANUP_BATCH_SIZE` | cleanup batch size |
| `EMAIL_ROUTING_MANAGEMENT_ENABLED` | whether the app may mutate live Email Routing |
| `CLOUDFLARE_ACCOUNT_ID` | Cloudflare account ID exposed to the API Worker runtime; required for direct zone binding from `/domains` |
| `BOOTSTRAP_ADMIN_EMAIL` | first admin email |
| `BOOTSTRAP_ADMIN_NAME` | first admin display name |
| `CF_ROUTE_RULESET_TAG` | Worker route management tag |
| `WEB_APP_ORIGIN` | primary browser origin used for direct-API compatibility and passkey trust; when only one origin is configured its host becomes the RP ID, and passkeys require `localhost` or a domain name instead of an IP literal |
| `WEB_APP_ORIGINS` | comma-separated browser origins to trust when multiple production aliases stay live; passkeys accept every configured origin and derive one shared non-public RP ID suffix from the full set |

## Legacy single-domain upgrade variables

| Name | Purpose |
| --- | --- |
| `MAIL_DOMAIN` | historical single-domain bootstrap |
| `CLOUDFLARE_ZONE_ID` | historical single-domain bootstrap |

Do not treat these as long-term configuration for new instances.

## Web environment variables

| Name | Purpose |
| --- | --- |
| `VITE_API_BASE_URL` | local dev / preview target for the same-origin `/api` proxy, plus the deploy workflow's canonical direct-API smoke URL |
| `VITE_DEMO_MODE` | local demo mode |
| `VITE_DOCS_SITE_ORIGIN` | public docs and Storybook origin used by the control plane |

If `VITE_DOCS_SITE_ORIGIN` is empty, the in-app quick reference still works, but public docs links are hidden.
`VITE_API_BASE_URL` is no longer the production browser API locator. First-party browser traffic defaults to same-origin `/api`.
The deploy workflow renders a generated API Worker config and injects the GitHub repository secret `CLOUDFLARE_ACCOUNT_ID` into the Worker runtime variables before deploy. Exporting `CLOUDFLARE_ACCOUNT_ID` only to the GitHub Actions job environment is not sufficient for `/api/meta` or the `/domains` direct-binding UI gate.

## Pages same-origin `/api` proxy

The control plane now keeps API access same-origin on every Pages alias:

- `apps/web/public/_routes.json` sends only `/api/*` traffic into Pages Functions
- `apps/web/functions/api/[[path]].ts` forwards the incoming `Request` to `env.API.fetch(...)`
- `apps/web/wrangler.jsonc` declares the Pages build output, keeps the Pages project name aligned with the live `kaisoumail` target, and binds the proxy to the existing `kaisoumail-api` service
- `.pages.dev` preview hostnames fail closed inside the proxy so preview traffic cannot accidentally reach the live control plane
- static HTML, JS, CSS, and assets still bypass Workers billing because they do not enter the Function path
- the deploy workflow uses `CF_PAGES_SMOKE_ORIGINS` to rerun same-origin `/api/version` smoke against every declared Pages alias after the Pages deploy completes, and malformed entries fail the workflow instead of being skipped silently

Keep direct API custom domains such as `https://api.cfm.707979.xyz` and `https://api.km.707979.xyz` for compatibility or direct API consumers. `WEB_APP_ORIGINS` remains the CORS allowlist for those direct API aliases, but the first-party browser UI should use same-origin `/api` instead.

## Production alias example

- Web: `https://cfm.707979.xyz`, `https://km.707979.xyz`
- API: `https://api.cfm.707979.xyz`, `https://api.km.707979.xyz`

## Deploy workflow safety rails

- The production deploy workflow always captures a D1 Time Travel restore anchor and, for schema-stable releases, also captures the current 100%-stable API Worker version before publishing a new API release
- It applies remote D1 migrations automatically, uploads a non-live API Worker version, and only promotes that version to 100% production traffic after shadow `/health` + `/api/version` smoke passes through the canonical direct API custom domain
- After promotion it runs `/health` + `/api/version` smoke against the production API origin before any trigger changes; only then does it apply Worker route/domain/cron trigger changes explicitly, rerun smoke after trigger application across `VITE_API_BASE_URL` plus every routable API URL declared in `apps/api-worker/wrangler.jsonc`, deploy Pages, and finally rerun same-origin `/api/version` smoke across every Pages alias declared in `CF_PAGES_SMOKE_ORIGINS`, all without automatic rollback. Trigger application errors, post-trigger smoke failures, or same-origin Pages smoke failures stop for manual inspection, and automatic Worker rollback is disabled whenever the release is migration-bearing or remote D1 schema changes were involved in the deploy
- D1 restore remains an explicit `workflow_dispatch` recovery path, not an automatic failure hook, because automatic DB restore could discard real writes
- `CI Main` and `CI PR` block obviously destructive SQL patterns on the default path, and Deploy re-validates the remote pending migration set before apply; keep migrations expand-only / forward-compatible, keep compatibility code for at most one release, and move destructive cleanup to a later cleanup release

## Public GitHub Pages site

`docs-pages` publishes three entrypoints:

- `/`: Rspress docs home
- `/storybook/`: static Storybook bundle
- `/storybook.html`: Storybook redirect entry
