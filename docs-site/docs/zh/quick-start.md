# 快速开始

## 安装依赖

```bash
bun install
bun run version:write
```

## 准备本地环境

```bash
cp apps/api-worker/.dev.vars.example apps/api-worker/.dev.vars
cp apps/web/.env.example apps/web/.env
```

最少补齐这些变量：

- `apps/api-worker/.dev.vars`
  - `SESSION_SECRET`
  - `BOOTSTRAP_ADMIN_API_KEY`（可选；仅当你同时设置 `BOOTSTRAP_ADMIN_EMAIL` 用于首次管理员引导时才需要）
  - `WEB_APP_ORIGIN`（passkey 必需；它提供主 WebAuthn 可信来源）
  - `WEB_APP_ORIGINS`（可选；如果要同时保留多个生产控制台域名给 passkey 使用，就在这里补充）
- `apps/web/.env`
  - `VITE_API_BASE_URL`

## 启动 API Worker 和控制台

```bash
WORKER_PORT=8787 bun run --cwd apps/api-worker dev
PORT=4173 bun run --cwd apps/web dev
```

## 启动公开文档和 Storybook

```bash
DOCS_PORT=56007 bun run --cwd docs-site dev
STORYBOOK_PORT=6006 bun run --cwd apps/web storybook
```

## 本地访问地址

- 控制台：`http://127.0.0.1:4173`
- API Worker：`http://127.0.0.1:8787`
- 公开文档：`http://127.0.0.1:56007`
- Storybook：`http://127.0.0.1:6006`

## 登录方式

- 浏览器用户首次登录后，可在 `/api-keys` 页面注册 passkey，后续直接在登录页用 passkey 登录
- 自动化与应急恢复流程继续使用 API Key

## 生产发布面

- Cloudflare Workers：API 与收信 Worker
- Cloudflare Pages：登录后的控制台
- GitHub Pages：公开文档站和 Storybook

## 相关文档

- [Cloudflare Token 权限](/zh/cloudflare-token-permissions)
- [部署与环境变量](/zh/deployment-environment)
- [域名目录与启用流程](/zh/domain-catalog-enablement)
