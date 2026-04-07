# KaisouMail V1 Spec

Status: 已完成
Last: 2026-04-07

## Objective

Deliver a Cloudflare-based temporary mailbox control plane with a compact, tool-oriented web console for login, mailbox lifecycle management, message inspection, API key management, and multi-user administration.

## Product Surfaces

### Auth
- `/login`
- API key based sign-in that exchanges credentials for a browser session

### Workspace
- `/workspace`
- Three-pane mail workbench for mailbox filtering, aggregated message browsing, and inline message reading
- Desktop `xl+` workspace layout is clamped to the remaining AppShell viewport height; each pane keeps its own vertical scroll area instead of letting long lists stretch the whole page
- Mailbox and message rails support dynamic-height virtualized rendering for unusually long datasets, while the right-side reader keeps inline content scrolling local to the pane
- Header actions keep mailbox creation, manual refresh, and mailbox-management jump links inside the workbench; desktop layouts restore explicit labels for the dense toolbar actions
- Mailbox creation can stay inline through an anchored popover that locks while submit is pending, then selects and transiently highlights the newly created mailbox after success
- URL search params persist mailbox scope, message selection, sort mode, and mailbox search query
- Message surfaces use manual refresh plus visibility-aware polling instead of server push, preserving Cloudflare free-tier budget while keeping operator-facing data fresh

### Mailboxes
- `/mailboxes`
- `/mailboxes/:mailboxId`
- Lightweight mailbox inventory and lifecycle management surface
- Message browsing is no longer embedded here; mailbox rows and compatibility routes hand off to the workspace
- API mailbox creation accepts optional `rootDomain`; the Web console defaults to `随机`, omits `rootDomain` until the user manually chooses a concrete domain, and otherwise reuses the server-side random active-domain allocation
- When `localPart` and/or `subdomain` are omitted, generated mailbox aliases come from a readable mixed pool instead of machine-looking `mail-*` / `box-*` prefixes, and collisions retry within a bounded attempt budget before falling back to a short natural suffix

### Domains
- `/domains`
- Admin-only mailbox domain catalog and Cloudflare provisioning status surface
- Discover currently manageable Cloudflare zones in real time, bind new domains directly into Cloudflare, and manage enable/disable/retry/delete flows inside the project

### Messages
- `/messages/:messageId`
- Inspect parsed message content, HTML preview, plain text, headers, recipients, attachments, and raw EML download
- Legacy-compatible detail route that can reopen the same message inside the workspace

### Security
- `/api-keys`
- `/api-keys/docs`
- Create and revoke API keys for automation and browser sign-in
- The Web console keeps revoked keys in the inventory for audit, sorts the list by most recent use, and paginates the table in 10-row pages
- Protected in-app quick reference for human operators and Agents, covering runtime metadata, session exchange, API key lifecycle, mailbox lookup/create endpoints, and message polling endpoints

### Public Docs
- GitHub Pages public docs site
- GitHub Pages public Storybook surface at `/storybook/` plus `/storybook.html`
- Public deployment, token permission, domain enablement, API, and troubleshooting guidance outside the authenticated control plane

## API Behavior

- `GET /api/meta` is the runtime truth source for active mailbox domains, TTL defaults, TTL bounds, and address validation hints used by Web and automation clients
- `GET /api/domains/catalog` returns the real-time Cloudflare-visible domain catalog merged with project-local enablement state, including `cloudflareAvailability`, `projectStatus`, `bindingSource`, `cloudflareStatus`, and `nameServers`
- `GET|POST /api/domains` plus `POST /api/domains/bind` and `POST /api/domains/:id/retry|disable|delete` provide admin-only mailbox domain management for multiple Cloudflare zones in one shared instance; `POST /api/domains` enables a discovered catalog domain, while `POST /api/domains/bind` creates a Cloudflare `full` zone directly from the Web UI
- `POST /api/mailboxes` accepts optional `rootDomain`; when omitted, the API randomly selects one active mailbox domain server-side
- Generated mailbox aliases keep the existing validation rules but now prefer realistic person-like or function-like local parts plus readable single- or multi-level subdomains; runtime metadata and Web preview examples use the same deterministic example family
- `POST /api/mailboxes/ensure` accepts either `address` or `localPart + subdomain (+ optional rootDomain)`, reuses an existing visible `active` mailbox when present, and otherwise creates a fresh mailbox
- `GET /api/mailboxes/resolve?address=...` resolves a visible `active` mailbox directly from its address without forcing clients to list-and-filter locally
- Destroyed mailboxes no longer reserve their address; the same address can be created again after destroy completes
- Disabled mailbox domains are excluded from new mailbox creation but do not revoke previously created mailbox routing rules
- `POST /api/domains/:id/delete` is restricted to `bindingSource=project_bind`, deletes the Cloudflare zone first, then soft-deletes the local domain record and clears cached `subdomains` rows for that domain
- `GET /api/messages` accepts repeated `mailbox` params plus `after` / `since` ISO datetime filters; when both cursor aliases are present, the later timestamp is used as the strict lower bound
- All JSON error responses use the same `{ error, details }` envelope
- HTTP traffic only enters the API after runtime-config validation; when required config is missing, the Worker still returns the standard 500 JSON envelope instead of a platform-generated exception page
- `GET /health` and `GET /api/version` stay behind the runtime-config gate but bypass bootstrap side effects, allowing deploy smoke checks to validate the newly published API without depending on bootstrap side effects
- The automatic deploy workflow only supports schema-stable releases with a clean remote migration state: if the target release has a D1 migration diff or remote D1 still has pending migrations, the workflow fails closed and requires manual rollout; otherwise it blocks Pages promotion unless required Worker secrets exist and rollback-backed `/health` plus `/api/version` smoke checks reach the target release SHA
- Production control-plane aliases can coexist: the API Worker can serve multiple custom API domains simultaneously, its CORS trust list accepts every configured control-plane origin, and the Web client prefers the matching API alias for the active control-plane hostname before falling back to the configured base URL

## Refresh Behavior

- Message refresh stays pull-based in V1; no WebSocket, SSE, Durable Object broadcast, or queue-driven push channel is introduced
- Workspace all-mailbox view refreshes its message stream every 15 seconds only while the tab is visible and online
- Workspace single-mailbox view refreshes the selected mailbox stream every 15 seconds while visible and online, while aggregate mailbox-count backing data refreshes every 60 seconds
- Mailboxes page and mailbox detail stats refresh every 60 seconds while visible and online
- Message detail does not interval-poll because stored message bodies are treated as immutable after ingest; it refreshes on manual action plus normal focus/reconnect catch-up
- Hidden-tab and offline polling are disabled; window focus regain and reconnect trigger a single catch-up refetch through the active query layer
- All message-related pages expose a compact manual refresh control with loading feedback and a latest-refresh timestamp

### Users
- `/users`
- Admin-only user management with initial key issuance

## UI Direction

- Dark, minimal, utility-first control plane
- Dense information layout optimized for repeated operational tasks
- Sticky top navigation with clear active state, skip-to-content affordance, logout, and a compact nickname-only account trigger that previews full account details inside a collision-aware popover
- Authenticated AppShell keeps repository, developer, and runtime-version metadata in a true footer that stays at the bottom of short pages without a duplicate summary strip above the workspace
- Desktop-first three-pane workbench for mailbox list, message list, and inline message content
- On desktop three-pane layouts, long mailbox/message datasets stay inside pane-local scroll containers; the page itself should not grow purely because a rail becomes very long
- Workspace mailbox rail supports all-mailbox aggregation, mailbox search, and sorting by recent receive time or create time
- Workspace mailbox and message rails use virtualization for dense operational datasets while keeping the fixed action/header surfaces readable
- Desktop pane-local scrolling uses themed self-rendered rails so all three panes keep a consistent scrollbar appearance across browsers
- Mailbox management surface is intentionally list-first and minimal; email reading flows jump back into the workspace
- Domains management includes a dedicated bind form plus a confirmation popover for destructive delete
- Refresh controls must remain compact, single-line, and header-aligned; visual treatment should communicate freshness without introducing a noisy live-status badge system
- Buttons, badges, and similar compact UI labels must stay on a single line
- Reusable advanced action button primitive: icon + text by default, but secondary actions collapse to icon-only in dense layouts unless a desktop toolbar explicitly restores labels at `lg+`
- Icon-only actions use a mature third-party tooltip with long-press / hover reveal and collision-aware floating placement
- Route 404、权限拒绝、资源不存在、可恢复查询失败与未捕获渲染异常必须共用一套品牌化暗色错误体验；错误态不得伪装成空状态
- 嵌入页面主体的错误态（如工作台内联 404 / pane failure）使用单栏堆叠布局；仅路由级全屏错误页允许使用更宽的恢复信息布局
- Workspace mailbox creation uses a collision-aware anchored popover; outside click and focus changes do not dismiss it, while explicit cancel or `Esc` can close it before submit starts
- Mailbox presentation removes textual lifecycle badges; the workspace rail uses right-aligned numeric badges while mailbox tables show unread / total counts
- Mailbox rail rows stay single-line and navigation-focused; verbose lifecycle metadata is removed from the dense workspace list
- Destroyed mailboxes collapse to a muted single-line row in dense lists to avoid wasting vertical space
- Table-first detail and management pages remain available as compatibility surfaces
- Cool gray embedded HTML mail preview surface to reduce glare while preserving message fidelity

## Change log

- 2026-04-07: Workspace desktop three-pane layout now clamps to the AppShell viewport, keeps scrolling inside each pane, virtualizes the mailbox/message rails for unusually long lists, and uses themed self-rendered pane scrollbars instead of browser-native rails.
- 2026-04-07: Removed the redundant inline helper copy from the mailbox address form so the create surface keeps explanation at the header level only, then refreshed the stored visual evidence.
- 2026-04-07: Replaced legacy `mail-*` / `box-*` default mailbox generation with a shared realistic mixed-pool alias generator, added bounded retry/fallback behavior for generated collisions, and refreshed Web/runtime example surfaces plus visual evidence to match.
- 2026-04-07: Synced the spec after final error-UI convergence; embedded workspace/message 404 surfaces now use the approved single-column stacked layout, while route-level error pages keep the wider recovery treatment.
- 2026-04-06: Added the parallel production aliases `km.707979.xyz` and `api.km.707979.xyz`, kept the existing `cfm.707979.xyz` and `api.cfm.707979.xyz` domains live, and hardened the runtime so the Web control plane picks the matching API alias while Worker CORS trusts both control-plane origins.
- 2026-04-06: Production deployment is now hardened with explicit API Worker secret gates, rollback-backed smoke checks for schema-stable releases with zero pending remote migrations, manual fail-closed handling for migration-bearing releases, and runtime config failures that stay inside the standard JSON error envelope.
- 2026-04-06: Domains can now bind new Cloudflare `full` zones directly from `/domains`, expose `bindingSource/cloudflareStatus/nameServers`, and soft-delete only project-bound domains after a confirmation popover.
- 2026-04-06: Header account details now collapse to a nickname-only trigger; full account metadata is revealed through hover/focus preview or click-pinned popover details instead of a static three-line card.
- 2026-04-06: Added an authenticated AppShell footer for repository/developer/version metadata, removed duplicate runtime noise from the top summary strip, and aligned the repo with an MIT license declaration.
- 2026-04-06: Synced the spec after review-only version metadata cleanup; footer layout, links, and visual acceptance remain unchanged.
- 2026-04-06: Removed the remaining authenticated summary strip so the AppShell header stays focused on navigation and account context only.
- 2026-04-06: Replaced the default React Router error UI with branded fatal / not-found states, added recoverable page-level data-failure surfaces, and aligned workspace pane failures with the same dark error system.

## Visual Evidence

Evidence is persisted with this spec and refreshed whenever the rendered control-plane surfaces change.

### Auth

![Login card with KaisouMail branding](./assets/login-card-kaisoumail.png)

### App Shell

![App shell with the compact nickname-only account trigger](./assets/app-shell-account-trigger.png)

![App shell with the account details popover pinned open](./assets/app-shell-account-popover.png)

![Authenticated AppShell footer metadata](./assets/app-shell-footer.png)

### Workspace

![Workspace all mailboxes](./assets/workspace-all-mailboxes.png)

![Workspace desktop virtualized long lists](./assets/workspace-virtualized-long-lists.png)

PR: include
![Workspace inline mailbox creation popover](./assets/workspace-create-popover.png)

![Workspace mailbox creation pending state](./assets/workspace-create-pending.png)

![Workspace newly created mailbox highlight](./assets/workspace-new-mailbox-highlight.png)

![Workspace single mailbox](./assets/workspace-single-mailbox.png)

![Workspace selected message](./assets/workspace-selected-message.png)

![Workspace refreshing state](./assets/workspace-refreshing.png)

### UI Primitives

![Action button intent showcase](./assets/action-button-intent-showcase.png)

### Error States

![Route fatal error fallback](./assets/error-route-fatal.png)

![Route not found page](./assets/error-route-not-found.png)

![Permission denied surface](./assets/error-permission-state.png)

![Mailboxes page recoverable list failure](./assets/error-mailboxes-list-failure.png)

![Workspace inline message-not-found pane](./assets/error-workspace-reader-not-found.png)

### Mailboxes

![Mailboxes page](./assets/mailboxes.png)

![Mailboxes page refreshing state](./assets/mailboxes-refreshing.png)

### Domains

![Domains page overview](./assets/domains-page-overview.png)

![Domains bind form with Cloudflare status columns](./assets/domains-bind-overview.png)

![Domains delete confirmation popover](./assets/domains-delete-confirmation.png)

![Domains page with Cloudflare-missing domain](./assets/domains-page-missing-cloudflare.png)

### Mailbox Creation

PR: include
![Mailbox create card with the default random-domain placeholder selected](./assets/mailbox-create-unselected-domain.png)

PR: include
![Mailbox create card with explicit root domain selected](./assets/mailbox-create-selected-domain.png)

### Mailbox Detail

![Mailbox detail page](./assets/mailbox-detail.png)

### API Key Management

![API keys page with recent-use sorting and pagination](./assets/api-keys-page-docs-entry.png)

### Integration Reference

![API integration reference page](./assets/api-keys-docs-page.png)

![API integration mailbox and polling reference](./assets/api-keys-docs-mailboxes.png)

### Public Docs

![Public docs site homepage](./assets/docs-site-home.png)

![Cloudflare token permissions docs page](./assets/docs-site-token-permissions.png)

![Public docs FAQ page](./assets/docs-site-faq.png)

![Public Storybook domains page](./assets/storybook-public-home.png)
