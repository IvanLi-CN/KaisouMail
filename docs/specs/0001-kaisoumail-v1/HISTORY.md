# KaisouMail V1 History

## 2026-06-22

- Began the identity-model refactor from `email + name + admin direct-create`
  to `User + ExternalAccount + Passkey + Invite + RegistrationSettings`.
- Added product/domain documentation for email-less users, provider bindings,
  bootstrap admin invite, and mailbox retention after user deletion.
- Reworked auth IA so `/login` and `/register` are separate pages instead of a
  unified dual-column surface.
- Changed admin invite operations to a list-first console with batch invite
  generation instead of single-card one-by-one creation.
