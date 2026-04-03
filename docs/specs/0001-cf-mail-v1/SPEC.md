# CF Mail V1 Spec

## Objective

Deliver a Cloudflare-based temporary mailbox control plane with a compact, tool-oriented web console for login, mailbox lifecycle management, message inspection, API key management, and multi-user administration.

## Product Surfaces

### Auth
- `/login`
- API key based sign-in that exchanges credentials for a browser session

### Workspace
- `/workspace`
- Three-pane mail workbench for mailbox filtering, aggregated message browsing, and inline message reading
- URL search params persist mailbox scope, message selection, sort mode, and mailbox search query

### Mailboxes
- `/mailboxes`
- `/mailboxes/:mailboxId`
- Lightweight mailbox inventory and lifecycle management surface
- Message browsing is no longer embedded here; mailbox rows and compatibility routes hand off to the workspace
- API mailbox creation requires an explicit `rootDomain`; the Web console randomly preselects one active domain while still allowing manual switching

### Domains
- `/domains`
- Admin-only mailbox domain registry and Cloudflare provisioning status surface
- Add root domains with zone ids, retry failed provisioning, and disable domains for future mailbox creation

### Messages
- `/messages/:messageId`
- Inspect parsed message content, HTML preview, plain text, headers, recipients, attachments, and raw EML download
- Legacy-compatible detail route that can reopen the same message inside the workspace

### Security
- `/api-keys`
- `/api-keys/docs`
- Create and revoke API keys for automation and browser sign-in
- Protected integration reference for human operators and Agents, covering runtime metadata, session exchange, API key lifecycle, mailbox lookup/create endpoints, and message polling endpoints

## API Behavior

- `GET /api/meta` is the runtime truth source for active mailbox domains, TTL defaults, TTL bounds, and address validation hints used by Web and automation clients
- `GET|POST /api/domains` plus `POST /api/domains/:id/retry|disable` provide admin-only mailbox domain management for multiple Cloudflare zones in one shared instance
- `POST /api/mailboxes` accepts optional `rootDomain`; when omitted, the API randomly selects one active mailbox domain server-side
- `POST /api/mailboxes/ensure` accepts either `address` or `localPart + subdomain (+ optional rootDomain)`, reuses an existing visible `active` mailbox when present, and otherwise creates a fresh mailbox
- `GET /api/mailboxes/resolve?address=...` resolves a visible `active` mailbox directly from its address without forcing clients to list-and-filter locally
- Destroyed mailboxes no longer reserve their address; the same address can be created again after destroy completes
- Disabled mailbox domains are excluded from new mailbox creation but do not revoke previously created mailbox routing rules
- `GET /api/messages` accepts repeated `mailbox` params plus `after` / `since` ISO datetime filters; when both cursor aliases are present, the later timestamp is used as the strict lower bound
- All JSON error responses use the same `{ error, details }` envelope

### Users
- `/users`
- Admin-only user management with initial key issuance

## UI Direction

- Dark, minimal, utility-first control plane
- Dense information layout optimized for repeated operational tasks
- Sticky top navigation with clear active state, account context, logout, and skip-to-content affordance
- Desktop-first three-pane workbench for mailbox list, message list, and inline message content
- Workspace mailbox rail supports all-mailbox aggregation, mailbox search, and sorting by recent receive time or create time
- Mailbox management surface is intentionally list-first and minimal; email reading flows jump back into the workspace
- Buttons, badges, and similar compact UI labels must stay on a single line
- Reusable advanced action button primitive: icon + text by default, but secondary actions collapse to icon-only in dense layouts
- Icon-only actions use a mature third-party tooltip with long-press / hover reveal and collision-aware floating placement
- Mailbox presentation removes textual lifecycle badges; the workspace rail uses right-aligned numeric badges while mailbox tables show unread / total counts
- Mailbox rail rows stay single-line and navigation-focused; verbose lifecycle metadata is removed from the dense workspace list
- Destroyed mailboxes collapse to a muted single-line row in dense lists to avoid wasting vertical space
- Table-first detail and management pages remain available as compatibility surfaces
- Cool gray embedded HTML mail preview surface to reduce glare while preserving message fidelity

## Visual Evidence

Evidence is persisted with this spec and refreshed whenever the rendered control-plane surfaces change.

### App Shell

![Top navigation shell](./assets/app-shell-top-nav.png)

### Workspace

![Workspace all mailboxes](./assets/workspace-all-mailboxes.png)

![Workspace single mailbox](./assets/workspace-single-mailbox.png)

![Workspace selected message](./assets/workspace-selected-message.png)

### UI Primitives

![Action button intent showcase](./assets/action-button-intent-showcase.png)

### Mailboxes

![Mailboxes page](./assets/mailboxes.png)

### Domains

![Domains page overview](./assets/domains-page-overview.png)

### Mailbox Creation

![Mailbox create card with a randomly preselected root domain](./assets/mailbox-create-unselected-domain.png)

![Mailbox create card with explicit root domain selected](./assets/mailbox-create-selected-domain.png)

### Mailbox Detail

![Mailbox detail page](./assets/mailbox-detail.png)

### API Key Management

![API keys page with integration docs entry](./assets/api-keys-page-docs-entry.png)

### Integration Reference

![API integration reference page](./assets/api-keys-docs-page.png)

![API integration mailbox and polling reference](./assets/api-keys-docs-mailboxes.png)
