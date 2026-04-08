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
| `WEB_APP_ORIGIN` | passkey 使用的主控制台来源；如果只配置单一来源，它的 host 会直接成为 RP ID；passkey 只接受 `localhost` 或域名来源，不接受 IP 字面量 |
| `WEB_APP_ORIGINS` | 需要同时保留多个生产控制台域名时使用的逗号分隔来源列表；passkey 会信任这里全部 origin，并从整组 host 推导共享的非 public suffix RP ID 后缀 |

## 单域历史实例升级时才会用到

| 名称 | 用途 |
| --- | --- |
| `MAIL_DOMAIN` | 历史单域实例回填 |
| `CLOUDFLARE_ZONE_ID` | 历史单域实例回填 |

如果是新实例，不要再把这两个变量当长期配置源。

## Web 环境变量

| 名称 | 用途 |
| --- | --- |
| `VITE_API_BASE_URL` | 同源 `/api` 代理在本地 dev / preview 时的目标地址，以及 deploy workflow 的 canonical 直连 API smoke URL |
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

- 生产发布 workflow 会先捕获一个 D1 Time Travel 恢复锚点；如果是 schema-stable 发布，还会额外捕获当前 100% 稳定的 API Worker 回滚目标，再发布新的 API 版本
- workflow 会自动 apply 远端 D1 migration、上传一个不接生产流量的 API Worker 预览版本，并且只有在 canonical 直连 API 域名上的 shadow `/health` + `/api/version` smoke 通过后才 promote 到 100% 生产流量
- Promote 之后会先对正式 API 域名跑一次 `/health` + `/api/version` production smoke；只有这一步通过后才显式应用 API Worker 的 routes / domains / cron triggers，并在 trigger 应用后对 `VITE_API_BASE_URL` 和 `apps/api-worker/wrangler.jsonc` 里声明的每个 API URL 再跑一次 post-trigger smoke。如果 trigger 应用本身报错，或 post-trigger smoke 失败，则先停下并要求人工核查 trigger 状态；只有相对上一版 release 保持 schema-stable 且当前部署不涉及 D1 schema 变更的发布，production smoke 失败时才自动回滚 API Worker，随后阻断 Email Worker 与 Pages 发布
- D1 restore 仍然是显式的 `workflow_dispatch` 灾难恢复入口，不会绑定到常规发布失败分支，因为自动恢复数据库可能抹掉真实写入
- `CI Main` 与 `CI PR` 会拦截明显破坏性的 SQL migration，Deploy 在 apply 前也会按远端 pending migration 实际集合再校验一次；默认自动发布路径只接受 expand-only / forward-compatible 迁移，兼容代码最多保留一个发布周期，破坏性清理放到后续 cleanup release

## GitHub Pages 公开站点

`docs-pages` workflow 会发布三个公开入口：

- `/`：英文文档首页
- `/zh/`：中文文档首页
- `/storybook/`：Storybook 静态站
- `/storybook.html`：英文 Storybook 跳转页
- `/zh/storybook.html`：中文 Storybook 跳转页
