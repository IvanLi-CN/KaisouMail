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
- `/domains` 支持直接绑定新域名到 Cloudflare，并仅对项目直绑域名开放删除
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
- `Zone: Zone: Edit`
- `Zone: Email Routing Rules: Edit`
- `Zone: Zone Settings: Edit`

scope 必须覆盖所有要接入、绑定、启用或删除的 KaisouMail zones。

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
- `Zone: Zone: Edit`
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
- `WEB_APP_ORIGIN`（历史单来源兼容用的主控制台域名）
- `WEB_APP_ORIGINS`（需要同时保留多个生产控制台域名时使用的逗号分隔 allowlist）

Web 侧重点变量：

- `VITE_API_BASE_URL`
- `VITE_DEMO_MODE`
- `VITE_DOCS_SITE_ORIGIN`

`VITE_DOCS_SITE_ORIGIN` 用于控制台内部跳转到公开文档站和公开 Storybook。
`WEB_APP_ORIGINS` 应与所有线上控制台域名保持一致；这样当控制台从不同别名域访问时，前端就能优先命中同族 API 域名，而 `VITE_API_BASE_URL` 继续作为本地和预览环境的回退值。

## 发布工作流门禁

- 主发布 workflow 会先捕获当前 100% 稳定的 API Worker 版本；只有 release 不包含 D1 migration diff 且远端 D1 没有 pending migration 时，才允许走 rollback-backed 的自动发布路径
- 因为要保留可回滚目标，首次生产 API 发布需要手动 bootstrap；自动发布从第二次开始使用

## 发布面

- Cloudflare Pages：登录后的控制台
- Cloudflare Workers：API 与收信 Worker
- GitHub Pages：公开文档站 + Storybook 组合站点

## 部署检查清单

1. 在 Cloudflare 中创建一次 `kaisoumail` Pages 项目
2. 给 Pages 绑定一个或多个控制台域名（例如 `cfm.example.com`、`km.example.com`），同时给 API Worker 绑定对应的 API 自定义域（例如 `api.cfm.example.com`、`api.km.example.com`）
3. 配置 Worker runtime secret `SESSION_SECRET`；只有在你同时设置 `BOOTSTRAP_ADMIN_EMAIL` 做首次管理员引导时，才再配置 `BOOTSTRAP_ADMIN_API_KEY`
4. 把 `EMAIL_WORKER_NAME` 指向收信 Worker 脚本
5. 配置 GitHub secret：`CLOUDFLARE_DEPLOY_API_TOKEN`、`CLOUDFLARE_ACCOUNT_ID`（或临时回退到共享 `CLOUDFLARE_API_TOKEN`），并确认 deploy/shared token 包含 `Account: Workers R2 Storage: Edit`
6. 配置 GitHub vars：`CF_PAGES_PROJECT_NAME=kaisoumail`、`VITE_API_BASE_URL=<你的 canonical API 域名>`
7. 配置 `WEB_APP_ORIGINS=<逗号分隔的控制台域名列表>`，如需兼容旧的单来源配置，再保留 `WEB_APP_ORIGIN=<主控制台域名>`
8. 如果是从历史单域实例升级，首次部署时保留 `MAIL_DOMAIN` + `CLOUDFLARE_ZONE_ID`，让 bootstrap 回填初始 `domains` 记录
9. 第一次生产 API 发布仍需手动 bootstrap；之后保持至少一个 100% stable 的 API 版本，workflow 才能在 smoke 失败时自动回滚
10. 推送到 `main` 触发 deploy workflow
11. 推送文档或 Storybook 变更到 `main` 刷新 GitHub Pages 公开站点

## 域名拓扑示例

- 控制台别名：
  - `https://cfm.example.com`
  - `https://km.example.com`
- API 别名：
  - `https://api.cfm.example.com`
  - `https://api.km.example.com`
- 应用内管理的邮箱根域：
  - `707979.xyz`
  - `mail.example.net`
