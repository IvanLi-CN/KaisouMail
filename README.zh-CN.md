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
- `apps/web`：登录后的控制台、同源 `/api` Pages Function 代理、Storybook、Playwright smoke
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

`apps/web` 里的浏览器请求现在默认走同源 `/api`。本地 dev / preview 会把 `/api` 代理到 `VITE_API_BASE_URL`，未设置时回退到 `http://127.0.0.1:8787`。

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
一方浏览器流量现在统一走同源 `/api`，由 `apps/web/wrangler.jsonc` 里声明的 Pages Function + Service Binding 转发到 `kaisoumail-api`。`api.cfm...` / `api.km...` 这样的直连 API 域名继续保留给兼容调用、自动化脚本和直接 API 消费者使用；`WEB_APP_ORIGINS` 需要继续覆盖所有线上控制台域名，这样这些直连 API 域名仍会拿到正确的 CORS allowlist。
`VITE_API_BASE_URL` 不再是生产浏览器的 API 定位方式，只保留给本地开发、预览、测试、显式的非浏览器 override，以及 deploy workflow 的 canonical 直连 API smoke。deploy workflow 另外使用 `CF_PAGES_SMOKE_ORIGINS`，在 Pages 发布完成后逐个验证每个控制台域名的同源 `/api/version` 都指向当前 release。

## 发布工作流门禁

- 主发布 workflow 会先捕获 D1 恢复锚点，并额外捕获当前 100% 稳定的 API Worker 基线版本；随后自动 apply 远端 D1 migration、上传一个不接生产流量的 API Worker 候选版本，把它以 0% 流量加入当前 active deployment，并通过 canonical API 域名 + `Cloudflare-Workers-Version-Overrides` 定向 smoke 校验 `/health` 与 `/api/version`；只有 shadow smoke 通过后才 promote 到 100% 生产流量
- Promote 成功后 workflow 会先对正式 API 域名跑一次 production smoke；只有这一步通过后才显式应用 API Worker 的 routes / domains / cron triggers，并在 trigger 应用后对 `VITE_API_BASE_URL` 与 `apps/api-worker/wrangler.jsonc` 里声明的每个 API URL 再跑一次 post-trigger smoke。随后 workflow 会部署 Pages，并按 `CF_PAGES_SMOKE_ORIGINS` 逐个校验每个控制台域名的同源 `/api/version` 是否已经指向当前 release。trigger 应用失败、post-trigger smoke 失败，或 Pages 同源 smoke 失败都会直接停下并要求人工核查；只有相对上一版 release 保持 schema-stable 且当前部署不涉及 D1 schema 变更的发布，production smoke 失败时才会自动回滚 API Worker，不自动 restore D1
- `CI Main / CI PR` 会阻止明显破坏性的 migration 进入默认自动链路，Deploy 在 apply 前也会按远端 pending migration 实际集合再校验一次；默认发布路径只接受 expand-only / forward-compatible 迁移，兼容代码最多保留一个发布周期，破坏性清理放到后续 cleanup release
- 因为要保留可回滚目标，首次生产 API 发布仍需要手动 bootstrap；异常事故的 D1 恢复走 `workflow_dispatch -> operation=restore-d1`

## 发布面

- Cloudflare Pages：登录后的控制台
- Cloudflare Workers：API 与收信 Worker
- GitHub Pages：公开文档站 + Storybook 组合站点

## 部署检查清单

1. 创建或复用 `CF_PAGES_PROJECT_NAME` 指向的 Cloudflare Pages 项目
2. 给 Pages 绑定一个或多个控制台域名（例如 `cfm.example.com`、`km.example.com`），同时给 API Worker 绑定对应的 API 自定义域（例如 `api.cfm.example.com`、`api.km.example.com`）
3. 配置 Worker runtime secret `SESSION_SECRET`；只有在你同时设置 `BOOTSTRAP_ADMIN_EMAIL` 做首次管理员引导时，才再配置 `BOOTSTRAP_ADMIN_API_KEY`
4. 把 `EMAIL_WORKER_NAME` 指向收信 Worker 脚本
5. 配置 GitHub secret：`CLOUDFLARE_DEPLOY_API_TOKEN`、`CLOUDFLARE_ACCOUNT_ID`（或临时回退到共享 `CLOUDFLARE_API_TOKEN`），并确认 deploy/shared token 包含 `Account: Workers R2 Storage: Edit`
6. 配置 GitHub vars：`CF_PAGES_PROJECT_NAME=<你的 Pages 项目>`、`VITE_API_BASE_URL=<你的 canonical 直连 API 域名，用于 deploy smoke>`、`CF_PAGES_SMOKE_ORIGINS=<逗号分隔的控制台域名列表，用于 Pages 发布后的同源 /api/version smoke>`
7. 配置 `WEB_APP_ORIGINS=<逗号分隔的控制台域名列表>`，如需兼容旧的单来源直连 API 配置，再保留 `WEB_APP_ORIGIN=<主控制台域名>`
8. 如果是从历史单域实例升级，首次部署时保留 `MAIL_DOMAIN` + `CLOUDFLARE_ZONE_ID`，让 bootstrap 回填初始 `domains` 记录
9. 第一次生产 API 发布仍需手动 bootstrap；之后保持至少一个 100% stable 的 API 版本，workflow 才能把候选版本以 0% 流量加入 active deployment，经由 canonical API 域名 + `Cloudflare-Workers-Version-Overrides` 完成 shadow smoke，再安全 promote 或回滚
10. 只有在本地 `.env` / 预览 override 里才设置 `VITE_API_BASE_URL`，用于把 `apps/web` 的 `/api` 代理到默认本地 Worker 之外的目标
11. 推送到 `main` 触发 deploy workflow
12. 需要恢复 D1 时，使用 `Actions -> Deploy -> Run workflow -> operation=restore-d1` 并提供 timestamp 或 bookmark（Cloudflare D1 Time Travel 当前默认保留 30 天恢复窗口）
13. 推送文档或 Storybook 变更到 `main` 刷新 GitHub Pages 公开站点

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
