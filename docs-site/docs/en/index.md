# KaisouMail Docs

## Reading order

1. Configure tokens in [Cloudflare Token Permissions](/cloudflare-token-permissions).
2. Configure Worker, Pages, and web variables in [Deployment & Environment](/deployment-environment).
3. Either bind the domain directly from `/domains`, or add it in Cloudflare first and then enable it by following [Domain Catalog & Enablement](/domain-catalog-enablement).
4. Use [API Reference](/api-reference) for endpoint discovery, then open `/api-keys/docs` inside the control plane for runtime-aware examples.

## Documentation map

- [Quick Start](/quick-start)
- [Deployment & Environment](/deployment-environment)
- [Cloudflare Token Permissions](/cloudflare-token-permissions)
- [Domain Catalog & Enablement](/domain-catalog-enablement)
- [API Reference](/api-reference)
- [FAQ & Troubleshooting](/faq)
- [Open Storybook](/storybook.html)

## Key points

- If `/domains` shows `provisioning_error / Authentication error`, check `Zone: Zone Settings: Edit` first, then confirm that the token scope covers the target zone.
- A zone does not enter `GET /api/meta` or the random mailbox pool until it becomes `active` in `/domains`.
