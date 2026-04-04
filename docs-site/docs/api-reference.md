# API 参考

## Metadata & Domains

- `GET /api/meta`
- `GET /api/domains/catalog`
- `GET /api/domains`
- `POST /api/domains`
- `POST /api/domains/:id/retry`
- `POST /api/domains/:id/disable`

## Auth & API Keys

- `GET /api/auth/session`
- `POST /api/auth/session`
- `DELETE /api/auth/session`
- `GET /api/api-keys`
- `POST /api/api-keys`
- `POST /api/api-keys/:id/revoke`

## Mailboxes

- `GET /api/mailboxes`
- `POST /api/mailboxes`
- `POST /api/mailboxes/ensure`
- `GET /api/mailboxes/resolve`
- `GET /api/mailboxes/:id`
- `DELETE /api/mailboxes/:id`

## Messages

- `GET /api/messages`
- `GET /api/messages/:id`
- `GET /api/messages/:id/raw`

## Users

- `GET /api/users`
- `POST /api/users`

更详细的请求体、响应体和字段语义，请结合控制台内的 `/api-keys/docs` 速查页一起看；它会根据当前运行时的 `/api/meta` 把域名和 TTL 示例渲染出来。

## English summary

Use the public docs for topology and operations, then use `/api-keys/docs` inside the control plane for schema-shaped request and response examples tied to the current runtime metadata.
