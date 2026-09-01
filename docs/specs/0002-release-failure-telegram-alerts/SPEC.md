# Release Failure Telegram Alerts

## Context and Scope

KaisouMail owns a repository-local wrapper workflow for release failure notifications. The wrapper observes the existing `Release` workflow, resolves the actual release target commit when a pending release snapshot differs from the triggering commit, and hands a complete notification summary to the Oidrune reusable workflow.

This topic covers `.github/workflows/notify-release-failure.yml`, the read-only release target observation in `.github/workflows/release.yml`, and the workflow contract tests. It does not change release publication, release ordering, trigger scope, Oidrune gateway configuration, or any external gateway/control-plane configuration.

## Requirements

- `REQ-TRIGGER`: The wrapper MUST listen only for `Release` `workflow_run` completions on `main`, send a failure notification only when the conclusion is `failure`, and retain a no-input `workflow_dispatch` smoke path.
- `REQ-TARGET`: Both wrapper notification jobs MUST call `IvanLi-CN/oidrune/.github/workflows/notify.yml@e48822f99c6402a753ed86557ea029754cbab20b` using the Oidrune `outcome` and `summary` inputs. Floating refs and the legacy `IvanLi-CN/github-workflows` Telegram workflow MUST NOT be used.
- `REQ-SHA`: A failed `Release` run MUST prefer a 40-character target SHA found in the `Release Meta` or `Release Publish` job logs, and MUST fall back to `workflow_run.head_sha` when no target SHA can be resolved.
- `REQ-OIDC`: Each wrapper notification job MUST grant the caller `id-token: write`, MUST omit `gateway_url` and `oidc_audience`, and MUST NOT pass the retired `SHOUTRRR_URL` secret or legacy Telegram inputs.
- `REQ-SUMMARY`: The caller MUST fully generate the notification summary. The failure summary MUST include a failure title, project, status, target SHA, run URL, workflow, event, attempt, actor, ref, and resolution details. The smoke summary MUST include a smoke title, project, result, target SHA, run URL, workflow, event, attempt, actor, ref, and smoke details.
- `REQ-RELEASE-INVARIANT`: Release target observation MUST remain read-only and MUST NOT change release publication behavior, ordering, or side effects.

## Verification

- `VER-WORKFLOW-CONTRACT`: `.github/scripts/test-notify-release-failure-workflow.sh` parses the wrapper workflow and checks the trigger filter, failure/smoke conditions, exact trusted Oidrune SHA, Oidrune input shape, caller permissions, summary fields, removal of legacy targets/secrets/overrides, and release-log observability; covers: REQ-TRIGGER, REQ-TARGET, REQ-OIDC, REQ-SUMMARY, REQ-SHA.
- `VER-ACTIONLINT`: `actionlint` MUST pass for the wrapper, Release, PR CI, and main CI workflows; covers: REQ-TRIGGER, REQ-TARGET, REQ-OIDC, REQ-SUMMARY, REQ-RELEASE-INVARIANT.
- `VER-SPEC-CONTRACT`: The canonical topic Spec contract check MUST pass, including stable requirement and verification identifiers and this traceability map; covers: REQ-TRIGGER, REQ-TARGET, REQ-SHA, REQ-OIDC, REQ-SUMMARY, REQ-RELEASE-INVARIANT.
- `VER-RELEASE-DIFF`: The migration diff MUST leave the Release workflow's target-SHA logging and publication steps unchanged except for required read-only observability coverage; covers: REQ-SHA, REQ-RELEASE-INVARIANT.

## Related ADRs

- [ADR 0002: Oidrune Release Notification Boundary](../../adr/0002-oidrune-release-notification-boundary.md)
