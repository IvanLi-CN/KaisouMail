# KaisouMail Docs

## Reading order

1. Configure runtime and deploy tokens in [Cloudflare Token Permissions](/cloudflare-token-permissions).
2. Configure Worker, Pages, and runtime variables in [Deployment & Environment](/deployment-environment).
3. If you enable GitHub / LinuxDO login or registration, use [OAuth Configuration](/oauth-configuration) for callback, client id, and secret setup.
4. Start with [Domain onboarding overview](/domain-onboarding) to choose the right path.
5. If you want to **onboard the domain manually in Cloudflare first**, read [Manually bind the domain in Cloudflare and enable it in KaisouMail](/domain-catalog-enablement).
6. If you want to **bind a brand-new apex domain directly from `/domains`**, read [Bind a new domain directly from the project](/project-domain-binding).
7. Use [API Reference](/api-reference) for endpoint discovery, then open `/api-keys/docs` inside the control plane for runtime-aware examples.

## Documentation map

- [Quick Start](/quick-start)
- [Deployment & Environment](/deployment-environment)
- [Cloudflare Token Permissions](/cloudflare-token-permissions)
- [OAuth Configuration](/oauth-configuration)
- [Domain onboarding overview](/domain-onboarding)
- [Manually bind the domain in Cloudflare and enable it in KaisouMail](/domain-catalog-enablement)
- [Bind a new domain directly from the project](/project-domain-binding)
- [API Reference](/api-reference)
- [FAQ & Troubleshooting](/faq)
- [Open Storybook](/storybook.html)

## Key points

- `cloudflareDomainLifecycleEnabled=true` means the project can already manage zones that exist in Cloudflare.
- `cloudflareDomainBindingEnabled=true` is required before the project can create brand-new Cloudflare zones directly.
- A domain does not enter `GET /api/meta` or the random mailbox pool until it becomes `active` in `/domains`.
