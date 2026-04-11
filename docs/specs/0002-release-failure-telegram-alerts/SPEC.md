# 0002 Release failure Telegram alerts

## Status
已完成

## Objective
为 `KaisouMail` 增加一个仓库内的发布失败通知 wrapper workflow，复用共享的 `IvanLi-CN/github-workflows` Telegram 告警流程，并在失败告警中解析真实发布目标 SHA。

## Scope
- 新增 `.github/workflows/notify-release-failure.yml`
- 复用共享 reusable workflow 发送 Telegram 消息
- 将仓库上下文与 `SHOUTRRR_URL` secret 显式传给共享 workflow
- 保留 `workflow_dispatch` 手动 smoke test 入口
- 在 `workflow_run` 失败路径中从失败的 `Release` run 日志解析实际目标 SHA，而不是盲用 `workflow_run.head_sha`
- 为 `Release` workflow 增加只读观测日志，显式打印 requested/target SHA 供 notifier 解析

## Requirements
### Functional requirements
1. wrapper workflow 监听 `Release` workflow 的 `completed` 事件，并仅在 `conclusion == failure` 时发送失败告警。
2. wrapper workflow 提供一个无输入的 `workflow_dispatch` 入口，用于手动 smoke test。
3. 失败告警必须显式透传仓库名、工作流名、结论、运行链接、事件名、actor 与 `SHOUTRRR_URL`。
4. 当 `Release` run 失败时，wrapper 必须优先从该 run 的 `Release Meta` / `Release Publish` job 日志中解析真实 `target_sha`；若无法解析，再安全回退到 `workflow_run.head_sha`。

### Operational constraints
1. 发送逻辑继续复用 `IvanLi-CN/github-workflows/.github/workflows/release-failure-telegram.yml@main`。
2. `SHOUTRRR_URL` 继续作为唯一 repo secret。
3. 允许为了失败告警可观测性增加只读日志输出，但不得改变发布行为、发布顺序或 side effects。

## Acceptance criteria
1. `Release` workflow 失败时，`notify-release-failure.yml` 会通过 `workflow_run` 触发 Telegram 告警。
2. `workflow_dispatch` smoke test 可以安全发送一条测试通知，而不会触发真实发布。
3. 对于 manual backfill / pending snapshot 这类 `workflow_run.head_sha` 可能不等于最终发布目标的场景，失败告警中的 `sha` 字段优先显示从失败 run 日志解析到的真实目标 SHA。
