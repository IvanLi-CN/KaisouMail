# OAuth 配置说明

KaisouMail 的 GitHub 和 LinuxDO 登录 / 注册都使用控制台同源 `/api` 回调。生产环境优先把 OAuth callback 填成控制台域名，而不是直连 API 域名。

## 推荐回调地址

在控制台 `/users?section=registration` 展开 GitHub 或 LinuxDO 后，可以直接复制当前实例的回调地址：

| Provider | Callback URL |
| --- | --- |
| GitHub | `https://<控制台域名>/api/auth/github/callback` |
| LinuxDO | `https://<控制台域名>/api/auth/linuxdo/callback` |

如果同一个实例有多个控制台别名，每个别名都会产生自己的同源 callback。只允许用户从一个控制台域名登录时，只登记那一个域名即可；多个控制台域名都要承载登录时，在对应 OAuth 应用中加入全部 callback。

## GitHub OAuth App

在 GitHub OAuth App 中填写：

- **Homepage URL**：控制台主页，例如 `https://km.example.com`
- **Authorization callback URL**：`https://km.example.com/api/auth/github/callback`

然后把 GitHub 返回的 client id / secret 填到控制台：

- `/users?section=registration` -> GitHub -> 客户端 ID
- `/users?section=registration` -> GitHub -> 客户端密钥
- 授权范围默认使用 `read:user`；需要读取公开邮箱时可按实例策略扩展

也可以继续用 Worker 运行变量作为兜底配置：

- `GITHUB_CLIENT_ID`
- `GITHUB_CLIENT_SECRET`
- `GITHUB_OAUTH_SCOPES`

控制台保存的配置优先于运行变量；已保存的 secret 不会回显。

## LinuxDO OAuth Client

在 LinuxDO OAuth Client 中填写：

- **应用主页 / Redirect base**：控制台主页，例如 `https://km.example.com`
- **Callback / Redirect URI**：`https://km.example.com/api/auth/linuxdo/callback`

然后把 LinuxDO 返回的 client id / secret 填到控制台：

- `/users?section=registration` -> LinuxDO -> 客户端 ID
- `/users?section=registration` -> LinuxDO -> 客户端密钥

系统默认使用 LinuxDO OAuth 服务地址 `https://connect.linux.do`。这个地址不需要在控制台编辑；只有部署者在接入兼容环境或 LinuxDO 官方变更 OAuth issuer 时，才需要通过 Worker 运行变量覆盖。

也可以继续用 Worker 运行变量作为兜底配置：

- `LINUXDO_CLIENT_ID`
- `LINUXDO_CLIENT_SECRET`
- `LINUXDO_OAUTH_BASE_URL`

## 为什么使用控制台同源地址

KaisouMail 的 Pages 控制台会把 `/api/*` 通过同源代理转发到 API Worker。OAuth state、session cookie、注册完成跳转都按用户进入控制台的同一个 origin 处理，因此推荐 callback 固定在控制台域名下：

- 避免浏览器在控制台域名和直连 API 域名之间切换
- 减少 cookie / CORS / preview 域名误用问题
- 与 `/api/auth/{provider}/start` 实际生成的 `redirect_uri` 保持一致

直连 API 域名仍可保留给自动化或兼容调用，但不要把它作为一方浏览器 OAuth 的默认 callback。
