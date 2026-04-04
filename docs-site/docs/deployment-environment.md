# 部署与环境变量

## 运行时绑定

### Required bindings

- `DB`
- `MAIL_BUCKET`

### Required secrets

- `SESSION_SECRET`
- `BOOTSTRAP_ADMIN_API_KEY`

### Runtime vars

- `APP_ENV`
- `EMAIL_WORKER_NAME`
- `DEFAULT_MAILBOX_TTL_MINUTES`
- `CLEANUP_BATCH_SIZE`
- `EMAIL_ROUTING_MANAGEMENT_ENABLED`
- `BOOTSTRAP_ADMIN_EMAIL`
- `BOOTSTRAP_ADMIN_NAME`
- `CF_ROUTE_RULESET_TAG`
- `WEB_APP_ORIGIN`

### Legacy bootstrap vars

- `MAIL_DOMAIN`
- `CLOUDFLARE_ZONE_ID`

## Web 环境变量

- `VITE_API_BASE_URL`
- `VITE_DEMO_MODE`
- `VITE_DOCS_SITE_ORIGIN`

`VITE_DOCS_SITE_ORIGIN` 用于控制台内部从 `/api-keys/docs` 跳到公开文档站和公开 Storybook。未配置时，控制台仍保留站内速查页，但不会显示公开站入口。

## GitHub Pages

公开文档通过单独的 `docs-pages` workflow 发布：

- `/`：Rspress 文档首页
- `/storybook/`：Storybook 静态站
- `/storybook.html`：Storybook 入口跳转页

## English summary

Runtime variables stay on the Worker side. `VITE_DOCS_SITE_ORIGIN` is only for the control-plane UI so operators can jump from the in-app quick reference to the public docs and Storybook.
