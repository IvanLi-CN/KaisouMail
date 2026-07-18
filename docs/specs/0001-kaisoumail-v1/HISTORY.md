# KaisouMail V1 History

## 2026-07-18

- Tightened `/login` and `/register` CTA feedback so provider, Passkey, and API
  key handoffs visibly arm only the clicked button, ignore later cross-clicks
  without greying out the alternatives, and keep the pending state on-screen
  before external/route navigation starts.
- Added Storybook pending-state coverage plus fresh visual evidence for login
  provider handoff and register Passkey handoff.

## 2026-06-22

- Began the identity-model refactor from `email + name + admin direct-create`
  to `User + ExternalAccount + Passkey + Invite + RegistrationSettings`.
- Added product/domain documentation for email-less users, provider bindings,
  bootstrap admin invite, and mailbox retention after user deletion.
- Reworked auth IA so `/login` and `/register` are separate pages instead of a
  unified dual-column surface.
- Changed admin invite operations to a list-first console with batch invite
  generation instead of single-card one-by-one creation.
