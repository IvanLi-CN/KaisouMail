# KaisouMail 文档

## 阅读顺序

1. 按 [Cloudflare Token 权限](/zh/cloudflare-token-permissions) 配好 token。
2. 按 [部署与环境变量](/zh/deployment-environment) 配好 Worker、Pages 和 Web 环境变量。
3. 在 Cloudflare 里先加域，再按 [域名目录与启用流程](/zh/domain-catalog-enablement) 到控制台 `/domains` 启用。
4. 需要接口示例时，先看 [API 参考](/zh/api-reference)，再去控制台内 `/api-keys/docs` 看当前实例的速查页。

## 文档目录

- [快速开始](/zh/quick-start)
- [部署与环境变量](/zh/deployment-environment)
- [Cloudflare Token 权限](/zh/cloudflare-token-permissions)
- [域名目录与启用流程](/zh/domain-catalog-enablement)
- [API 参考](/zh/api-reference)
- [FAQ / 故障排查](/zh/faq)
- [直接打开公开 Storybook](/zh/storybook.html)

## 关键说明

- `/domains` 页面里显示 `provisioning_error / Authentication error` 时，先查 token 是否有 `Zone: Zone Settings: Edit`，再查 token scope 是否覆盖目标 zone。
- 新域只有在 `/domains` 启用成功后，才会进入 `GET /api/meta` 的 `active` 域名列表，并参与随机邮箱分配。
