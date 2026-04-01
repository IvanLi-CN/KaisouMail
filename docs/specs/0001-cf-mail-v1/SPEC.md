# CF Mail V1 Spec

## Objective

Deliver a Cloudflare-based temporary mailbox control plane with a compact, tool-oriented web console for login, mailbox lifecycle management, message inspection, API key management, and multi-user administration.

## Product Surfaces

### Auth
- `/login`
- API key based sign-in that exchanges credentials for a browser session

### Mailboxes
- `/mailboxes`
- `/mailboxes/:mailboxId`
- Create temporary mailboxes, inspect lifecycle state, and destroy active addresses

### Messages
- `/messages/:messageId`
- Inspect parsed message content, HTML preview, plain text, headers, recipients, attachments, and raw EML download

### Security
- `/api-keys`
- Create and revoke API keys for automation and browser sign-in

### Users
- `/users`
- Admin-only user management with initial key issuance

## UI Direction

- Dark, minimal, utility-first control plane
- Dense information layout optimized for repeated operational tasks
- Sidebar navigation with persistent page context
- Table-first data presentation with compact actions
- Cool gray embedded HTML mail preview surface to reduce glare while preserving message fidelity

## Visual Evidence

Evidence is persisted with this spec and refreshed whenever the rendered control-plane surfaces change.

### Login

![Login page](./assets/login.png)

### Mailboxes

![Mailboxes page](./assets/mailboxes.png)

### Mailbox Create Card

![Mailbox create card](./assets/mailbox-create-card.png)

### Mailbox Detail

![Mailbox detail page](./assets/mailbox-detail.png)

### Message Detail

![Message detail page](./assets/message-detail.png)

### API Keys

![API keys page](./assets/api-keys.png)

### Users

![Users page](./assets/users.png)
