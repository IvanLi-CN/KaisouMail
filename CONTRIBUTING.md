# Contributing

Thanks for contributing to KaisouMail.

## Before you start

- If your change is small and low-risk, such as a typo fix, copy update, link fix, or another narrow documentation adjustment, you can open a pull request directly.
- If your change adds a significant feature, changes architecture, or introduces a breaking change, open an Issue first so scope and acceptance stay clear.

## Repository setup

```bash
bun install
bun run version:write
```

Use the public docs for environment-specific setup:

- [Quick Start](https://ivanli-cn.github.io/KaisouMail/quick-start)
- [Deployment & Environment](https://ivanli-cn.github.io/KaisouMail/deployment-environment)

## Validation

Run the checks that match your change before opening or updating a pull request.

```bash
bun run check
bun run build-docs-site
VITE_DEMO_MODE=true bun run --cwd apps/web build
```

If you touch runtime logic, API behavior, or application code, run additional targeted tests as needed.

## Commit messages

- Use English Conventional Commits.
- Sign every commit with `git commit -s`.
- Do not bypass local hooks.

Examples:

- `docs(readme): refresh open source entry points`
- `fix(api-worker): keep domain catalog state consistent`

## Pull requests

- Keep pull requests focused.
- Explain the user-facing or operator-facing impact.
- Update related documentation in the same pull request when project behavior, setup, or navigation changes.
- Keep `README.md` and `README.zh-CN.md` structurally aligned when changing top-level project navigation or entry-point messaging.

## Security

Do not disclose vulnerabilities in public Issues. Use [GitHub Security Advisories](https://github.com/IvanLi-CN/KaisouMail/security/advisories/new) for private reports.
