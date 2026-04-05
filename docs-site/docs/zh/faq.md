# FAQ / 故障排查

## 为什么域名页显示 `Authentication error`？

建议按下面顺序排查：

1. token 是否有 `Zone: Zone Settings: Edit`
2. token scope 是否覆盖目标 zone
3. Worker 当前读到的是不是你刚更新的那把 token

如果目录里该域显示为 `Cloudflare available`，但项目状态变成 `provisioning_error`，优先就查这三项。

## 为什么我能看到 zone，但还是不能启用？

因为“能列出 zone”和“能修改这个 zone”不是一回事。`GET /api/domains/catalog` 只证明 token 看得到这个 zone，不代表它有足够写权限。

## 为什么 `GET /api/meta` 看不到新域？

`/api/meta` 只返回当前项目内 `active` 的域名。新域必须先在 `/domains` 页面启用成功，才会被这个接口暴露给邮箱创建表单和自动化客户端。

## 为什么停用后旧邮箱还收得到信？

这是设计如此。`disable` 只阻止该域参与新建邮箱，不会主动删除历史 routing rule。

## 为什么文档站和控制台分开？

公开文档和 Storybook 放在 GitHub Pages，目的是让部署说明、排障说明和 UI 预览可以在不登录控制台的前提下直接访问。控制台内的 `/api-keys/docs` 只保留当前实例相关的速查内容。
