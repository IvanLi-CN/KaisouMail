# cf-mail

Cloudflare temporary email platform built with Email Routing, Workers, D1, R2, and a React + shadcn/ui control plane.

## Features

- Multi-user temporary mailbox management with per-user API keys
- Random or custom mailbox creation with TTL-based cleanup
- Multi-level mailbox subdomains such as `alpha.<mail-root>` and `ops.alpha.<mail-root>`
- Incoming mail storage in R2 with parsed metadata in D1
- Message list filtering by multiple mailbox addresses
- Message detail view with headers, text/html bodies, recipients, attachments, and raw `.eml` download
- React + shadcn/ui control plane for mailboxes, messages, API keys, and users
- GitHub Actions for CI, Worker deploy, Pages deploy, and tag-based releases

## Stack

- Bun workspaces
- Cloudflare Workers + Hono
- Drizzle ORM + drizzle-kit + `drizzle-orm/zod`
- D1 + R2
- React + Vite + TanStack Query + React Hook Form + shadcn/ui + Storybook
- Biome + Lefthook + Vitest + Playwright

## Workspaces

- `apps/api-worker`: Worker API, Email Worker, scheduled cleanup, Drizzle schema, Wrangler config
- `apps/web`: Pages-deployed React admin UI, Storybook, Playwright smoke tests
- `packages/shared`: shared contracts, constants, and version metadata

## Repository scripts

```bash
bun run check            # biome checks across the monorepo
bun run typecheck        # shared + worker + web typecheck
bun run test             # worker/web unit tests
bun run build            # worker dry-run deploy + web production build
bun run build-storybook  # static Storybook build
bun run test:e2e         # Playwright smoke test against demo mode
```

## Local development

```bash
bun install
bun run version:write
cp apps/api-worker/.dev.vars.example apps/api-worker/.dev.vars
cp apps/web/.env.example apps/web/.env
```

### Worker

`apps/api-worker/wrangler.jsonc` and `apps/api-worker/wrangler.email.jsonc` are checked in with the production topology for `707979.xyz`.
Copy `.dev.vars.example` to `.dev.vars` to override those values safely for local development.

```bash
WORKER_PORT=8787 bun run --cwd apps/api-worker dev
```

### Web

```bash
PORT=4173 bun run --cwd apps/web dev
```

### Storybook

```bash
STORYBOOK_PORT=6006 bun run --cwd apps/web storybook
```

## Cloudflare runtime contract

The Worker expects these bindings and variables:

### Required bindings

- `DB`: D1 database
- `MAIL_BUCKET`: R2 bucket

### Required secrets

- `SESSION_SECRET`
- `BOOTSTRAP_ADMIN_API_KEY`

### Optional live-management secrets

- `CLOUDFLARE_ACCOUNT_ID`
- `CLOUDFLARE_ZONE_ID`
- `CLOUDFLARE_API_TOKEN`

### Vars

- `APP_ENV`
- `MAIL_DOMAIN`
- `EMAIL_WORKER_NAME` (required when live Email Routing management is enabled)
- `DEFAULT_MAILBOX_TTL_MINUTES`
- `CLEANUP_BATCH_SIZE`
- `EMAIL_ROUTING_MANAGEMENT_ENABLED`
- `BOOTSTRAP_ADMIN_EMAIL`
- `BOOTSTRAP_ADMIN_NAME`
- `CF_ROUTE_RULESET_TAG`
- `WEB_APP_ORIGIN` (optional override for the Pages origin)

If `EMAIL_ROUTING_MANAGEMENT_ENABLED=false`, the app still runs in demo/local mode without mutating live Email Routing resources.

## D1 and R2 layout

### D1 tables

- `users`
- `api_keys`
- `subdomains`
- `mailboxes`
- `messages`
- `message_recipients`
- `message_attachments`

### R2 object keys

- `raw/<userId>/<mailboxId>/<messageId>.eml`
- `parsed/<userId>/<mailboxId>/<messageId>.json`

## API surface

- `GET /api/version`
- `GET|POST|DELETE /api/auth/session`
- `GET|POST /api/api-keys`
- `POST /api/api-keys/:id/revoke`
- `GET|POST /api/mailboxes`
- `GET|DELETE /api/mailboxes/:id`
- `GET /api/messages`
- `GET /api/messages/:id`
- `GET /api/messages/:id/raw`
- `GET|POST /api/users`

## Database workflows

```bash
bun run --cwd apps/api-worker db:generate
bun run --cwd apps/api-worker db:migrate:local
bun run --cwd apps/api-worker db:migrate:remote
```

## GitHub Actions

- `ci-pr.yml`: Biome, typecheck, unit tests, build, Storybook build, Playwright smoke
- `deploy-main.yml`: D1 migrations, Worker deploy, Pages direct upload on `main`
- `release.yml`: GitHub Release on `v*` tags

To use the deploy workflow, configure:

- GitHub secret: `CLOUDFLARE_API_TOKEN`
- GitHub secret: `CLOUDFLARE_ACCOUNT_ID`
- GitHub variable: `CF_PAGES_PROJECT_NAME`
- GitHub variable: `VITE_API_BASE_URL`

## Deployment checklist

1. Create the Pages project `cf-mail` once in Cloudflare
2. Bind `cfm.707979.xyz` to Pages
3. Set Worker secrets (`SESSION_SECRET`, `BOOTSTRAP_ADMIN_API_KEY`, `CLOUDFLARE_API_TOKEN`)
4. Set `EMAIL_WORKER_NAME` to the Email Worker script that should receive routed mail (for `707979.xyz`, this is `email-receiver-worker`)
5. Set GitHub secret `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID`
6. Set GitHub vars `CF_PAGES_PROJECT_NAME=cf-mail` and `VITE_API_BASE_URL=https://api.cfm.707979.xyz`
7. Push to `main` to trigger the deploy workflow

## Worker topology

- `cf-mail-api`
  - serves `https://api.cfm.707979.xyz`
  - owns the REST API and scheduled cleanup trigger
- `email-receiver-worker`
  - receives Email Routing `email()` events
  - uses the same source code as `cf-mail-api`, but is deployed with the dedicated `wrangler.email.jsonc` config and the same D1/R2 bindings

## Domain topology example

- Web UI: `https://cfm.707979.xyz`
- Worker API: `https://api.cfm.707979.xyz`
- Mail root domain: `707979.xyz`
- Mailboxes can use nested subdomains like:
  - `build@alpha.707979.xyz`
  - `spec@ops.alpha.707979.xyz`

## Notes on Cloudflare limits

- Email Routing single-message limit is 25 MiB
- D1 stores structured indices only; raw/parsed payloads stay in R2
- Expired mailbox cleanup is batched to stay within Worker execution limits
- Active mailbox concurrency is still bounded by Cloudflare Email Routing rule limits
