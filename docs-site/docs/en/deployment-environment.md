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
| `BOOTSTRAP_ADMIN_API_KEY` | initial admin bootstrap key |

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

## Public GitHub Pages site

`docs-pages` publishes three entrypoints:

- `/`: Rspress docs home
- `/storybook/`: static Storybook bundle
- `/storybook.html`: Storybook redirect entry
