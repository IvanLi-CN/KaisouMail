# 域名接入总览

KaisouMail 目前支持两种域名接入方式：

## 方案选择

### 方案 A：手动在 Cloudflare 里先绑定

适合这些场景：

- 你已经在 Cloudflare 里接入了这个域名
- 你希望先手动确认 zone、NS 委派和账号归属
- 你只想让项目负责“启用”和后续使用

继续阅读：

- [手动绑定并启用](/zh/domain-catalog-enablement)

### 方案 B：在项目里直接绑定

适合这些场景：

- 你希望直接在 `/domains` 里输入根域名并完成接入
- 你已经配好了更完整的 runtime 权限
- 你接受项目直接调用 Cloudflare `POST /zones`

继续阅读：

- [项目内直接绑定](/zh/project-domain-binding)

## 接入前统一检查

无论你选哪条路径，建议都先检查：

1. [部署与环境](/zh/deployment-environment) 是否已经完整配置
2. [Token 权限](/zh/cloudflare-token-permissions) 是否覆盖目标操作
3. `EMAIL_ROUTING_MANAGEMENT_ENABLED=true`
4. `EMAIL_WORKER_NAME` 已配置

如果你要用“项目内直接绑定”，还要额外确认：

- `CLOUDFLARE_ACCOUNT_ID` 已进入 API Worker 运行时
- `GET /api/meta` 返回 `cloudflareDomainBindingEnabled=true`

## 功能启用后会发生什么

域名进入 `active` 后：

- Web 控制台可以直接选中它创建邮箱
- `POST /api/mailboxes` 可直接指定 `rootDomain`
- 未指定 `rootDomain` 时，服务端会从所有 `active` 域名里随机选一个
- `GET /api/meta` 只返回当前 `active` 域名

## 常见入口

- 想先接入已有 zone：看 [手动绑定并启用](/zh/domain-catalog-enablement)
- 想直接新建 zone：看 [项目内直接绑定](/zh/project-domain-binding)
- 想先核对权限：看 [Token 权限](/zh/cloudflare-token-permissions)
- 想看完整环境变量：看 [部署与环境](/zh/deployment-environment)
