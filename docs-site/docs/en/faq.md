# FAQ & Troubleshooting

## Why does `/domains` show `Authentication error`?

Check these items in order:

1. The token includes `Zone: Zone Settings: Edit`.
2. The token scope covers the target zone.
3. The Worker is actually reading the updated token value.

If the zone is `Cloudflare available` but the project status becomes `provisioning_error`, start with those three checks.

## Why can I see the zone but still cannot enable it?

Listing a zone and mutating that zone are different permissions. `GET /api/domains/catalog` only proves that the token can see the zone; it does not prove that it can enable Email Routing on it.

## Why is the new domain missing from `GET /api/meta`?

`/api/meta` returns only project-local `active` domains. A newly discovered zone must be enabled successfully in `/domains` before it appears in mailbox creation forms or automation clients.

## Why do old mailboxes still receive mail after a domain is disabled?

That is by design. `disable` only removes the domain from new mailbox creation. It does not delete historical routing rules.

## Why are the public docs separated from the control plane?

Public docs and Storybook live on GitHub Pages so deployment guidance, troubleshooting, and UI review remain accessible without signing in. The in-app `/api-keys/docs` page stays as a runtime-aware quick reference.
