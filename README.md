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
- GitHub Actions for PR/main CI, Worker deploy, Pages deploy, and PR-label-driven releases

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

- `label-gate.yml`: validates that PRs targeting `main` carry exactly one `type:*` label and one `channel:*` label
- `ci-pr.yml`: PR/feature-branch quality gates for lint, typecheck, tests, builds, Storybook, and Playwright smoke
- `ci-main.yml`: main-branch quality gates plus immutable release snapshot generation in `refs/notes/release-snapshots`
- `deploy-main.yml`: D1 migrations, Worker deploy, and Pages direct upload after a GitHub Release is published
- `release.yml`: queued GitHub Release publishing driven by merged PR labels and CI Main snapshots

### Release labels

Every PR merged into `main` must carry exactly one label from each group:

- release intent: `type:patch`, `type:minor`, `type:major`, `type:docs`, or `type:skip`
- release channel: `channel:stable` or `channel:rc`

Release behavior is fixed:

- `type:patch|minor|major + channel:stable`: create a stable tag like `v0.2.0`
- `type:patch|minor|major + channel:rc`: create a prerelease tag like `v0.2.0-rc.<sha7>`
- `type:docs` or `type:skip`: record a release snapshot only, without creating a tag, GitHub Release, or PR comment

The first release baseline comes from the root `package.json` version when no stable tags exist yet. After that, the highest merged stable tag becomes the next bump baseline.

### Release snapshots and comments

- `ci-main.yml` writes an immutable release snapshot to git notes at `refs/notes/release-snapshots`
- `release.yml` publishes the oldest pending releasable snapshot on the first-parent `main` history, so consecutive merges are released in order
- after a GitHub Release is created, the workflow upserts a marker-based comment back onto the source PR
- a published GitHub Release automatically triggers `deploy-main.yml`, which builds the app with the release version metadata before deploying
- all GitHub API operations use the default `secrets.GITHUB_TOKEN`; no extra PAT or custom GitHub credential is required

### Manual backfill

If a `main` commit already passed `CI Main`, you can backfill the release workflow manually:

```bash
Actions -> Release -> Run workflow -> commit_sha=<main commit sha>
```

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
7. Publish a GitHub Release to trigger the deploy workflow automatically, or run `deploy-main.yml` manually when needed

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
