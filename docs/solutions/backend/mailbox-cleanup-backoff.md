# Mailbox Cleanup Backoff

Status: active

## Problem

Mailbox cleanup can involve Cloudflare Email Routing, R2 object deletion, and D1 row cleanup. If the oldest `destroying` mailbox fails every scheduled pass, a strict oldest-first selector can repeatedly pick the same failed row and starve later rows.

## Pattern

- Persist cleanup state on the row being retried: `cleanup_next_attempt_at` for backoff and `cleanup_last_error` for operator diagnosis.
- Select only `destroying` rows whose backoff is empty or due, then continue mixing them with expired cleanup work so one failed row cannot block the queue.
- Keep destructive cleanup idempotent: message metadata remains until R2 deletes succeed, and the row is marked `destroyed` only after dependent rows have been removed.
- Autorepair only a narrow safe subset: stale `destroying` rows with no routing rule and no messages can be marked `destroyed` locally because there is no external route or stored mail payload left to clean.

## Guardrails

- Never autorepair rows that still have `routing_rule_id` or any `messages` row.
- Keep autorepair age and batch size behind runtime config so production can slow or disable it without a code rollback.
- Log retry scheduling and autorepair counts as operational events.
