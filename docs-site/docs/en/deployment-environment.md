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
| `BOOTSTRAP_ADMIN_EMAIL` | first admin email |
| `BOOTSTRAP_ADMIN_NAME` | first admin display name |
| `CF_ROUTE_RULESET_TAG` | Worker route management tag |
| `WEB_APP_ORIGIN` | primary browser origin used for passkey trust; when only one origin is configured its host becomes the RP ID, and passkeys require `localhost` or a domain name instead of an IP literal |
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
| `VITE_API_BASE_URL` | canonical / fallback control-plane API base URL |
| `VITE_DEMO_MODE` | local demo mode |
| `VITE_DOCS_SITE_ORIGIN` | public docs and Storybook origin used by the control plane |

If `VITE_DOCS_SITE_ORIGIN` is empty, the in-app quick reference still works, but public docs links are hidden.
When the control plane runs from a known production alias such as `cfm.707979.xyz` or `km.707979.xyz`, the web app prefers the matching API alias automatically; other environments still fall back to `VITE_API_BASE_URL`.

## Production alias example

- Web: `https://cfm.707979.xyz`, `https://km.707979.xyz`
- API: `https://api.cfm.707979.xyz`, `https://api.km.707979.xyz`

## Deploy workflow safety rails

- The production deploy workflow always captures a D1 Time Travel restore anchor and, for schema-stable releases, also captures the current 100%-stable API Worker version before publishing a new API release
- It applies remote D1 migrations automatically, uploads a non-live API Worker version to a preview URL, and only promotes that version to 100% production traffic after preview `/health` + `/api/version` smoke passes
- After promotion it runs `/health` + `/api/version` smoke against the production API origin before any trigger changes; only then does it apply Worker route/domain/cron trigger changes explicitly and rerun smoke after trigger application across `VITE_API_BASE_URL` plus every routable API URL declared in `apps/api-worker/wrangler.jsonc`, all without automatic rollback. Trigger application errors or post-trigger smoke failures stop for manual inspection, and automatic Worker rollback is disabled whenever the release is migration-bearing or remote D1 schema changes were involved in the deploy
- D1 restore remains an explicit `workflow_dispatch` recovery path, not an automatic failure hook, because automatic DB restore could discard real writes
- `CI Main` and `CI PR` block obviously destructive SQL patterns on the default path, and Deploy re-validates the remote pending migration set before apply; keep migrations expand-only / forward-compatible, keep compatibility code for at most one release, and move destructive cleanup to a later cleanup release
- Because the workflow still needs a stable rollback target, bootstrap the very first production API release manually and keep a workers.dev subdomain available for preview URLs

## Public GitHub Pages site

`docs-pages` publishes three entrypoints:

- `/`: Rspress docs home
- `/storybook/`: static Storybook bundle
- `/storybook.html`: Storybook redirect entry
