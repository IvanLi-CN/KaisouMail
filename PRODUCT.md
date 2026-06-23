# KaisouMail Product

## Product

KaisouMail is a Cloudflare-based temporary mailbox control plane. The product
lets a small team create disposable mailboxes, inspect messages, and manage
delivery infrastructure through a compact Web console.

## Primary Users

- The single system administrator who controls registration policy, mailbox
  domains, invites, and admin transfer.
- Member operators who use temporary mailboxes, inspect inbound mail, and
  manage their own auth methods.
- Automation clients that keep using API keys for mailbox and message APIs.

## Core Surfaces

### Login

- `/login`
- Unified login and registration surface.
- Supports API key browser fallback, passkey login, GitHub login, LinuxDO login,
  invite-based passkey registration, and provider-driven auto registration.

### Account Center

- `/api-keys`
- Identity-focused self-service surface.
- Shows immutable `username`, editable `nickname`, connected external accounts,
  passkeys, API keys, and account deletion.

### Admin Console

- `/users`
- Single-admin control plane for user directory, one-time invite management,
  registration strategy, daily provider signup quotas, mailbox retention after
  account deletion, and admin transfer.

### Workspace

- `/workspace`
- Mailbox and message workbench for day-to-day temporary mail usage.

### Mailboxes and Domains

- `/mailboxes`
- `/domains`
- Mailbox lifecycle management plus Cloudflare-backed domain operations.

## Identity Rules

- Users do not have passwords.
- Users do not store personal email addresses.
- `username` is system-generated, globally unique, and immutable.
- `nickname` is the only self-editable identity field.
- External accounts are optional and are bound by `provider + providerUserId`.
- Passkeys are optional and can be added after the account exists.
- API keys remain for automation and fallback browser session exchange.
- There is always at most one active admin.

## Registration Rules

- GitHub and LinuxDO each support `off | invite-only | open`.
- Passkey first-time registration supports `off | invite-only`.
- Provider `open` registration consumes a daily quota by provider in the
  `Asia/Shanghai` day boundary.
- Invite-based registration does not consume the daily provider quota.
- Existing bound users can continue logging in through a provider even after the
  provider registration mode changes to `off`.
- The first admin can only be created by redeeming
  `BOOTSTRAP_ADMIN_INVITE_CODE`.

## Deletion Rules

- Account deletion is soft delete.
- Deleting an account immediately invalidates interactive login, releases
  external-account bindings, revokes passkeys, and revokes API keys.
- Owned mailboxes stay recoverable only until `deletedAt + retentionDays`, where
  `retentionDays` is a global admin setting in the `0..30` range.
