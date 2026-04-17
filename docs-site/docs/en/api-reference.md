# API Reference

This page lists the implemented endpoints and their purpose. For request and response examples tied to the current runtime, open `/api-keys/docs` inside the control plane.

## Metadata & Domains

| Endpoint | Purpose |
| --- | --- |
| `GET /api/meta` | read active domains, TTL, address rules, and passkey capability |
| `GET /api/domains/catalog` | read Cloudflare-visible zones plus project status |
| `GET /api/domains` | read project-managed domain records |
| `POST /api/domains/bind` | create an apex Cloudflare full zone and attach it to the project; subdomains return apex/subdomain guidance instead |
| `POST /api/domains` | enable a catalog domain |
| `POST /api/domains/:id/catch-all/enable` | enable the project-managed catch-all flow and point Cloudflare catch-all at the mail Worker |
| `POST /api/domains/:id/catch-all/disable` | disable the project-managed catch-all flow and restore the previous Cloudflare catch-all configuration |
| `POST /api/domains/:id/retry` | retry a failed enablement |
| `POST /api/domains/:id/disable` | disable a managed domain |
| `POST /api/domains/:id/delete` | delete a project-bound Cloudflare zone and soft-delete the local record |

## Auth & API Keys

| Endpoint | Purpose |
| --- | --- |
| `POST /api/auth/passkey/options` | create a browser passkey login challenge |
| `POST /api/auth/passkey/verify` | verify a passkey login and issue a session |
| `GET /api/auth/session` | read the current session |
| `POST /api/auth/session` | exchange an API key for a browser session |
| `DELETE /api/auth/session` | sign out |
| `GET /api/passkeys` | list passkeys for the current user |
| `POST /api/passkeys/registration/options` | create a passkey registration challenge |
| `POST /api/passkeys/registration/verify` | save a verified passkey credential |
| `DELETE /api/passkeys/:id` | revoke a passkey |
| `GET /api/api-keys` | list API keys |
| `POST /api/api-keys` | create an API key |
| `POST /api/api-keys/:id/revoke` | revoke an API key |

## Mailboxes

Mailbox records follow `mailboxSchema`; the two catch-all-related fields are:

- `source`: `registered | catch_all`
- `routingRuleId`: typically present for registered mailboxes, always `null`
  for auto-materialized catch-all mailboxes

| Endpoint | Purpose |
| --- | --- |
| `GET /api/mailboxes` | list mailboxes |
| `POST /api/mailboxes` | create a mailbox |
| `POST /api/mailboxes/ensure` | idempotently ensure a mailbox exists |
| `GET /api/mailboxes/resolve` | resolve a mailbox by address |
| `GET /api/mailboxes/:id` | read a mailbox |
| `DELETE /api/mailboxes/:id` | delete a mailbox |

## Messages

When a domain has Catch All enabled, inbound mail to an unknown address first
materializes a long-lived `source=catch_all` mailbox and then continues through
the normal message persistence path.

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
