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
| `BOOTSTRAP_ADMIN_API_KEY` | 首次引导管理员 API Key |

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
| `WEB_APP_ORIGIN` | 控制台来源；生产环境必须填对 |

## 单域历史实例升级时才会用到

| 名称 | 用途 |
| --- | --- |
| `MAIL_DOMAIN` | 历史单域实例回填 |
| `CLOUDFLARE_ZONE_ID` | 历史单域实例回填 |

如果是新实例，不要再把这两个变量当长期配置源。

## Web 环境变量

| 名称 | 用途 |
| --- | --- |
| `VITE_API_BASE_URL` | 控制台请求 API 的基地址 |
| `VITE_DEMO_MODE` | 本地演示模式 |
| `VITE_DOCS_SITE_ORIGIN` | 控制台里跳到公开文档站和公开 Storybook 的地址 |

如果 `VITE_DOCS_SITE_ORIGIN` 不填，控制台仍能用站内速查页，但不会显示公开站入口。

## GitHub Pages 公开站点

`docs-pages` workflow 会发布三个公开入口：

- `/`：英文文档首页
- `/zh/`：中文文档首页
- `/storybook/`：Storybook 静态站
- `/storybook.html`：英文 Storybook 跳转页
- `/zh/storybook.html`：中文 Storybook 跳转页
