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
| `WEB_APP_ORIGIN` | trusted browser origin for the control plane |

## Legacy single-domain upgrade variables

| Name | Purpose |
| --- | --- |
| `MAIL_DOMAIN` | historical single-domain bootstrap |
| `CLOUDFLARE_ZONE_ID` | historical single-domain bootstrap |

Do not treat these as long-term configuration for new instances.

## Web environment variables

| Name | Purpose |
| --- | --- |
| `VITE_API_BASE_URL` | control-plane API base URL |
| `VITE_DEMO_MODE` | local demo mode |
| `VITE_DOCS_SITE_ORIGIN` | public docs and Storybook origin used by the control plane |

If `VITE_DOCS_SITE_ORIGIN` is empty, the in-app quick reference still works, but public docs links are hidden.

## Deploy workflow safety rails

- The production deploy workflow captures the current 100%-stable API Worker version before publishing a new API release
- It fails closed when the target release includes a D1 migration diff, or when remote D1 still has pending migrations, because rollback-backed automation only supports schema-stable releases with a clean remote migration state
- For schema-stable releases with zero pending remote migrations, the workflow uses rollback-backed `/health` + `/api/version` smoke checks before it can continue to Pages promotion
- Because the workflow also fails closed without a rollback target, bootstrap the very first production API release manually

## Public GitHub Pages site

`docs-pages` publishes three entrypoints:

- `/`: Rspress docs home
- `/storybook/`: static Storybook bundle
- `/storybook.html`: Storybook redirect entry
