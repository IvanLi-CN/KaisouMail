# ADR 0002: Oidrune Release Notification Boundary

## Status

Accepted

## Context

KaisouMail needs release failure and manual smoke notifications without making
the repository responsible for Telegram transport credentials. The notifier is
an external release-infrastructure boundary: it must authenticate with the
default Oidrune gateway, preserve complete KaisouMail release metadata, and
remain auditable when the shared workflow changes.

## Decision

- Use `IvanLi-CN/oidrune/.github/workflows/notify.yml` as the notification
  boundary, pinned to a trusted full release commit rather than a floating ref.
- Authenticate through the caller's GitHub OIDC token permission
  (`id-token: write`) and use Oidrune's default gateway and audience. Callers
  must not pass gateway overrides or the retired Telegram secret.
- Require callers to construct the complete notification summary, including
  the project, outcome, target SHA, run URL, and workflow-specific title, so
  Oidrune does not need to infer repository metadata.

## Consequences

- Release notification transport no longer depends on a repository Telegram
  secret, but each caller must carry the OIDC permission and summary contract.
- The immutable workflow pin provides a reviewable trust anchor and requires an
  explicit migration when a newer trusted Oidrune release is adopted.
- The caller retains ownership of release-specific target-SHA resolution and
  metadata, while Oidrune owns only the authenticated handoff.
