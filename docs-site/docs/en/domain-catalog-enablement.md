# Domain Catalog & Enablement

You no longer need to type a `zoneId` by hand. Use one of these flows:

### Option A — bind a brand-new domain from the project

1. Open `/domains` in the control plane.
2. Enter the root domain in **Bind to Cloudflare**.
3. The app calls `POST /api/domains/bind`, creates a Cloudflare `full` zone, and immediately attempts Email Routing enablement.
4. If Cloudflare still reports the zone as `pending`, the project record stays in `provisioning_error` until you retry after delegating the assigned nameservers.

### Option B — enable a zone that already exists in Cloudflare

1. Add or onboard the domain in Cloudflare.
2. Open `/domains` in the control plane.
3. Wait for `GET /api/domains/catalog` to discover the zone.
4. Click **Enable**.
5. The app writes the local `domains` record and attempts to enable Email Routing on that zone.

## Status meanings

| Status | Meaning |
| --- | --- |
| `not_enabled` | visible in Cloudflare, not enabled in the project yet |
| `active` | enabled and available for mailbox creation |
| `disabled` | disabled for new mailbox creation |
| `provisioning_error` | enablement failed; inspect the error column and retry |
| `missing` | local record exists, but the current token no longer sees the zone |

## What changes after enablement

- `POST /api/mailboxes`: `rootDomain` is optional; when omitted, the server randomly selects one `active` domain.
- `POST /api/mailboxes/ensure`: `rootDomain` is also optional for `localPart + subdomain`; omission uses the same random `active` pool.
- `GET /api/meta`: returns only `active` domains, not the full Cloudflare catalog.

## Delete behavior

- Only domains with `bindingSource=project_bind` can be deleted from `/domains`.
- Delete uses a confirmation popover, then calls `POST /api/domains/:id/delete`.
- The API first deletes the Cloudflare zone, then soft-deletes the local domain record and clears the cached `subdomains` rows for that domain.
- If any `active` mailbox still references that domain, delete is blocked.

## Notes

- A visible zone is not automatically usable for mailbox creation.
- Only `active` domains enter the mailbox creation pool.
- `disabled` does not delete historical routing rules, so old mailboxes may continue receiving mail.
