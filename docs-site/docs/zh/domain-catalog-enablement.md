# 域名目录与启用流程

项目不再要求你手填 `zoneId`。按下面顺序做：

1. 在 Cloudflare 账号里新增或接入目标域
2. 打开控制台 `/domains`
3. 等待 `GET /api/domains/catalog` 实时发现该 zone
4. 点击“启用”
5. 系统写入本地 `domains` 记录，并尝试在该 zone 上启用 Email Routing

## 状态含义

| 状态 | 含义 |
| --- | --- |
| `not_enabled` | Cloudflare 可见，但项目里还没启用 |
| `active` | 已启用，可用于创建邮箱 |
| `disabled` | 已停用，不再参与新建邮箱 |
| `provisioning_error` | 接入失败，查看错误列后重试 |
| `missing` | 本地记录还在，但当前 token 已看不到该 zone |

## 启用后会影响什么

- `POST /api/mailboxes`：`rootDomain` 可选；不传时从 `active` 域里随机选一个
- `POST /api/mailboxes/ensure`：`localPart + subdomain` 方式下 `rootDomain` 也可选；不传时同样随机选
- `GET /api/meta`：只返回当前 `active` 域名，不返回 Cloudflare 可见但未启用的域

## 额外说明

- 在目录里能看到某个域，不代表已经能创建邮箱。
- 只有 `active` 域会进邮箱创建池。
- `disabled` 不会删除历史 routing rule，所以旧邮箱仍可能继续收信。
