# 部署与环境变量

## Worker 必备绑定

| 名称 | 用途 |
| --- | --- |
| `DB` | D1 数据库 |
| `MAIL_BUCKET` | R2 邮件原文存储 |

## Worker 必备 secret

| 名称 | 用途 |
| --- | --- |
| `SESSION_SECRET` | 会话签名 |

## 仅首次引导时才需要的 Worker secret

| 名称 | 用途 |
| --- | --- |
| `BOOTSTRAP_ADMIN_API_KEY` | 首次引导管理员 API Key；仅当同时设置 `BOOTSTRAP_ADMIN_EMAIL` 时才需要 |

## Worker 运行变量

| 名称 | 用途 |
| --- | --- |
| `APP_ENV` | 环境标识 |
| `EMAIL_WORKER_NAME` | Email Routing 指向的收信 Worker 名称 |
| `DEFAULT_MAILBOX_TTL_MINUTES` | 默认 TTL |
| `CLEANUP_BATCH_SIZE` | 清理批次大小 |
| `EMAIL_ROUTING_MANAGEMENT_ENABLED` | 是否允许项目直接改 Cloudflare Email Routing |
| `BOOTSTRAP_ADMIN_EMAIL` | 首个管理员邮箱 |
| `BOOTSTRAP_ADMIN_NAME` | 首个管理员名称 |
| `CF_ROUTE_RULESET_TAG` | Worker route 管理标记 |
| `WEB_APP_ORIGIN` | 历史单来源兼容时使用的主控制台来源 |
| `WEB_APP_ORIGINS` | 需要同时保留多个生产控制台域名时使用的逗号分隔来源列表 |

## 单域历史实例升级时才会用到

| 名称 | 用途 |
| --- | --- |
| `MAIL_DOMAIN` | 历史单域实例回填 |
| `CLOUDFLARE_ZONE_ID` | 历史单域实例回填 |

如果是新实例，不要再把这两个变量当长期配置源。

## Web 环境变量

| 名称 | 用途 |
| --- | --- |
| `VITE_API_BASE_URL` | 同源 `/api` 代理在本地 dev / preview 时的目标地址，或显式的非浏览器 override |
| `VITE_DEMO_MODE` | 本地演示模式 |
| `VITE_DOCS_SITE_ORIGIN` | 控制台里跳到公开文档站和公开 Storybook 的地址 |

如果 `VITE_DOCS_SITE_ORIGIN` 不填，控制台仍能用站内速查页，但不会显示公开站入口。
`VITE_API_BASE_URL` 不再是生产浏览器的 API 定位方式；一方浏览器流量默认统一走同源 `/api`。

## Pages 同源 `/api` 代理

控制台现在把 API 访问统一收敛到每个 Pages 域名自己的同源 `/api`：

- `apps/web/public/_routes.json` 只把 `/api/*` 送进 Pages Functions
- `apps/web/functions/api/[[path]].ts` 直接把收到的 `Request` 转发给 `env.API.fetch(...)`
- `apps/web/wrangler.jsonc` 声明了 Pages build output，以及指向 `kaisoumail-api` 的 `API` Service Binding
- 普通 HTML、JS、CSS 和静态资源不会进入 Function，因此不会把静态流量额外记成 Workers 请求

像 `https://api.cfm.707979.xyz`、`https://api.km.707979.xyz` 这样的直连 API 自定义域仍然保留给兼容调用或直接 API 消费者使用。`WEB_APP_ORIGINS` 继续承担这些直连 API 域名的 CORS allowlist；但一方浏览器控制台应优先使用同源 `/api`。

## 生产别名示例

- 控制台：`https://cfm.707979.xyz`、`https://km.707979.xyz`
- API：`https://api.cfm.707979.xyz`、`https://api.km.707979.xyz`

## 发布工作流安全门禁

- 生产发布 workflow 会先捕获当前 100% 稳定的 API Worker 版本，再发布新的 API 版本
- 如果目标 release 包含 D1 migration diff，或远端 D1 仍有 pending migration，workflow 会直接 fail closed，因为 rollback-backed 自动发布只支持远端 migration 状态干净的 schema-stable release
- 对于远端没有 pending migration 的 schema-stable release，workflow 会先对每个直连 API alias 跑 rollback-backed 的 `/health` + `/api/version` smoke 检查，再决定是否继续 Pages 发布
- Pages 发布完成后，workflow 还会遍历 `CF_PAGES_SMOKE_ORIGINS` 里的每个控制台域名，检查 `${origin}/api/version` 是否返回当前 release short SHA；任何一个域名不匹配都会阻断收口
- 因为 workflow 没有回滚目标时也会 fail closed，所以第一次生产 API 发布需要手动 bootstrap

## GitHub Pages 公开站点

`docs-pages` workflow 会发布三个公开入口：

- `/`：英文文档首页
- `/zh/`：中文文档首页
- `/storybook/`：Storybook 静态站
- `/storybook.html`：英文 Storybook 跳转页
- `/zh/storybook.html`：中文 Storybook 跳转页
