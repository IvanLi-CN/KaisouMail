# Manually bind the domain in Cloudflare and enable it in KaisouMail

Use this guide when **the domain already exists in Cloudflare, or you prefer to onboard the zone manually in Cloudflare before KaisouMail enables and uses it.**

Unlike the project-direct bind flow, this path does not let KaisouMail create the zone for you. You add the root domain in Cloudflare first, then return to `/domains` to enable it.

## Prepare the feature before first use {#feature-enablement}

### 1. Enable runtime domain management

The API Worker runtime must have:

- `EMAIL_ROUTING_MANAGEMENT_ENABLED=true`
- `CLOUDFLARE_RUNTIME_API_TOKEN` (or the shared `CLOUDFLARE_API_TOKEN`)
- `EMAIL_WORKER_NAME`

If these runtime variables are incomplete, the app may still boot, but `/domains` will not have the full Cloudflare domain-management capability.

### 2. Configure the Cloudflare token

Use the runtime token minimum described in [Cloudflare Token Permissions](/cloudflare-token-permissions).

For the “add in Cloudflare first, enable in KaisouMail later” path, runtime must at least be able to:

- list the target zone
- read the target zone
- enable Email Routing
- write routing rules for future mailboxes

If you also plan to use project-direct zone creation or project-side zone deletion later, keep the same full runtime permission set instead of maintaining a second token profile.

### 3. Verify the runtime gate after deploy

After deploy, confirm:

1. `GET /api/meta` returns `cloudflareDomainLifecycleEnabled=true`
2. `/domains` can load the Cloudflare-backed domain catalog

This only verifies that the project can manage existing zones. It does **not** require `cloudflareDomainBindingEnabled=true`, because that flag only gates direct zone creation from the project.

## Step 1: bind the domain in Cloudflare {#bind-domain-in-cloudflare}

1. Sign in to the target Cloudflare account.
2. Choose **Add a domain / Add site**.
3. Enter the root domain, such as `example.com`.
4. Let Cloudflare onboard it as a **full zone**.
5. Update the registrar to use the nameservers Cloudflare assigned.
6. Wait until the zone becomes `active` in Cloudflare.

If you skip nameserver delegation, KaisouMail may still discover the zone later, but Email Routing enablement will usually stop at `provisioning_error`.

## Step 2: enable the zone inside KaisouMail {#enable-zone-in-project}

1. Open `/domains` in the control plane.
2. Wait for `GET /api/domains/catalog` to discover the zone.
3. Find the matching root domain in the catalog.
4. Click **Enable domain**.
5. The app writes the local `domains` record and tries to enable Email Routing on that zone.
6. On success, the domain moves to `active`.

If the zone is still `pending` on the Cloudflare side, the project will usually keep the local record and show `provisioning_error`. Once the zone becomes active, return to `/domains` and click **Retry**.

## Step 3: use the domain after enablement {#use-enabled-domain}

Once the domain is `active`, KaisouMail uses it in these places:

- `POST /api/mailboxes`: when `rootDomain` is omitted, the server randomly chooses one `active` domain
- `POST /api/mailboxes/ensure`: segmented mailbox creation can omit `rootDomain` as well
- `GET /api/meta`: only returns `active` domains, not the full Cloudflare catalog

The Web control plane mailbox form can also target that domain directly. As long as it stays `active`, new mailboxes can continue using that root domain.

## Troubleshooting {#troubleshooting}

### The zone exists in Cloudflare but does not appear in `/domains` {#catalog-zone-not-visible}

Check these items first:

1. the runtime token scope covers the zone
2. `EMAIL_ROUTING_MANAGEMENT_ENABLED` is `true`
3. `GET /api/meta` already reports `cloudflareDomainLifecycleEnabled=true`

If the catalog is still empty, re-check [Cloudflare Token Permissions](/cloudflare-token-permissions) and [Deployment & Environment](/deployment-environment).

### The zone is visible in `/domains`, but enablement fails {#enable-existing-zone-failed}

The most common cause is that the token can read the zone but cannot write the Email Routing settings required for enablement.

Verify:

- `Zone: Zone: Read`
- `Zone: Email Routing Rules: Edit`
- `Zone: Zone Settings: Edit`
- token scope covers the target zone

If the error is `Authentication error` or `forbidden`, the problem is usually here.

### The zone lands in `provisioning_error` after enablement {#provisioning-error-after-enable}

This usually means the project created the local record, but the Cloudflare side is not ready yet:

1. check whether the zone is still `pending`
2. confirm registrar nameservers match Cloudflare’s assigned values
3. wait until the zone becomes `active`
4. return to `/domains` and click **Retry**

### The project says “this domain already exists” {#zone-already-exists-in-project}

This means the project already has a local record for the same root domain:

- it may already be `active`
- it may be a previous `provisioning_error`
- it may be a reused historical disabled record

Inspect the existing row in the domain catalog first, then decide whether to enable, retry, or clean up the old record instead of creating it again.

## Related reading

- [Bind a new domain directly from the project](/project-domain-binding)
- [Cloudflare Token Permissions](/cloudflare-token-permissions)
- [Deployment & Environment](/deployment-environment)
