# CF Mail

基于 Cloudflare Email Routing、Workers、D1、R2 的临时邮箱平台，带有 React + shadcn/ui 控制台。

## 文档与 Storybook

- 公开文档站：[ivanli-cn.github.io/cf-mail](https://ivanli-cn.github.io/cf-mail/)
- 公开 Storybook：[ivanli-cn.github.io/cf-mail/storybook.html](https://ivanli-cn.github.io/cf-mail/storybook.html)
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

当前工程默认只提供一个 `CLOUDFLARE_API_TOKEN`，同时用于部署和运行时域名管理。这个默认值最容易上手，但从严格安全角度看，它并不是长期生产环境的优先做法。

### 场景 A：只给运行时域名管理使用

如果你把部署 token 和运行时 token 分开，当前运行时代码路径只会调用这些接口：

- `GET /zones`
- `GET /zones/:zone_id`
- `POST /zones/:zone_id/email/routing/enable`
- `POST /zones/:zone_id/email/routing/dns`
- `POST /zones/:zone_id/email/routing/rules`
- `DELETE /zones/:zone_id/email/routing/rules/:rule_id`

按这条运行时路径，最小权限应写成：

- `Zone: Zone: Read`
- `Zone: Email Routing Rules: Edit`
- `Zone: Zone Settings: Edit`

token 的 scope 仍然必须覆盖所有要接入 CF Mail 的 zones。

其中最容易漏的是 `Zone: Zone Settings: Edit`。如果域名目录里某个 zone 明明可见，却在启用时变成 `provisioning_error / Authentication error`，优先检查这项权限和 token 的 zone 覆盖范围。

### 场景 B：同一把 token 同时负责部署和运行时

这就是当前仓库默认的接线方式，也是上手最快的方式。若继续共用同一把 `CLOUDFLARE_API_TOKEN`，它必须满足并集权限：

- `Zone: Zone: Read`
- `Zone: Email Routing Rules: Edit`
- `Zone: Zone Settings: Edit`
- `Account: D1: Edit`
- `Account: Workers Scripts: Edit`
- `Account: Cloudflare Pages: Edit`
- `Zone: Workers Routes: Edit`

### 严格安全判断

如果你的优先级是“先跑起来”，例如单人维护、自建环境、临时验证或低风险小规模使用，共用同一把 token 是可以接受的。

但从更严格的安全视角看，这不是更优做法：

- 它把部署权限和线上运行时变更权限绑在了同一把凭据上
- GitHub Actions secret 或运行中的 Worker secret 任一侧泄露，影响面都会放大
- 长期自动化更适合使用独立、最小权限、边界清晰、且最好由账户持有的 token

更推荐的长期方案是：

- 一个运行时 token，只保留上面的运行时最小权限
- 一个部署 token，只保留下面的部署权限

### 仅部署权限

部署流程还需要：

- `Account: D1: Edit`
- `Account: Workers Scripts: Edit`
- `Account: Cloudflare Pages: Edit`
- `Zone: Workers Routes: Edit`

## 环境变量

Worker 侧重点变量：

- `SESSION_SECRET`
- `BOOTSTRAP_ADMIN_API_KEY`
- `CLOUDFLARE_API_TOKEN`
- `EMAIL_WORKER_NAME`
- `EMAIL_ROUTING_MANAGEMENT_ENABLED`
- `WEB_APP_ORIGIN`

Web 侧重点变量：

- `VITE_API_BASE_URL`
- `VITE_DEMO_MODE`
- `VITE_DOCS_SITE_ORIGIN`

`VITE_DOCS_SITE_ORIGIN` 用于控制台内部跳转到公开文档站和公开 Storybook。

## 发布面

- Cloudflare Pages：登录后的控制台
- Cloudflare Workers：API 与收信 Worker
- GitHub Pages：公开文档站 + Storybook 组合站点
