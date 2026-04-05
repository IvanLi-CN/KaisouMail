# Quick Start

## Install dependencies

```bash
bun install
bun run version:write
```

## Prepare local environment files

```bash
cp apps/api-worker/.dev.vars.example apps/api-worker/.dev.vars
cp apps/web/.env.example apps/web/.env
```

Minimum variables:

- `apps/api-worker/.dev.vars`
  - `SESSION_SECRET`
  - `BOOTSTRAP_ADMIN_API_KEY`
  - `WEB_APP_ORIGIN`
- `apps/web/.env`
  - `VITE_API_BASE_URL`

## Start the Worker API and control plane

```bash
WORKER_PORT=8787 bun run --cwd apps/api-worker dev
PORT=4173 bun run --cwd apps/web dev
```

## Start public docs and Storybook

```bash
DOCS_PORT=56007 bun run --cwd docs-site dev
STORYBOOK_PORT=6006 bun run --cwd apps/web storybook
```

## Local URLs

- Control plane: `http://127.0.0.1:4173`
- Worker API: `http://127.0.0.1:8787`
- Public docs: `http://127.0.0.1:56007`
- Storybook: `http://127.0.0.1:6006`

## Production surfaces

- Cloudflare Workers: API Worker and inbound email Worker
- Cloudflare Pages: authenticated control plane
- GitHub Pages: public docs and Storybook

## Related pages

- [Cloudflare Token Permissions](/cloudflare-token-permissions)
- [Deployment & Environment](/deployment-environment)
- [Domain Catalog & Enablement](/domain-catalog-enablement)
