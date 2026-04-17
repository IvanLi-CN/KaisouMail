# Domain onboarding overview

KaisouMail currently supports two domain-onboarding paths:

## Choose a path

### Option A: bind manually in Cloudflare first

Use this when:

- the domain already exists in Cloudflare
- you want to verify zone ownership and nameserver delegation yourself first
- you only want the project to handle enablement and later usage

Continue with:

- [Manual bind & enable](/domain-catalog-enablement)

### Option B: bind directly from the project

Use this when:

- you want to enter the apex root domain directly in `/domains`
- runtime already has the broader Cloudflare permissions required
- you want the project to call Cloudflare `POST /zones` for an apex zone
- if you need `user@mail.example.com`, you are okay binding the apex first and setting mailbox `subdomain=mail`

> The product does not treat child-zone onboarding as a standard free-tier path; for subdomain-style addresses, use apex binding plus the mailbox `subdomain` field.

Continue with:

- [Direct bind in project](/project-domain-binding)

## Shared preflight checks

Whichever path you choose, verify these first:

1. [Deployment & Environment](/deployment-environment) is fully configured
2. [Token Permissions](/cloudflare-token-permissions) covers the intended operation
3. `EMAIL_ROUTING_MANAGEMENT_ENABLED=true`
4. `EMAIL_WORKER_NAME` is configured

If you want to use direct project-side binding, also confirm:

- `CLOUDFLARE_ACCOUNT_ID` is present in API Worker runtime
- `GET /api/meta` returns `cloudflareDomainBindingEnabled=true`

## What happens after enablement

Once a domain becomes `active`:

- the Web control plane can select it directly for mailbox creation
- `POST /api/mailboxes` can target it through `rootDomain`
- when `rootDomain` is omitted, the server randomly chooses from all `active` domains
- `GET /api/meta` only returns current `active` domains

## Common entry points

- want to onboard an existing zone: [Manual bind & enable](/domain-catalog-enablement)
- want to create a new apex zone directly: [Direct bind in project](/project-domain-binding)
- want to verify permissions first: [Token Permissions](/cloudflare-token-permissions)
- want the full runtime checklist: [Deployment & Environment](/deployment-environment)
