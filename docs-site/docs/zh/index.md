# KaisouMail 文档

## 阅读顺序

1. 先按 [Cloudflare Token 权限](/zh/cloudflare-token-permissions) 配好 runtime / deploy token。
2. 再按 [部署与环境变量](/zh/deployment-environment) 配好 Worker、Pages 和运行时变量。
3. 先看 [域名接入总览](/zh/domain-onboarding)，确认应该走哪条接入路径。
4. 如果你要**先在 Cloudflare 手动接入域名**，看 [手动在 Cloudflare 上绑定并在项目中启用域名](/zh/domain-catalog-enablement)。
5. 如果你要**直接在 `/domains` 里绑定新域名**，看 [在项目中直接绑定新域名](/zh/project-domain-binding)。
6. 需要接口示例时，先看 [API 参考](/zh/api-reference)，再去控制台内 `/api-keys/docs` 看当前实例的速查页。

## 文档目录

- [快速开始](/zh/quick-start)
- [部署与环境变量](/zh/deployment-environment)
- [Cloudflare Token 权限](/zh/cloudflare-token-permissions)
- [域名接入总览](/zh/domain-onboarding)
- [手动在 Cloudflare 上绑定并在项目中启用域名](/zh/domain-catalog-enablement)
- [在项目中直接绑定新域名](/zh/project-domain-binding)
- [API 参考](/zh/api-reference)
- [FAQ / 故障排查](/zh/faq)
- [直接打开公开 Storybook](/zh/storybook.html)

## 关键说明

- `cloudflareDomainLifecycleEnabled=true` 表示项目已经能管理 Cloudflare 里现有的 zone。
- `cloudflareDomainBindingEnabled=true` 才表示项目已经能直接创建新的 Cloudflare zone。
- 新域只有在 `/domains` 启用成功并进入 `active` 后，才会进入 `GET /api/meta` 的域名列表，并参与随机邮箱分配。
