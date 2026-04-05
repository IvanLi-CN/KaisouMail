# API Reference

This page lists the implemented endpoints and their purpose. For request and response examples tied to the current runtime, open `/api-keys/docs` inside the control plane.

## Metadata & Domains

| Endpoint | Purpose |
| --- | --- |
| `GET /api/meta` | read active domains, TTL, and address rules |
| `GET /api/domains/catalog` | read Cloudflare-visible zones plus project status |
| `GET /api/domains` | read project-managed domain records |
| `POST /api/domains` | enable a catalog domain |
| `POST /api/domains/:id/retry` | retry a failed enablement |
| `POST /api/domains/:id/disable` | disable a managed domain |

## Auth & API Keys

| Endpoint | Purpose |
| --- | --- |
| `GET /api/auth/session` | read the current session |
| `POST /api/auth/session` | exchange an API key for a browser session |
| `DELETE /api/auth/session` | sign out |
| `GET /api/api-keys` | list API keys |
| `POST /api/api-keys` | create an API key |
| `POST /api/api-keys/:id/revoke` | revoke an API key |

## Mailboxes

| Endpoint | Purpose |
| --- | --- |
| `GET /api/mailboxes` | list mailboxes |
| `POST /api/mailboxes` | create a mailbox |
| `POST /api/mailboxes/ensure` | idempotently ensure a mailbox exists |
| `GET /api/mailboxes/resolve` | resolve a mailbox by address |
| `GET /api/mailboxes/:id` | read a mailbox |
| `DELETE /api/mailboxes/:id` | delete a mailbox |

## Messages

| Endpoint | Purpose |
| --- | --- |
| `GET /api/messages` | list messages |
| `GET /api/messages/:id` | read structured message detail |
| `GET /api/messages/:id/raw` | download the raw `.eml` |

## Users

| Endpoint | Purpose |
| --- | --- |
| `GET /api/users` | list users |
| `POST /api/users` | create a user |
