# KaisouMail V1 Spec

Status: 已完成
Last: 2026-04-10

## Objective

Deliver a Cloudflare-based temporary mailbox control plane with a compact, tool-oriented web console for passkey/API-key login, mailbox lifecycle management, message inspection, API key management, and multi-user administration.

## Product Surfaces

### Auth
- `/login`
- Passkey-first browser sign-in with API key fallback that exchanges credentials for the same browser session cookie

### Workspace
- `/workspace`
- Responsive mail workbench for mailbox filtering, aggregated message browsing, and inline message reading: single-column on phones, two-pane split from `lg`, and full three-pane reading from `xl+`
- Desktop `xl+` workspace layout is clamped to the remaining AppShell viewport height; each pane keeps its own vertical scroll area instead of letting long lists stretch the whole page
- Mailbox and message rails support dynamic-height virtualized rendering for unusually long datasets, while the right-side reader keeps inline content scrolling local to the pane
- Workspace-scoped data intentionally hides stale destroyed history: `active` / `destroying` mailboxes always stay visible, while `destroyed` rows are limited to the most recent 7 days and at most 50 entries so the operator rail stays dense and query-safe
- Header actions keep mailbox creation, manual refresh, and mailbox-management jump links inside the workbench; desktop layouts restore explicit labels for the dense toolbar actions
- Mailbox creation can stay inline through an anchored popover that locks while submit is pending, then selects and transiently highlights the newly created mailbox after success
- URL search params persist mailbox scope, message selection, sort mode, and mailbox search query
- Message surfaces use manual refresh plus visibility-aware polling instead of server push, preserving Cloudflare free-tier budget while keeping operator-facing data fresh; workspace message streams must stay aligned with the same mailbox visibility window used by the left rail

### Mailboxes
- `/mailboxes`
- `/mailboxes/:mailboxId`
- Lightweight mailbox inventory and lifecycle management surface
- Message browsing is no longer embedded here; mailbox rows and compatibility routes hand off to the workspace, while `/mailboxes` itself keeps the full mailbox history and does not inherit the workspace trimming window
- API mailbox creation accepts optional `rootDomain`; the Web console defaults to `随机`, omits `rootDomain` until the user manually chooses a concrete domain, and otherwise reuses the server-side random active-domain allocation
- The shared mailbox-creation form now supports both segmented entry (`localPart + subdomain + rootDomain`) and a full-address mode; supported full addresses normalize to lowercase, unsupported domains are blocked client-side, and pasting a supported full address into segmented fields offers a one-click mode switch with auto-filled values
- Mailbox TTL entry now uses a non-linear slider plus inline editable display: finite values span `1 hour .. 1 year` on a logarithmic scale, with compact key anchors such as `30 days` and `180 days`; an explicit final slot and `expiresInMinutes: null` represent long-term lifetime
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
- Identity-auth hub that splits browser Passkey management from automation-facing API key inventory while keeping both on the same route
- Register, list, and revoke passkeys for browser sign-in while keeping API keys for automation, recovery, and browser fallback
- The Web console keeps revoked keys in the inventory for audit, sorts the list by most recent use, and paginates the table in 10-row pages
- Protected in-app quick reference for human operators and Agents, covering runtime metadata, passkey/session exchange, API key lifecycle, mailbox lookup/create endpoints, and message polling endpoints

### Public Docs
- GitHub Pages public docs site
- GitHub Pages public Storybook surface at `/storybook/` plus `/storybook.html`
- Public deployment, token permission, domain enablement, API, and troubleshooting guidance outside the authenticated control plane

## API Behavior

- `POST /api/auth/passkey/options|verify` provides discoverable passkey browser login against the configured control-plane origin set (`WEB_APP_ORIGIN` + `WEB_APP_ORIGINS`), derives one shared non-public RP ID from that trusted origin set, rejects raw IP-literal origins in favor of `localhost`/domain hosts, then issues the same `kaisoumail_session` cookie used by the API key exchange flow
- `GET /api/passkeys` plus `POST /api/passkeys/registration/options|verify` and `DELETE /api/passkeys/:id` manage per-user passkeys with revocation-aware audit history
- `GET /api/meta` is the runtime truth source for active mailbox domains, TTL defaults, TTL bounds, unlimited-TTL capability, address validation hints, and whether browser passkey auth is currently enabled
- `GET /api/domains/catalog` returns the real-time Cloudflare-visible domain catalog merged with project-local enablement state, including `cloudflareAvailability`, `projectStatus`, `bindingSource`, `cloudflareStatus`, and `nameServers`
- `GET|POST /api/domains` plus `POST /api/domains/bind` and `POST /api/domains/:id/retry|disable|delete` provide admin-only mailbox domain management for multiple Cloudflare zones in one shared instance; `POST /api/domains` enables a discovered catalog domain, while `POST /api/domains/bind` creates a Cloudflare `full` zone directly from the Web UI
- `POST /api/mailboxes` accepts optional `rootDomain`; when omitted, the API randomly selects one active mailbox domain server-side, while `expiresInMinutes` can be omitted for the runtime default TTL or set to `null` for a long-term mailbox
- Generated mailbox aliases keep the existing validation rules but now prefer realistic person-like or function-like local parts plus readable single- or multi-level subdomains; runtime metadata and Web preview examples use the same deterministic example family
- `POST /api/mailboxes/ensure` accepts either `address` or `localPart + subdomain (+ optional rootDomain)`, reuses an existing visible `active` mailbox when present, and otherwise creates a fresh mailbox
- `GET /api/mailboxes/resolve?address=...` resolves a visible `active` mailbox directly from its address without forcing clients to list-and-filter locally
- `GET /api/mailboxes` accepts optional `scope=workspace`; the default scope returns the caller's full mailbox history, while workspace scope keeps all `active` / `destroying` rows and only the newest 50 `destroyed` rows whose `destroyedAt` is within the last 7 days, preserving that destroyed-history slice in descending `destroyedAt` order
- Destroyed mailboxes no longer reserve their address; the same address can be created again after destroy completes
- Disabled mailbox domains are excluded from new mailbox creation but do not revoke previously created mailbox routing rules
- `POST /api/domains/:id/delete` is restricted to `bindingSource=project_bind`, deletes the Cloudflare zone first, then soft-deletes the local domain record and clears cached `subdomains` rows for that domain
- `GET /api/messages` accepts repeated `mailbox` params, optional repeated `mailboxId` params, plus `after` / `since` ISO datetime filters and optional `scope=workspace`; when both cursor aliases are present, the later timestamp is used as the strict lower bound, and workspace scope can pin reused-address mailbox selection by `mailboxId` so the middle pane does not mix message history across visible mailbox generations
- All D1-backed dynamic `IN (...)` lookups used by workspace mailbox hydration, message mailbox filtering, and mailbox cleanup are chunked in batches of 50 to stay below Cloudflare D1 parameter limits
- Mailbox destroy/cleanup now keeps message metadata until R2 deletion succeeds, hides `destroying` mailbox messages from read APIs, clears `lastReceivedAt` hydration for `destroying` mailboxes so the rail stays aligned with the visible message feed, and scheduled cleanup retries mailboxes stuck in `destroying` ahead of fresh `active` cleanup work while continuing through the rest of the batch even after an earlier mailbox failure
- All JSON error responses use the same `{ error, details }` envelope
- HTTP traffic only enters the API after runtime-config validation; when required config is missing, the Worker still returns the standard 500 JSON envelope instead of a platform-generated exception page
- `GET /health` and `GET /api/version` stay behind the runtime-config gate but bypass bootstrap side effects, allowing deploy smoke checks to validate the newly published API without depending on bootstrap side effects
- The automatic deploy workflow now captures a D1 Time Travel restore anchor, re-validates the actual remote pending D1 migration set before apply, uploads a non-live API Worker version, adds it to the active deployment at 0% traffic, smoke-tests it through the canonical API custom domain with `Cloudflare-Workers-Version-Overrides`, promotes that version to 100% production traffic only after shadow `/health` plus `/api/version` smoke reach the target release SHA, runs production API smoke before any trigger changes, explicitly applies API Worker route/domain/cron trigger changes only after that smoke passes, reruns post-trigger smoke across `VITE_API_BASE_URL` plus every routable API URL declared in `apps/api-worker/wrangler.jsonc`, deploys Pages from `apps/web` so Wrangler can pick up the app-local `wrangler.jsonc`, reruns same-origin `/api/version` smoke across every Pages alias declared in `CF_PAGES_SMOKE_ORIGINS`, disables automatic Worker rollback whenever the release is migration-bearing or remote D1 schema changes were involved in the deploy, and keeps D1 restore as an explicit disaster-recovery path instead of an automatic failure hook
- The default auto-release path only accepts expand-only / forward-compatible D1 migrations; CI blocks obvious destructive SQL patterns, Deploy re-checks the remote pending migration set before apply, runtime compatibility code is kept for at most one release, and destructive schema cleanup moves to a later dedicated cleanup release
- Production control-plane aliases can coexist: the API Worker can serve multiple custom API domains simultaneously, its CORS trust list accepts every configured control-plane origin for direct API usage, and the first-party Web control plane now reaches the API through same-origin `/api` Pages Functions that bind to `kaisoumail-api`; `.pages.dev` preview hostnames fail closed inside that proxy, and malformed `CF_PAGES_SMOKE_ORIGINS` entries now hard-fail the deploy gate instead of being skipped silently

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
- Login keeps a prominent passkey CTA with explicit API key fallback in the same card, and the identity-auth page uses explicit `API Keys` / `Passkey` tabs instead of stacking both inventories together
- Sticky top navigation with clear active state, skip-to-content affordance, logout, and a compact nickname-only account trigger that previews full account details inside a collision-aware popover
- Authenticated AppShell keeps repository, developer, and runtime-version metadata in a true footer that stays at the bottom of short pages without a duplicate summary strip above the workspace
- Responsive mailbox workbench uses one column below `lg`, a mailbox rail plus stacked message panes at `lg`, and the full three-pane reading layout at `xl+`
- On desktop three-pane layouts, long mailbox/message datasets stay inside pane-local scroll containers; the page itself should not grow purely because a rail becomes very long
- Workspace mailbox rail supports all-mailbox aggregation, mailbox search, and sorting by recent receive time or create time
- Workspace mailbox and message rails use virtualization for dense operational datasets while keeping the fixed action/header surfaces readable
- Desktop pane-local scrolling uses themed self-rendered rails so all three panes keep a consistent scrollbar appearance across browsers
- Mailbox management surface is intentionally list-first and minimal; email reading flows jump back into the workspace
- Domains management includes a dedicated bind form plus a confirmation popover for destructive delete
- Refresh controls stay compact and header-aligned on wide layouts, while narrow viewports may wrap the action row without truncating the primary operations or introducing a noisy live-status badge system
- Buttons, badges, and similar compact UI labels must stay on a single line
- Reusable advanced action button primitive: icon + text by default, but secondary actions collapse to icon-only in dense layouts unless a desktop toolbar explicitly restores labels at `lg+`
- Icon-only actions use a mature third-party tooltip with long-press / hover reveal and collision-aware floating placement
- Route 404、权限拒绝、资源不存在、可恢复查询失败与未捕获渲染异常必须共用一套品牌化暗色错误体验；错误态不得伪装成空状态
- 嵌入页面主体的错误态（如工作台内联 404 / pane failure）使用单栏堆叠布局；仅路由级全屏错误页允许使用更宽的恢复信息布局
- Workspace mailbox creation uses a collision-aware anchored popover; outside click and focus changes do not dismiss it, while explicit cancel or `Esc` can close it before submit starts
- Mailbox creation guidance stays mode-aware: segmented mode can still promise random active-domain allocation, while full-address mode instead explains supported-domain validation and keeps the current normalized address preview visible
- Mailbox lifetime control now keeps the dense dialog compact: a log-scale slider covers short-lived to long-lived finite mailboxes up to one year, the current resolved TTL is shown inline at the right edge, double-click inline editing accepts common human units, and the terminal slider slot exposes explicit long-term lifetime
- Mailbox presentation removes textual lifecycle badges; the workspace rail uses right-aligned numeric badges while mailbox tables show unread / total counts
- Mailbox rail rows stay single-line and navigation-focused; verbose lifecycle metadata is removed from the dense workspace list
- Destroyed mailboxes collapse to a muted single-line row in dense lists to avoid wasting vertical space
- Table-first detail and management pages remain available as compatibility surfaces
- Cool gray embedded HTML mail preview surface to reduce glare while preserving message fidelity

## Change log

- 2026-04-11: Refined the workspace verification-copy feedback so success tooltips use neutral animated checkmark feedback inside the existing dark console palette, then refreshed the stored workspace evidence.
- 2026-04-10: Added subject-first / body-fallback verification-code recognition with Workers AI fallback, surfaced inline workspace copy actions in the mailbox and message rails, and refreshed workspace visual evidence for the new copy affordances.
- 2026-04-10: Replaced the mailbox TTL number input with a logarithmic `1 hour .. 1 year + long-term` slider plus double-click inline duration editing, split runtime semantics into `rootDomain omitted => random` and `expiresInMinutes omitted => default / null => long-term`, and updated API/runtime surfaces so long-term mailboxes are exposed as `expiresAt = null`.
- 2026-04-09: Fixed the production Pages deploy step to run from `apps/web` instead of passing `apps/web/wrangler.jsonc` via `--config`, because Wrangler Pages deploy rejects custom config paths; the same-origin Pages smoke gate now depends only on valid `CF_PAGES_SMOKE_ORIGINS` data rather than a broken deploy command.
- 2026-04-09: Tightened the `/domains` layout so Cloudflare status badges keep visible inline spacing and the bind form button stays aligned with the root-domain input even when validation or submit errors are visible, then refreshed the domains visual evidence.
- 2026-04-09: Patched the shared focus-ring token fallbacks so workspace message rows, toolbar actions, search inputs, and identity tabs keep themed focus halos instead of white fallback outlines, and refreshed visual evidence for those repaired states.
- 2026-04-09: Aligned workspace mailbox recency with the hidden `destroying` message feed and fixed workspace-scoped destroyed-history ordering so the API now returns the retained destroyed slice in descending `destroyedAt` order.
- 2026-04-08: Added workspace-scoped mailbox/message reads with a `destroyed` retention window (`7 days ∩ newest 50 rows`), chunked all D1 dynamic `IN (...)` queries to 50 ids per batch, and hardened mailbox destroy cleanup so stuck `destroying` rows are retried safely without losing the R2 keys needed for later cleanup retries.
- 2026-04-08: The first-party Web control plane now uses same-origin `/api` through a Pages Function plus Service Binding, while direct `api.cfm.707979.xyz` / `api.km.707979.xyz` aliases remain available for compatibility, automation, deploy smoke, and direct API consumers.
- 2026-04-08: Added dual-mode mailbox creation with supported full-address input, segmented-field paste-to-switch guidance, normalized auto-fill when switching modes, and refreshed mailbox-creation visual evidence for both the classic segmented flow and the new full-address states.
- 2026-04-07: Renamed the `/api-keys` control-plane surface to an identity-auth page, added explicit `API Keys` / `Passkey` tabs, and refreshed the page evidence to show each tab separately.
- 2026-04-07: Workspace desktop three-pane layout now clamps to the AppShell viewport, keeps scrolling inside each pane, virtualizes the mailbox/message rails for unusually long lists, and uses themed self-rendered pane scrollbars instead of browser-native rails.
- 2026-04-07: Tightened the responsive shell again so inline navigation stays single-row on wide tablets, collapsed desktop account/logout utilities to icon-only actions, and hid the workspace summary sentence on phone-sized layouts to preserve vertical space.
- 2026-04-07: Simplified user-facing copy across the authenticated shell and control-plane pages, kept the mobile drawer focused on account/navigation/logout only, moved longer mailbox-creation guidance behind a contextual help popover, and refreshed responsive evidence against the canonical phone/tablet/desktop Storybook viewports.
- 2026-04-07: Removed the redundant inline helper copy from the mailbox address form so the create surface keeps explanation at the header level only, then refreshed the stored visual evidence.
- 2026-04-07: Replaced legacy `mail-*` / `box-*` default mailbox generation with a shared realistic mixed-pool alias generator, added bounded retry/fallback behavior for generated collisions, and refreshed Web/runtime example surfaces plus visual evidence to match.
- 2026-04-07: Synced the spec after final error-UI convergence; embedded workspace/message 404 surfaces now use the approved single-column stacked layout, while route-level error pages keep the wider recovery treatment.
- 2026-04-07: Reworked the authenticated shell and `/workspace` layout into a responsive `mobile 1-column / tablet 2-pane / desktop 3-pane` system, moved inline primary navigation next to the site title from `lg+`, and routed narrow screens through a right-side drawer that also carries account details and logout.
- 2026-04-07: Production deployment now auto-applies remote D1 migrations, re-validates the pending remote migration set at deploy time, gates API promotion on preview plus production smoke checks, records an explicit D1 Time Travel restore anchor for incidents, runs the rollback-backed production smoke before any trigger changes, validates every routable API URL again after trigger application, halts for manual trigger inspection when trigger application or post-trigger smoke fails, and disables automatic Worker rollback whenever the release is migration-bearing or remote D1 schema changes were involved in the deploy so migrated schemas are never paired with an older Worker by accident.
- 2026-04-06: Added passkey registration and passkey-based browser sign-in alongside the existing API key session exchange, expanded the `/api-keys` security surface with passkey management, and refreshed the in-app/public auth reference docs.
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

![Login card with passkey-first sign-in and API key fallback](./assets/login-card-kaisoumail.png)

![Identity auth passkey tab with registration disabled on an untrusted origin while existing passkeys remain visible](./assets/passkey-tab-untrusted-origin.png)

### App Shell

![App shell on mobile with the navigation drawer expanded](./assets/app-shell-mobile-menu-responsive.png)

![App shell on wide tablet with inline navigation beside the site title](./assets/app-shell-tablet-inline-nav-responsive.png)

![App shell on desktop with the inline navigation kept in the same header row](./assets/app-shell-desktop-inline-nav-responsive.png)

![App shell with the account details popover pinned open](./assets/app-shell-account-details-responsive.png)

![Authenticated AppShell footer metadata](./assets/app-shell-footer-responsive.png)

### Workspace

![Workspace on mobile with a single-column reading order](./assets/workspace-mobile-single-column-responsive.png)

![Workspace on wide tablet with a mailbox rail and stacked reading panes](./assets/workspace-tablet-split-view-responsive.png)

![Workspace on desktop with the restored three-pane reading layout](./assets/workspace-desktop-three-pane-responsive.png)

![Workspace desktop virtualized long lists](./assets/workspace-virtualized-long-lists.png)

![Workspace scope trims destroyed history to the latest seven-day / 50-row window](./assets/workspace-scope-destroyed-window.png)

![Workspace verification copy affordances](./assets/workspace-verification-copy.png)

PR: include
![Workspace inline mailbox creation popover](./assets/workspace-create-popover.png)

![Workspace message row with the repaired focus halo](./assets/workspace-message-row-focus-ring.png)

![Workspace toolbar create button with the repaired focus halo](./assets/workspace-new-mailbox-button-focus-ring.png)

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

PR: include
![Domains page overview](./assets/domains-page-overview.png)

![Domains bind form with Cloudflare status columns](./assets/domains-bind-overview.png)

PR: include
![Domains bind form submit error with aligned action button](./assets/domains-bind-submit-error.png)

![Domains delete confirmation popover](./assets/domains-delete-confirmation.png)

![Domains page with Cloudflare-missing domain](./assets/domains-page-missing-cloudflare.png)

### Mailbox Creation

PR: include
![Mailbox create card with the default random-domain placeholder and 1-hour TTL slider state](./assets/mailbox-create-ttl-random-slider.png)

![Mailbox create card on mobile keeps the `30 天` anchor while the right edge stays on `长期`](./assets/mailbox-create-ttl-mobile-priority-30d.png)

PR: include
![Mailbox create card with the finite TTL slider pushed to the 1-year cap while keeping the 30-day and 180-day anchors visible](./assets/mailbox-create-ttl-max-finite.png)

PR: include
![Mailbox create card with the explicit long-term TTL slot selected](./assets/mailbox-create-ttl-unlimited.png)

PR: include
![Mailbox create card after inline TTL editing parses `36h` into `1 天 12 小时`](./assets/mailbox-create-ttl-inline-36h.png)

PR: include
![Mailbox create card after inline TTL editing accepts `300d` as `300 天`](./assets/mailbox-create-ttl-inline-300d.png)

### Mailbox Detail

![Mailbox detail page](./assets/mailbox-detail.png)

### Identity Auth

![Identity auth page with the API Keys tab selected](./assets/api-keys-page-docs-entry.png)

![Identity auth page with the Passkey tab selected](./assets/api-keys-page-passkey-tab.png)

![Identity auth tabs component with the API Keys tab selected](./assets/identity-auth-tabs-api-keys-story.png)

![Identity auth tabs component with the Passkey tab selected](./assets/identity-auth-tabs-passkey-story.png)

![Identity auth tabs with the repaired focus halo](./assets/identity-auth-tabs-focus-ring.png)

### Integration Reference

![API integration reference page](./assets/api-keys-docs-page.png)

![API integration mailbox and polling reference](./assets/api-keys-docs-mailboxes.png)

### Public Docs

![Public docs site homepage](./assets/docs-site-home.png)

![Cloudflare token permissions docs page](./assets/docs-site-token-permissions.png)

![Public docs FAQ page](./assets/docs-site-faq.png)

![Public Storybook domains page](./assets/storybook-public-home.png)
