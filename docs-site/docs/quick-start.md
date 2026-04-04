# 快速开始

## 本地开发

```bash
bun install
bun run version:write
cp apps/api-worker/.dev.vars.example apps/api-worker/.dev.vars
cp apps/web/.env.example apps/web/.env
```

启动控制台与 API：

```bash
WORKER_PORT=8787 bun run --cwd apps/api-worker dev
PORT=4173 bun run --cwd apps/web dev
```

启动公开文档站与 Storybook：

```bash
DOCS_PORT=56007 bun run --cwd docs-site dev
STORYBOOK_PORT=6006 bun run --cwd apps/web storybook
```

## 生产形态

- Cloudflare Workers：API 与收信 Worker
- Cloudflare Pages：登录后的控制台
- GitHub Pages：公开文档站 + Storybook

## 推荐阅读顺序

1. [部署与环境变量](./deployment-environment)
2. [Cloudflare Token 权限](./cloudflare-token-permissions)
3. [域名目录与启用流程](./domain-catalog-enablement)
4. [FAQ / 故障排查](./faq)

## English summary

Use `apps/api-worker` for the Worker API, `apps/web` for the authenticated control plane, `docs-site` for public docs, and Storybook for component review. Production deployment splits control plane and public docs across Cloudflare Pages and GitHub Pages respectively.
