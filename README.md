# KaisouMail

[English](./README.md) | [简体中文](./README.zh-CN.md)

[![CI Main](https://github.com/IvanLi-CN/KaisouMail/actions/workflows/ci-main.yml/badge.svg)](https://github.com/IvanLi-CN/KaisouMail/actions/workflows/ci-main.yml)
[![CI PR](https://github.com/IvanLi-CN/KaisouMail/actions/workflows/ci-pr.yml/badge.svg)](https://github.com/IvanLi-CN/KaisouMail/actions/workflows/ci-pr.yml)
[![Docs Pages](https://github.com/IvanLi-CN/KaisouMail/actions/workflows/docs-pages.yml/badge.svg)](https://github.com/IvanLi-CN/KaisouMail/actions/workflows/docs-pages.yml)
[![Cloudflare Workers](https://img.shields.io/badge/Cloudflare-Workers-F38020?logo=cloudflare&logoColor=white)](https://developers.cloudflare.com/workers/)
[![React](https://img.shields.io/badge/React-Control%20Plane-149ECA?logo=react&logoColor=white)](https://react.dev/)
[![Hono](https://img.shields.io/badge/Hono-API%20Worker-E36002)](https://hono.dev/)
[![Bun](https://img.shields.io/badge/Bun-Toolchain-000000?logo=bun&logoColor=white)](https://bun.sh/)
[![Latest Release](https://img.shields.io/github/v/release/IvanLi-CN/KaisouMail?display_name=tag)](https://github.com/IvanLi-CN/KaisouMail/releases/latest)
[![MIT License](https://img.shields.io/github/license/IvanLi-CN/KaisouMail)](./LICENSE)

Self-hosted temporary email platform for Cloudflare. KaisouMail gives operators a Cloudflare-native control plane for disposable inboxes, domain onboarding, message storage, and verification-code extraction.

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="./apps/web/brand/generated/social/github-social-preview.png">
  <img src="./apps/web/brand/generated/social/github-social-preview-light.png" alt="KaisouMail social preview">
</picture>

## Start Here

- Read the docs: [KaisouMail Docs](https://ivanli-cn.github.io/KaisouMail/)
- Deploy your own instance: [Deployment & Environment](https://ivanli-cn.github.io/KaisouMail/deployment-environment)

## What You Can Do

- Manage disposable mailboxes across multiple Cloudflare-backed domains.
- Store raw email in R2 and structured message metadata in D1.
- Run a same-origin React control plane through Cloudflare Pages and Workers.
- Onboard domains from the Cloudflare catalog or bind a new apex domain directly from `/domains`.
- Extract verification codes with deterministic parsing first, then use Workers AI for ambiguous messages.
- Keep self-hosted workflows practical with public docs, Storybook previews, and GitHub-driven delivery.

## Demo Quick Start

This starts the React control plane in demo mode with mock data. No Worker, Cloudflare account, or mailbox domain is required.

```bash
bun install
bun run version:write
VITE_DEMO_MODE=true bun run --cwd apps/web dev
```

For the full local stack, Cloudflare token setup, and production deployment, use the docs below.

## Architecture

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="./docs/readme-assets/kaisoumail-architecture.png">
  <img src="./docs/readme-assets/kaisoumail-architecture-light.png" alt="KaisouMail architecture">
</picture>

- Inbound email flows through Email Routing into the Email Worker.
- The Email Worker persists metadata in D1 Metadata, stores message bodies in R2 Message Storage, and can call Workers AI when verification-code extraction needs model help.
- Operators use the React Control Plane through a same-origin Pages Proxy.
- The Pages Proxy forwards `/api` traffic to the API Worker, which reads and mutates the same D1/R2-backed project state.

## Docs & Deployment

- [Quick Start](https://ivanli-cn.github.io/KaisouMail/quick-start)
- [Deployment & Environment](https://ivanli-cn.github.io/KaisouMail/deployment-environment)
- [Cloudflare Token Permissions](https://ivanli-cn.github.io/KaisouMail/cloudflare-token-permissions)
- [Domain Onboarding](https://ivanli-cn.github.io/KaisouMail/domain-onboarding)
- [API Reference](https://ivanli-cn.github.io/KaisouMail/api-reference)
- [Storybook Preview](https://ivanli-cn.github.io/KaisouMail/storybook.html)

## Poster

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="./apps/web/brand/generated/social/poster-4x5.png">
  <img src="./apps/web/brand/generated/social/poster-4x5-light.png" alt="KaisouMail poster" width="480" />
</picture>

## Contributing

See [CONTRIBUTING.md](./CONTRIBUTING.md).

- Small fixes and documentation updates can go straight to a pull request.
- Significant features, architecture changes, or breaking changes should start with an Issue.

## Security

See [SECURITY.md](./SECURITY.md). Report vulnerabilities privately through [GitHub Security Advisories](https://github.com/IvanLi-CN/KaisouMail/security/advisories/new).

## License

[MIT](./LICENSE)
