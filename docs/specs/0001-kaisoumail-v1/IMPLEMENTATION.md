# KaisouMail V1 Implementation

## Identity Refactor

- Replace the email-based user contract with `username + nickname + role`.
- Add provider bindings, invite redemption, registration settings, and daily
  provider counters.
- Keep API keys and passkeys as separate auth resources.
- Split the browser auth surface into `/login` and `/register` so sign-in and
  account creation no longer compete inside one card.

## Admin Console

- Remove direct user creation.
- Add user directory, list-first invite management with batch generation,
  registration policy, and admin transfer.

## Account Center

- Add editable nickname, connected accounts, passkey management, API key
  management, and self-service account deletion.
