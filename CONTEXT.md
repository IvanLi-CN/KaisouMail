# Context

## User

A local identity inside KaisouMail. A `User` has a system-generated immutable
`username`, an editable display `nickname`, a `role`, and optional login
bindings.

## External Account

A third-party login binding between one `User` and one provider identity. An
`External Account` is uniquely owned by `provider + providerUserId` while it is
active.

## Passkey

A WebAuthn credential bound to one `User`. A passkey is an interactive login
method and can be revoked independently from external accounts.

## Invite

A one-time code that authorizes account creation without consuming provider open
quota. Standard invites create member accounts. The bootstrap admin invite is a
special one-time deployment secret for creating the first admin.

## Registration Mode

The policy that controls whether a channel may create new local accounts.
GitHub/LinuxDO support `off`, `invite-only`, and `open`. Passkey first-time
registration supports `off` and `invite-only`.

## Daily Signup Counter

The per-provider per-day record that tracks how many accounts were created by an
`open` provider registration path in the `Asia/Shanghai` timezone.

## Interactive Login Method

A login method that a human can use to enter the Web control plane. In this
project, interactive methods are `GitHub`, `LinuxDO`, and `Passkey`. API keys
are not interactive login methods.

## Deleted User Mailbox Retention

The global policy that clamps mailbox lifetime after account deletion. It is
measured in days from the user deletion timestamp and is configurable in the
`0..30` range.
