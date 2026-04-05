# API 参考

公开文档页只给接口目录和用途。要看当前实例的请求体示例、TTL 示例和域名示例，去控制台内 `/api-keys/docs`。

## Metadata 与 Domains

| 接口 | 用途 |
| --- | --- |
| `GET /api/meta` | 读取 active 域名、TTL 和地址规则 |
| `GET /api/domains/catalog` | 读取 Cloudflare 可见 zone + 项目状态 |
| `GET /api/domains` | 读取项目内已有域记录 |
| `POST /api/domains` | 启用一个 catalog 域 |
| `POST /api/domains/:id/retry` | 重试接入失败的域 |
| `POST /api/domains/:id/disable` | 停用一个项目域 |

## Auth 与 API Keys

| 接口 | 用途 |
| --- | --- |
| `GET /api/auth/session` | 读取当前登录会话 |
| `POST /api/auth/session` | 用 API Key 换会话 |
| `DELETE /api/auth/session` | 退出登录 |
| `GET /api/api-keys` | 列出 API Keys |
| `POST /api/api-keys` | 创建 API Key |
| `POST /api/api-keys/:id/revoke` | 撤销 API Key |

## Mailboxes

| 接口 | 用途 |
| --- | --- |
| `GET /api/mailboxes` | 列出邮箱 |
| `POST /api/mailboxes` | 创建邮箱 |
| `POST /api/mailboxes/ensure` | 幂等确保邮箱存在 |
| `GET /api/mailboxes/resolve` | 按地址解析邮箱 |
| `GET /api/mailboxes/:id` | 读取单个邮箱 |
| `DELETE /api/mailboxes/:id` | 删除邮箱 |

## Messages

| 接口 | 用途 |
| --- | --- |
| `GET /api/messages` | 列出消息 |
| `GET /api/messages/:id` | 读取结构化消息详情 |
| `GET /api/messages/:id/raw` | 下载原始 `.eml` |

## Users

| 接口 | 用途 |
| --- | --- |
| `GET /api/users` | 列出用户 |
| `POST /api/users` | 创建用户 |
