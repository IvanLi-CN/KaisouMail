# 0002 Release failure Telegram alerts Implementation

- The latest trusted Oidrune release was verified as `v0.1.14`, a non-draft, non-prerelease release at commit `e48822f99c6402a753ed86557ea029754cbab20b`.
- `notify-release-failure.yml` keeps the `Release` `workflow_run` failure filter and no-input `workflow_dispatch` smoke path.
- Both notification jobs call `IvanLi-CN/oidrune/.github/workflows/notify.yml` at trusted release commit `e48822f99c6402a753ed86557ea029754cbab20b`.
- ADR 0002 records the Oidrune OIDC notification boundary, caller-owned metadata, and immutable workflow pin.
- Caller jobs grant `id-token: write`, omit gateway overrides, and no longer forward `SHOUTRRR_URL` or any legacy Telegram inputs.
- The caller builds complete failure/smoke summaries with project, result metadata, target SHA, run URL, title, workflow, event, attempt, actor, ref, and details.
- `.github/scripts/test-notify-release-failure-workflow.sh` covers the workflow contract and runs in both PR and main CI lint jobs.
- Local validation includes the workflow contract test, `actionlint`, Spec contract validation, Spec drift validation, repository checks, type checking, unit tests, and builds. No real `workflow_dispatch` smoke notification is sent.
