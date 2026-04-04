# FAQ / 故障排查

## 为什么域名页显示 `Authentication error`？

最常见原因有两个：

1. token 缺少 `Zone: Zone Settings: Edit`
2. token 的资源范围没有覆盖目标 zone

如果域名目录里该域显示为 `Cloudflare available`，但项目状态变成 `provisioning_error`，优先就查这两项。

## 为什么我能看到 zone，但还是不能启用？

因为“能列出 zone”和“能修改该 zone 的 Email Routing / DNS / route”不是一回事。读取 catalog 只证明 token 看得到这个 zone，不代表它有足够写权限。

## 为什么 `GET /api/meta` 看不到新域？

`/api/meta` 只返回当前项目内 `active` 的域名。新域必须先在 `/domains` 页面启用成功，才会被这个接口暴露给邮箱创建表单和自动化客户端。

## 为什么停用后旧邮箱还收得到信？

这是设计如此。`disable` 只阻止该域参与新建邮箱，不会主动删除历史 routing rule。

## Why is the docs site separated from the control plane?

The public docs and Storybook live on GitHub Pages so operators and contributors can read deployment guidance without signing into the control plane. The in-app `/api-keys/docs` page stays as a short runtime-aware quick reference.
