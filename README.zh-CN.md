# KaisouMail

基于 Cloudflare Email Routing、Workers、D1、R2 的临时邮箱平台，带有 React + shadcn/ui 控制台。

## 文档与 Storybook

- 公开文档站：[ivanli-cn.github.io/KaisouMail/zh/](https://ivanli-cn.github.io/KaisouMail/zh/)
- 公开 Storybook：[ivanli-cn.github.io/KaisouMail/zh/storybook.html](https://ivanli-cn.github.io/KaisouMail/zh/storybook.html)
- 英文 README：[README.md](./README.md)
- 控制台内速查页：`/api-keys/docs`

## 核心能力

- 多用户临时邮箱与 API Key 管理
- 基于 D1 的多邮箱根域管理与 Cloudflare zone 实时发现
- 随机或指定邮箱创建，支持多级子域
- `GET /api/meta` 暴露 active 域名、TTL 和地址规则
- 邮件原始内容入 R2，结构化索引入 D1
- 域名目录支持启用、停用、重试接入

## 仓库结构

- `apps/api-worker`：API Worker、收信 Worker、清理任务、Drizzle schema、Wrangler 配置
- `apps/web`：登录后的控制台、Storybook、Playwright smoke
- `docs-site`：公开 Rspress 文档站，最终发布到 GitHub Pages
- `packages/shared`：共享 schema、常量、版本信息

## 常用脚本

```bash
bun run check
bun run typecheck
bun run test
bun run build
bun run build-storybook
bun run build-docs-site
```

## 本地开发

```bash
bun install
bun run version:write
cp apps/api-worker/.dev.vars.example apps/api-worker/.dev.vars
cp apps/web/.env.example apps/web/.env
```

启动：

```bash
WORKER_PORT=8787 bun run --cwd apps/api-worker dev
PORT=4173 bun run --cwd apps/web dev
DOCS_PORT=56007 bun run --cwd docs-site dev
STORYBOOK_PORT=6006 bun run --cwd apps/web storybook
```

## Cloudflare API Token 权限

正式环境推荐配置：

| 面向 | 优先读取 | 回退读取 | 用途 |
| --- | --- | --- | --- |
| API Worker 运行时 | `CLOUDFLARE_RUNTIME_API_TOKEN` | `CLOUDFLARE_API_TOKEN` | 域名目录 + Email Routing 管理 |
| 部署流水线 | `CLOUDFLARE_DEPLOY_API_TOKEN` | `CLOUDFLARE_API_TOKEN` | D1 migrate + Worker deploy + Pages deploy |

| 用途 | 存放位置 | 密钥名 | 应填什么 |
| --- | --- | --- | --- |
| 运行时域名管理 | Cloudflare `kaisoumail-api` Worker secret | `CLOUDFLARE_RUNTIME_API_TOKEN` | runtime token |
| 部署流水线 | GitHub Actions repository secret | `CLOUDFLARE_DEPLOY_API_TOKEN` | deploy token |

### Runtime token 最小权限

- `Zone: Zone: Read`
- `Zone: Email Routing Rules: Edit`
- `Zone: Zone Settings: Edit`

scope 必须覆盖所有要接入 KaisouMail 的 zones。

其中最容易漏的是 `Zone: Zone Settings: Edit`。如果域名目录里某个 zone 明明可见，却在启用时变成 `provisioning_error / Authentication error`，优先检查这项权限和 token 的 zone 覆盖范围。

### Deploy token 最小权限

部署流程还需要：

- `Account: D1: Edit`
- `Account: Workers Scripts: Edit`
- `Account: Workers R2 Storage: Edit`
- `Account: Cloudflare Pages: Edit`
- `Zone: Workers Routes: Edit`

### 只在快速试用时允许共用

如果你只是单人试用、自建环境、临时验证或低风险内部演示，可以在 Worker secret 和 GitHub repository secret 里都放同一个 `CLOUDFLARE_API_TOKEN`，但它必须满足并集权限：

- `Zone: Zone: Read`
- `Zone: Email Routing Rules: Edit`
- `Zone: Zone Settings: Edit`
- `Account: D1: Edit`
- `Account: Workers Scripts: Edit`
- `Account: Workers R2 Storage: Edit`
- `Account: Cloudflare Pages: Edit`
- `Zone: Workers Routes: Edit`

共享 token 只建议用于最快上手、临时验证和低风险单人环境。

## 环境变量

Worker 侧重点变量：

- `SESSION_SECRET`
- `BOOTSTRAP_ADMIN_API_KEY`（仅当你同时设置 `BOOTSTRAP_ADMIN_EMAIL` 用于首次管理员引导时才需要）
- `CLOUDFLARE_API_TOKEN`
- `CLOUDFLARE_RUNTIME_API_TOKEN`
- `EMAIL_WORKER_NAME`
- `EMAIL_ROUTING_MANAGEMENT_ENABLED`
- `WEB_APP_ORIGIN`

Web 侧重点变量：

- `VITE_API_BASE_URL`
- `VITE_DEMO_MODE`
- `VITE_DOCS_SITE_ORIGIN`

`VITE_DOCS_SITE_ORIGIN` 用于控制台内部跳转到公开文档站和公开 Storybook。

## 发布工作流门禁

- 主发布 workflow 会先捕获当前 100% 稳定的 API Worker 版本；只有 release 不包含 D1 migration diff 时，才允许走 rollback-backed 的自动发布路径
- 因为要保留可回滚目标，首次生产 API 发布需要手动 bootstrap；自动发布从第二次开始使用

## 发布面

- Cloudflare Pages：登录后的控制台
- Cloudflare Workers：API 与收信 Worker
- GitHub Pages：公开文档站 + Storybook 组合站点
