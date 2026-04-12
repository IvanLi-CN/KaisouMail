# 手动在 Cloudflare 上绑定并在项目中启用域名

这份文档适用于：**域名已经在 Cloudflare 里，或者你希望先手动在 Cloudflare 完成 zone 接入，再让 KaisouMail 接管启用和后续使用。**

和“在项目里直接绑定新域名”相比，这条链路不会由项目替你创建 zone，而是要求你先在 Cloudflare 里把根域名接入好，再回到 `/domains` 启用。

## 启用本功能前的准备 {#feature-enablement}

### 1. 打开运行时域名管理能力

API Worker 运行时必须启用：

- `EMAIL_ROUTING_MANAGEMENT_ENABLED=true`
- `CLOUDFLARE_RUNTIME_API_TOKEN`（或共享的 `CLOUDFLARE_API_TOKEN`）
- `EMAIL_WORKER_NAME`

如果这些运行时变量不完整，项目虽然可能还能启动，但 `/domains` 不会具备完整的 Cloudflare 域名管理能力。

这套运行时变量同时覆盖域名级 Catch All 开关；开启 Catch All 不需要再新增
额外 secret。

### 2. 配好 Cloudflare token

建议直接按 [Cloudflare Token 权限](/zh/cloudflare-token-permissions) 的 runtime token 最小权限配置。

对“手动在 Cloudflare 里先接入 zone，再回到项目启用”这条路径，至少要保证运行时 token 能：

- 列出目标 zone
- 读取目标 zone
- 启用 Email Routing
- 后续为邮箱写入 routing rules

如果你未来还要在项目里直接绑定新域名或删除项目直绑域名，就继续保留同一份完整 runtime 权限集合，不要再拆出第二套权限。

### 3. 部署后确认功能开关

部署完成后，先确认：

1. `GET /api/meta` 里的 `cloudflareDomainLifecycleEnabled=true`
2. `/domains` 页面能看到 Cloudflare 域名目录

这一步只验证“项目能管理现有 zone”；它**不要求** `cloudflareDomainBindingEnabled=true`，因为这个布尔值只影响“项目内直接创建新 zone”的入口。

## 第一步：手动在 Cloudflare 上绑定域名 {#bind-domain-in-cloudflare}

1. 登录 Cloudflare Dashboard，进入目标账号。
2. 选择 **Add a domain / Add site**。
3. 输入根域名，例如 `example.com`。
4. 让 Cloudflare 以 **full zone** 方式接管该域名。
5. 按 Cloudflare 分配的 nameservers 去你的域名注册商处完成委派。
6. 等待该 zone 在 Cloudflare 中变成 `active`。

如果你跳过 nameserver 委派，KaisouMail 之后虽然可能能看到这个 zone，但启用 Email Routing 时通常会停在 `provisioning_error`。

## 第二步：在 KaisouMail 项目中启用这个域名 {#enable-zone-in-project}

1. 打开控制台 `/domains`。
2. 等待 `GET /api/domains/catalog` 发现你刚刚接入的 zone。
3. 在域名目录中找到对应根域名。
4. 点击 **启用域名**。
5. 系统会写入本地 `domains` 记录，并尝试在该 zone 上启用 Email Routing。
6. 成功后，这个域名会进入 `active` 状态。

如果 zone 仍在 Cloudflare 侧 `pending`，项目会保留本地记录，但状态通常会变成 `provisioning_error`。等 zone 激活后，再回到 `/domains` 点击“重试接入”即可。

## 第三步：启用后如何使用 {#use-enabled-domain}

域名变成 `active` 后，KaisouMail 会这样使用它：

- `POST /api/mailboxes`：如果不指定 `rootDomain`，服务端会从 `active` 域里随机选一个
- `POST /api/mailboxes/ensure`：分段创建时同样可以省略 `rootDomain`
- `GET /api/meta`：只会返回当前 `active` 域名，不会返回还没启用的 Cloudflare catalog 项

你也可以在 Web 控制台的新建邮箱表单里直接选中这个域名；只要它仍是 `active`，后续新邮箱就可以继续落到这个根域名下。

如果管理员又在 `/domains` 里打开了 Catch All，那么这个域上的未预注册地址也会开始收信，并在项目里显示为 `Catch All` 长期邮箱。

## 问题排查 {#troubleshooting}

### Cloudflare 里已经有 zone，但 `/domains` 看不到 {#catalog-zone-not-visible}

优先检查：

1. 运行时 token 的 scope 是否覆盖这个 zone
2. `EMAIL_ROUTING_MANAGEMENT_ENABLED` 是否为 `true`
3. `GET /api/meta` 是否已经返回 `cloudflareDomainLifecycleEnabled=true`

如果 catalog 仍然为空，先回到 [Cloudflare Token 权限](/zh/cloudflare-token-permissions) 和 [部署与环境变量](/zh/deployment-environment) 重新核对运行时配置。

### `/domains` 里能看到 zone，但点击启用失败 {#enable-existing-zone-failed}

最常见的原因是：token 只有读取能力，没有启用 Email Routing 的写权限。

优先检查：

- `Zone: Zone: Read`
- `Zone: Email Routing Rules: Edit`
- `Zone: Zone Settings: Edit`
- token scope 是否覆盖目标 zone

如果错误是 `Authentication error` 或 `forbidden`，通常就是这里缺权限。

### 启用后停在 `provisioning_error` {#provisioning-error-after-enable}

这通常不是项目没写入，而是 Cloudflare 侧 zone 还不能完成接入：

1. 去 Cloudflare 看 zone 是否仍为 `pending`
2. 检查注册商 nameserver 是否已切到 Cloudflare 提供的值
3. 等待 zone 变成 `active`
4. 回到 `/domains` 点“重试接入”

### 提示“这个域名已经在项目里” {#zone-already-exists-in-project}

这表示项目已经有这个根域名的本地记录：

- 可能已经是 `active`
- 也可能是之前失败后留下的 `provisioning_error`
- 也可能是历史停用记录被复用了

先在域名目录里查这条记录，再决定是继续启用、重试接入，还是处理旧记录，而不是再次新建一遍。

## 相关阅读

- [在项目中直接绑定新域名](/zh/project-domain-binding)
- [Cloudflare Token 权限](/zh/cloudflare-token-permissions)
- [部署与环境变量](/zh/deployment-environment)
