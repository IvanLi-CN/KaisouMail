# 0002 Release failure Telegram alerts History

## 2026-09-01

- Migrated failure and manual smoke notifications from the floating `IvanLi-CN/github-workflows` Telegram reusable workflow to the trusted Oidrune `notify.yml` release commit `e48822f99c6402a753ed86557ea029754cbab20b`.
- Replaced secret-based Telegram forwarding with caller-owned OIDC summaries and `id-token: write` permissions, while retaining the existing Release filters, failure gating, manual smoke path, and target-SHA log resolution.
- Recorded the Oidrune OIDC notification boundary and immutable workflow pin in ADR 0002.
- Added workflow contract coverage to PR and main CI.
