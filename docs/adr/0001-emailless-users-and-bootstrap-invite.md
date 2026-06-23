# ADR 0001: Email-less Users, External Bindings, and Bootstrap Admin Invite

## Status

Accepted

## Context

KaisouMail originally treated a user as an `email + name` record and allowed
the admin to create users directly. The product now needs invite-based
registration, provider auto registration, passkey-first flows, self-service
binding and unbinding, account deletion, and a hard guarantee that there is only
one admin at a time.

The new product rules also explicitly reject password auth, personal-email
storage, and identity merging across registration channels.

## Decision

- `User` no longer stores a personal email address.
- Every local user is identified by an immutable generated `username` plus an
  editable `nickname`.
- Third-party login is modeled as `ExternalAccount`, bound uniquely by
  `provider + providerUserId`.
- Passkeys remain first-class interactive credentials and are modeled
  independently from external accounts.
- Registration policy is centralized in a singleton
  `RegistrationSettings` record plus per-provider `DailySignupCounter` rows.
- The first admin is created only by redeeming the deployment-provided
  `BOOTSTRAP_ADMIN_INVITE_CODE`.
- Admins do not create ordinary users directly anymore. They create one-time
  invites and manage registration policy instead.

## Consequences

- The auth model becomes channel-agnostic and no longer depends on provider
  email availability.
- Existing provider users can keep logging in even when new registrations from
  that provider are closed.
- Account deletion can release bindings cleanly without needing email-ownership
  reconciliation.
- Bootstrap behavior becomes explicit, auditable, and independent from any
  provider or mailbox API key shortcut.
