# CF Mail 文档

CF Mail 是一个基于 Cloudflare Email Routing、Workers、D1、R2 的临时邮箱控制台。公开文档站负责产品说明、部署步骤、Token 权限、域名接入和排障说明；Storybook 负责组件与界面状态预览。

## 公开入口

- [快速开始](./quick-start)
- [部署与环境变量](./deployment-environment)
- [Cloudflare Token 权限](./cloudflare-token-permissions)
- [域名目录与启用流程](./domain-catalog-enablement)
- [API 参考](./api-reference)
- [FAQ / 故障排查](./faq)
- [组件预览 / Storybook](./storybook)
- [直接打开公开 Storybook](/storybook.html)

## 你应该先知道的事

1. 先在 Cloudflare 里把域加到你的账号下。
2. 再去控制台的 `/domains` 页面启用这个域。
3. 域启用成功后，`GET /api/meta` 和随机邮箱分配才会把它算进 active 域名池。
4. 如果域名目录里显示 `provisioning_error / Authentication error`，优先检查 Cloudflare token 是否具备 `Zone Settings: Edit`，以及 token 是否覆盖该 zone。

## Public Surfaces

- 文档首页：产品、部署、运维、API、排障
- Storybook：组件与关键页面的稳定预览面
- 控制台内 `/api-keys/docs`：站内速查页，只保留最常用的 API 示例和跳转入口

## English summary

CF Mail ships a public docs site plus Storybook. Add the zone in Cloudflare first, then enable it from `/domains` inside the control plane. If provisioning fails with `Authentication error`, check `Zone Settings: Edit` and zone scope coverage on the Cloudflare API token.
