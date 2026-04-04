# 域名目录与启用流程

CF Mail 现在不再要求管理员手填 zone id。正确流程是：

1. 在 Cloudflare 账号里新增或接入目标域
2. 打开控制台 `/domains`
3. 等待 `GET /api/domains/catalog` 实时发现该 zone
4. 点击“启用”
5. 系统写入本地 `domains` 记录，并尝试在该 zone 上启用 Email Routing

## 项目状态说明

- `not_enabled`：Cloudflare 可见，但项目里还没启用
- `active`：项目内已启用，可用于创建邮箱
- `disabled`：项目里已停用，不再参与新建邮箱
- `provisioning_error`：接入动作失败，查看错误列并重试
- `missing`：本地记录还在，但当前 token 已经看不到对应 zone

## 邮箱创建与随机域名

- `POST /api/mailboxes`：`rootDomain` 可选；省略时服务端会从 active 域中随机选一个
- `POST /api/mailboxes/ensure`：使用 `localPart + subdomain` 时 `rootDomain` 也可选；省略时同样随机分配
- `GET /api/meta`：只返回当前 active 域名列表，不返回 Cloudflare catalog 的全量可见域

## English summary

Cloudflare zone discovery is real time, but mailbox creation still consumes only locally enabled `active` domains. A zone can be visible in the catalog without being usable for mailbox creation until it is enabled successfully.
