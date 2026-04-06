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
| `VITE_API_BASE_URL` | 控制台请求 API 的 canonical / fallback 基地址 |
| `VITE_DEMO_MODE` | 本地演示模式 |
| `VITE_DOCS_SITE_ORIGIN` | 控制台里跳到公开文档站和公开 Storybook 的地址 |

如果 `VITE_DOCS_SITE_ORIGIN` 不填，控制台仍能用站内速查页，但不会显示公开站入口。
如果当前控制台域名命中已知生产别名（例如 `cfm.707979.xyz` 或 `km.707979.xyz`），前端会优先改用同族 API 别名；其余环境继续回退到 `VITE_API_BASE_URL`。

## 生产别名示例

- 控制台：`https://cfm.707979.xyz`、`https://km.707979.xyz`
- API：`https://api.cfm.707979.xyz`、`https://api.km.707979.xyz`

## 发布工作流安全门禁

- 生产发布 workflow 会先捕获当前 100% 稳定的 API Worker 版本，再发布新的 API 版本
- 如果目标 release 包含 D1 migration diff，或远端 D1 仍有 pending migration，workflow 会直接 fail closed，因为 rollback-backed 自动发布只支持远端 migration 状态干净的 schema-stable release
- 对于远端没有 pending migration 的 schema-stable release，workflow 会先跑 rollback-backed 的 `/health` + `/api/version` smoke 检查，再决定是否继续 Pages 发布
- 因为 workflow 没有回滚目标时也会 fail closed，所以第一次生产 API 发布需要手动 bootstrap

## GitHub Pages 公开站点

`docs-pages` workflow 会发布三个公开入口：

- `/`：英文文档首页
- `/zh/`：中文文档首页
- `/storybook/`：Storybook 静态站
- `/storybook.html`：英文 Storybook 跳转页
- `/zh/storybook.html`：中文 Storybook 跳转页
