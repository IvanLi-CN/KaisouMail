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
| `WEB_APP_ORIGIN` | legacy primary browser origin used for direct-API compatibility |
| `WEB_APP_ORIGINS` | comma-separated browser origins to trust when multiple production aliases stay live |

## Legacy single-domain upgrade variables

| Name | Purpose |
| --- | --- |
| `MAIL_DOMAIN` | historical single-domain bootstrap |
| `CLOUDFLARE_ZONE_ID` | historical single-domain bootstrap |

Do not treat these as long-term configuration for new instances.

## Web environment variables

| Name | Purpose |
| --- | --- |
| `VITE_API_BASE_URL` | local dev / preview target for the same-origin `/api` proxy, or an explicit non-browser override |
| `VITE_DEMO_MODE` | local demo mode |
| `VITE_DOCS_SITE_ORIGIN` | public docs and Storybook origin used by the control plane |

If `VITE_DOCS_SITE_ORIGIN` is empty, the in-app quick reference still works, but public docs links are hidden.
`VITE_API_BASE_URL` is no longer the production browser API locator. First-party browser traffic defaults to same-origin `/api`.

## Pages same-origin `/api` proxy

The control plane now keeps API access same-origin on every Pages alias:

- `apps/web/public/_routes.json` sends only `/api/*` traffic into Pages Functions
- `apps/web/functions/api/[[path]].ts` forwards the incoming `Request` to `env.API.fetch(...)`
- `apps/web/wrangler.jsonc` declares the Pages build output and the `API` Service Binding that points at `kaisoumail-api`
- static HTML, JS, CSS, and assets still bypass Workers billing because they do not enter the Function path

Keep direct API custom domains such as `https://api.cfm.707979.xyz` and `https://api.km.707979.xyz` for compatibility or direct API consumers. `WEB_APP_ORIGINS` remains the CORS allowlist for those direct API aliases, but the first-party browser UI should use same-origin `/api` instead.

## Production alias example

- Web: `https://cfm.707979.xyz`, `https://km.707979.xyz`
- API: `https://api.cfm.707979.xyz`, `https://api.km.707979.xyz`

## Deploy workflow safety rails

- The production deploy workflow captures the current 100%-stable API Worker version before publishing a new API release
- It fails closed when the target release includes a D1 migration diff, or when remote D1 still has pending migrations, because rollback-backed automation only supports schema-stable releases with a clean remote migration state
- For schema-stable releases with zero pending remote migrations, the workflow uses rollback-backed `/health` + `/api/version` smoke checks against every configured direct API alias before it can continue to Pages promotion
- After Pages promotion, the workflow smoke-tests `${origin}/api/version` for every origin listed in `CF_PAGES_SMOKE_ORIGINS`; every origin must return the release short SHA before the deployment is considered complete
- Because the workflow also fails closed without a rollback target, bootstrap the very first production API release manually

## Public GitHub Pages site

`docs-pages` publishes three entrypoints:

- `/`: Rspress docs home
- `/storybook/`: static Storybook bundle
- `/storybook.html`: Storybook redirect entry
