# KaisouMail

Cloudflare temporary email platform built with Email Routing, Workers, D1, R2, and a React + shadcn/ui control plane.

## Docs & Storybook

- Public docs site: [ivanli-cn.github.io/KaisouMail](https://ivanli-cn.github.io/KaisouMail/)
- Public Storybook: [ivanli-cn.github.io/KaisouMail/storybook.html](https://ivanli-cn.github.io/KaisouMail/storybook.html)
- Chinese README: [README.zh-CN.md](./README.zh-CN.md)
- In-app quick reference: `/api-keys/docs`

## Features

- Multi-user temporary mailbox management with per-user API keys
- Multi-domain mailbox management backed by D1-stored Cloudflare zone records and real-time Cloudflare zone discovery
- Direct domain binding that creates a Cloudflare full zone from `/domains`, plus project-bound zone deletion with soft local cleanup
- Random or custom mailbox creation with TTL-based cleanup and optional `rootDomain` selection
- Metadata endpoint for active mailbox domains, TTL defaults, and mailbox address rules
- Idempotent mailbox ensure/resolve endpoints for address-based automation flows
- Multi-level mailbox subdomains such as `alpha.<mail-root>` and `ops.alpha.<mail-root>`
- Incoming mail storage in R2 with parsed metadata in D1
- Message list filtering by multiple mailbox addresses plus `after` / `since` cursor aliases
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
- `apps/web`: Pages-deployed React admin UI, same-origin `/api` Pages Function proxy, Storybook, Playwright smoke tests
- `docs-site`: GitHub Pages-deployed Rspress docs site that links to the public Storybook surface
- `packages/shared`: shared contracts, constants, and version metadata

## Repository scripts

```bash
bun run check            # biome checks across the monorepo
bun run typecheck        # shared + worker + web typecheck
bun run test             # worker/web unit tests
bun run build            # worker dry-run deploy + web/docs production build
bun run build-storybook  # static Storybook build
bun run build-docs-site  # static Rspress docs build
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

`apps/api-worker/wrangler.jsonc` and `apps/api-worker/wrangler.email.jsonc` are checked in with one production topology example.
Copy `.dev.vars.example` to `.dev.vars` to override those values safely for local development.

```bash
WORKER_PORT=8787 bun run --cwd apps/api-worker dev
```

### Web

The browser client now defaults to same-origin `/api`. In local dev and preview, Vite proxies `/api` to `VITE_API_BASE_URL`, falling back to `http://127.0.0.1:8787` when the variable is unset.

```bash
PORT=4173 bun run --cwd apps/web dev
```

### Storybook

```bash
STORYBOOK_PORT=6006 bun run --cwd apps/web storybook
```

### Public docs site

```bash
DOCS_PORT=56007 bun run --cwd docs-site dev
```

## Cloudflare runtime contract

The Worker expects these bindings and variables:

### Required bindings

- `DB`: D1 database
- `MAIL_BUCKET`: R2 bucket

### Required secrets

- `SESSION_SECRET`

### Optional bootstrap secrets

- `BOOTSTRAP_ADMIN_API_KEY` (only needed when `BOOTSTRAP_ADMIN_EMAIL` is also set to auto-create the first admin)

### Optional live-management runtime config

- `CLOUDFLARE_ACCOUNT_ID` (runtime variable; required for direct zone binding from `/domains`)
- `CLOUDFLARE_API_TOKEN` (runtime secret fallback)
- `CLOUDFLARE_RUNTIME_API_TOKEN` (preferred runtime secret)

### Vars

- `APP_ENV`
- `EMAIL_WORKER_NAME` (required when live Email Routing management is enabled)
- `DEFAULT_MAILBOX_TTL_MINUTES`
- `CLEANUP_BATCH_SIZE`
- `EMAIL_ROUTING_MANAGEMENT_ENABLED`
- `BOOTSTRAP_ADMIN_EMAIL`
- `BOOTSTRAP_ADMIN_NAME`
- `CF_ROUTE_RULESET_TAG`
- `WEB_APP_ORIGIN` (legacy primary control-plane origin for direct API compatibility)
- `WEB_APP_ORIGINS` (comma-separated trusted control-plane origins when multiple production aliases stay live)

### Legacy bootstrap vars

- `MAIL_DOMAIN`
- `CLOUDFLARE_ZONE_ID`

These two values are kept only for one-time bootstrap/backfill when upgrading a historical single-domain deployment. After bootstrap, the runtime truth source for mailbox domains is the D1 `domains` table.

If `EMAIL_ROUTING_MANAGEMENT_ENABLED=false`, the app still runs in demo/local mode without mutating live Email Routing resources.
The deploy workflow must inject `CLOUDFLARE_ACCOUNT_ID` into the API Worker runtime config before publish. Setting the GitHub Actions job environment alone is not enough; `/api/meta` reports `cloudflareDomainBindingEnabled=false` until the Worker runtime receives the binding.
First-party browser traffic now uses same-origin `/api`, served by Cloudflare Pages Functions and forwarded through the `API` Service Binding declared in `apps/web/wrangler.jsonc`. The checked-in Pages config now stays aligned with the live `kaisoumail` project and points at the existing `kaisoumail-api` service; preview `.pages.dev` requests fail closed inside the proxy instead of being allowed to reach the live control plane. Keep `api.cfm...` / `api.km...` style API aliases available for compatibility, automation, and direct API consumers, and keep `WEB_APP_ORIGINS` aligned with every live control-plane origin so those direct API aliases still receive the correct CORS allowlist.
`VITE_API_BASE_URL` is no longer the production browser API locator baked into the bundle. It is only used for local dev, tests, explicit non-browser overrides, and the deploy workflow's canonical direct-API smoke target. The deploy workflow separately uses `CF_PAGES_SMOKE_ORIGINS` to prove that every live Pages alias serves the same release through same-origin `/api/version` after Pages deploy completes, and malformed smoke-origin entries now fail the workflow instead of being skipped silently.

## Cloudflare API Tokens

Recommended production setup:

| Surface | Preferred secret | Fallback secret | Used for |
| --- | --- | --- | --- |
| API Worker runtime | `CLOUDFLARE_RUNTIME_API_TOKEN` | `CLOUDFLARE_API_TOKEN` | domain catalog + Email Routing management |
| Deploy workflow | `CLOUDFLARE_DEPLOY_API_TOKEN` | `CLOUDFLARE_API_TOKEN` | D1 migrate + Worker deploy + Pages deploy |

| Purpose | Stored in | Secret name | Value |
| --- | --- | --- | --- |
| Runtime mailbox-domain management | Cloudflare `kaisoumail-api` Worker secret | `CLOUDFLARE_RUNTIME_API_TOKEN` | runtime token |
| Deploy workflow | GitHub Actions repository secret | `CLOUDFLARE_DEPLOY_API_TOKEN` | deploy token |

### Runtime token minimum permissions

- `Zone: Zone: Read`
- `Zone: Zone: Edit`
- `Zone: Email Routing Rules: Edit`
- `Zone: Zone Settings: Edit`

The runtime token scope must cover every mailbox domain you want the control plane to discover, bind, enable, or delete.

`Zone: Zone Settings: Edit` is the permission most often missed. If a zone appears in the catalog but enabling it fails with `provisioning_error` / `Authentication error`, check that permission first and confirm the token scope covers the target zone.

### Deploy token minimum permissions

The release and deploy workflows need:

- `Account: D1: Edit`
- `Account: Workers Scripts: Edit`
- `Account: Workers R2 Storage: Edit`
- `Account: Cloudflare Pages: Edit`
- `Zone: Workers Routes: Edit`

### Shared token is quickstart only

If you intentionally keep one shared `CLOUDFLARE_API_TOKEN`, put it in both the Worker secret and the GitHub repository secret. It must satisfy the union:

- `Zone: Zone: Read`
- `Zone: Zone: Edit`
- `Zone: Email Routing Rules: Edit`
- `Zone: Zone Settings: Edit`
- `Account: D1: Edit`
- `Account: Workers Scripts: Edit`
- `Account: Workers R2 Storage: Edit`
- `Account: Cloudflare Pages: Edit`
- `Zone: Workers Routes: Edit`

Use shared-token mode only for fastest onboarding, short-lived evaluation, or low-risk single-operator use.

## D1 and R2 layout

### D1 tables

- `users`
- `api_keys`
- `domains`
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
- `GET /api/meta`
- `GET|POST|DELETE /api/auth/session`
- `GET|POST /api/api-keys`
- `POST /api/api-keys/:id/revoke`
- `GET|POST /api/domains`
- `GET /api/domains/catalog`
- `POST /api/domains/bind`
- `POST /api/domains/:id/retry`
- `POST /api/domains/:id/disable`
- `POST /api/domains/:id/delete`
- `GET|POST /api/mailboxes`
- `POST /api/mailboxes/ensure`
- `GET /api/mailboxes/resolve`
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
- `deploy-main.yml`: D1 migrations, Worker deploy, Pages direct upload on `main`
- `docs-pages.yml`: GitHub Pages build/deploy for the public docs site and Storybook bundle
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
- all GitHub API operations use the default `secrets.GITHUB_TOKEN`; no extra PAT or custom GitHub credential is required

### Manual backfill

If a `main` commit already passed `CI Main`, you can backfill the release workflow manually:

```bash
Actions -> Release -> Run workflow -> commit_sha=<main commit sha>
```

To use the deploy workflow, configure:

- GitHub secret: `CLOUDFLARE_DEPLOY_API_TOKEN` (or fall back to `CLOUDFLARE_API_TOKEN` for quickstart)
- GitHub secret: `CLOUDFLARE_ACCOUNT_ID`
- GitHub variable: `CF_PAGES_PROJECT_NAME`
- GitHub variable: `VITE_API_BASE_URL`
- The deploy workflow now renders `apps/api-worker/wrangler.deploy.generated.jsonc`, injects `CLOUDFLARE_ACCOUNT_ID` into the API Worker runtime vars, checks that `wrangler deploy --dry-run` exposes `env.CLOUDFLARE_ACCOUNT_ID`, and then requires `/api/meta` to report `cloudflareDomainBindingEnabled=true` before the API release is accepted
- Keep one existing 100%-stable API Worker deployment available as the baseline for schema-stable releases; the automatic deploy path now applies remote D1 migrations, uploads a non-live API Worker version, adds it to the active deployment at 0% traffic, smoke-tests it through the canonical API custom domain with `Cloudflare-Workers-Version-Overrides`, promotes it to 100% production traffic only after that shadow `/health` + `/api/version` smoke passes, runs production smoke before any trigger changes, applies route/domain/cron trigger changes explicitly only after that smoke passes, reruns post-trigger smoke across every API URL declared by `VITE_API_BASE_URL` plus `apps/api-worker/wrangler.jsonc`, deploys Pages, and finally reruns same-origin `/api/version` smoke across every Pages origin declared in `CF_PAGES_SMOKE_ORIGINS` before the workflow reports success
- CI blocks obviously destructive D1 migrations on the default auto path, and the deploy workflow re-validates the actual remote pending migration set before apply; keep schema changes expand-only / forward-compatible, carry compatibility code for at most one release, and defer destructive cleanup to a later cleanup release

To use the public docs workflow, enable GitHub Pages for this repository and keep the default Pages environment ready for `.github/workflows/docs-pages.yml`.

## Deployment checklist

1. Create or reuse the Cloudflare Pages project referenced by `CF_PAGES_PROJECT_NAME`
2. Bind one or more control-plane origins (for example `cfm.example.com` and `km.example.com`) to Pages, and attach the matching API custom domains (for example `api.cfm.example.com` and `api.km.example.com`) to the API Worker
3. Set the Worker runtime secret `SESSION_SECRET`, and only add `BOOTSTRAP_ADMIN_API_KEY` when you also set `BOOTSTRAP_ADMIN_EMAIL` for first-admin bootstrap
4. Set `EMAIL_WORKER_NAME` to the Email Worker script that should receive routed mail
5. Set GitHub secret `CLOUDFLARE_DEPLOY_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` (or fall back to shared `CLOUDFLARE_API_TOKEN`), and ensure the deploy/shared token includes `Account: Workers R2 Storage: Edit`; the workflow injects `CLOUDFLARE_ACCOUNT_ID` into the API Worker runtime config during deploy, so leaving the secret unset now fails closed instead of publishing a version with direct domain binding disabled
6. Set GitHub vars `CF_PAGES_PROJECT_NAME=<your Pages project>`, `VITE_API_BASE_URL=<your canonical direct API origin for deploy smoke>`, and `CF_PAGES_SMOKE_ORIGINS=<comma-separated Pages origins that must pass same-origin /api/version smoke after deploy>`
7. Set `WEB_APP_ORIGINS=<comma-separated Pages origins>` and optionally keep `WEB_APP_ORIGIN=<your primary Pages origin>` for legacy direct-API compatibility
8. For upgrades from a historical single-domain deployment, keep `MAIL_DOMAIN` + `CLOUDFLARE_ZONE_ID` populated for the first deploy so bootstrap can backfill the initial `domains` row
9. Bootstrap the very first production API deploy manually; after that, keep one 100%-stable API deployment available so the workflow can stage a 0%-traffic candidate, smoke-test it through the canonical API custom domain with `Cloudflare-Workers-Version-Overrides`, and then promote or roll back safely
10. Put `VITE_API_BASE_URL` in local `.env` or preview overrides when you want `apps/web` dev/preview to proxy `/api` somewhere other than the default local Worker target
11. Push to `main` to trigger the deploy workflow
12. Use `Actions -> Deploy -> Run workflow -> operation=restore-d1` with a timestamp or bookmark when you need a D1 Time Travel restore (Cloudflare D1 Time Travel currently keeps a 30-day restore window)
13. Push docs or Storybook changes to `main` to refresh the GitHub Pages docs bundle

## Worker topology

- `kaisoumail-api`
  - serves direct API aliases plus the scheduled cleanup trigger
  - owns the REST API and the runtime used behind the Pages same-origin `/api` proxy
- `email-receiver-worker`
  - receives Email Routing `email()` events
  - uses the same source code as `kaisoumail-api`, but is deployed with the dedicated `wrangler.email.jsonc` config and the same D1/R2 bindings

## Domain topology example

- Web UI aliases:
  - `https://cfm.example.com`
  - `https://km.example.com`
- Worker API aliases:
  - `https://api.cfm.example.com`
  - `https://api.km.example.com`
- Mail root domains managed in-app:
  - `707979.xyz`
  - `mail.example.net`
- Mailboxes can either select a root domain explicitly or omit it and let the API randomly choose one active domain; nested subdomains still work:
  - `build@alpha.707979.xyz`
  - `spec@ops.alpha.mail.example.net`

## Notes on Cloudflare limits

- Email Routing single-message limit is 25 MiB
- D1 stores structured indices only; raw/parsed payloads stay in R2
- Expired mailbox cleanup is batched to stay within Worker execution limits
- Active mailbox concurrency is still bounded by Cloudflare Email Routing rule limits
