# Cloudflare Token 权限

这一页专门说明 **Cloudflare API token** 应该具备哪些权限，以及为什么缺这些权限时你会在域名页看到 `Authentication error`。

## 运行时域名管理权限

如果你要在控制台的 `/domains` 页面里实时发现 Cloudflare zones，并启用/停用邮箱根域名，token 至少需要这些 **zone 级写权限**：

- `Zone: Email Routing Rules: Edit`
- `Zone: DNS: Edit`
- `Zone: Workers Routes: Edit`
- `Zone: Zone Settings: Edit`

其中最容易漏的是 `Zone: Zone Settings: Edit`。`POST /zones/{zone_id}/email/routing/enable` 依赖它；如果缺这个权限，控制台通常会把 Cloudflare 的失败消息记录成 `provisioning_error / Authentication error`。

## Scope 要覆盖哪些 zones

权限名写对还不够，token 的资源范围也必须覆盖你准备接入到 CF Mail 的所有 zones。

- 能在 `/api/domains/catalog` 里看到 zone，说明 token 至少能读取到它
- 但如果 token 只覆盖可见/可读，没覆盖写权限，启用时仍然会失败
- 典型现象就是：域名目录显示 `available`，但项目状态变成 `provisioning_error`

## 部署流水线权限

仓库当前的 `deploy-main.yml` 还会用同一个 `CLOUDFLARE_API_TOKEN` 去做部署。如果你不拆 token，那么同一把 token 还要满足部署所需权限：

- `Account: D1: Edit`
- `Account: Workers Scripts: Edit`
- `Account: Cloudflare Pages: Edit`
- `Zone: Workers Routes: Edit`

如果后续把“部署 token”和“运行时域名管理 token”拆开，这里的并集要求就可以降低。但在当前工程里，它们默认还是同一把 token。

## 最小排障顺序

1. 确认 token 资源范围覆盖目标 zone
2. 确认 token 具备 `Zone Settings: Edit`
3. 确认 `EMAIL_ROUTING_MANAGEMENT_ENABLED=true`
4. 确认 `EMAIL_WORKER_NAME` 已配置
5. 回到控制台域名页执行“重试接入”

## English summary

For runtime mailbox-domain management, the token must cover the target zone and include `Zone: Email Routing Rules: Edit`, `Zone: DNS: Edit`, `Zone: Workers Routes: Edit`, and `Zone: Zone Settings: Edit`. Missing `Zone Settings: Edit` is the most common reason behind `provisioning_error / Authentication error`.
