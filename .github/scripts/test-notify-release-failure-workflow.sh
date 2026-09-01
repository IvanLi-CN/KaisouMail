#!/usr/bin/env bash
set -euo pipefail

ruby -ryaml <<'RUBY'
def assert(condition, message)
  raise message unless condition
end

workflow_path = ".github/workflows/notify-release-failure.yml"
workflow_text = File.read(workflow_path, encoding: "UTF-8")
workflow = YAML.safe_load(workflow_text, aliases: false)
triggers = workflow["on"] || workflow[true]
jobs = workflow["jobs"]

assert(
  triggers["workflow_run"] == {
    "workflows" => ["Release"],
    "types" => ["completed"],
    "branches" => ["main"]
  },
  "workflow_run trigger changed: #{triggers.inspect}"
)
assert(triggers["workflow_dispatch"].nil?, "workflow_dispatch must have no inputs")
assert(workflow["permissions"] == {}, "top-level permissions must remain empty")

trusted_uses = "IvanLi-CN/oidrune/.github/workflows/notify.yml@e48822f99c6402a753ed86557ea029754cbab20b"
assert(workflow_text.scan(trusted_uses).length == 2, "trusted Oidrune reference must be used twice")
assert(!workflow_text.include?("IvanLi-CN/github-workflows/.github/workflows/release-failure-telegram.yml"), "legacy workflow reference remains")
assert(!workflow_text.include?("@main"), "floating @main reference remains")
assert(!workflow_text.include?("SHOUTRRR_URL"), "legacy Telegram secret remains")
assert(!workflow_text.include?("gateway_url"), "gateway_url override remains")
assert(!workflow_text.include?("oidc_audience"), "oidc_audience override remains")

failure = jobs["notify_failure"]
assert(failure["if"] == "${{ github.event_name == 'workflow_run' && github.event.workflow_run.conclusion == 'failure' }}", "failure condition changed")
assert(failure["permissions"] == {"id-token" => "write"}, "failure job must grant id-token write")
assert(failure["uses"] == trusted_uses, "failure job target changed")
assert(failure["needs"] == ["resolve_release_context"], "failure job must use the resolver output")
assert(!failure.key?("secrets"), "failure job must not pass secrets")
assert(failure["with"].keys.sort == ["outcome", "summary"], "failure inputs must match Oidrune contract")
assert(failure["with"]["outcome"] == "${{ github.event.workflow_run.conclusion }}", "failure outcome changed")
["Title:", "Project:", "Status:", "Target SHA:", "Run URL:", "Workflow:", "Event:", "Attempt:", "Actor:", "Ref:", "Details:"].each do |label|
  assert(failure["with"]["summary"].include?(label), "failure summary lacks #{label}")
end

smoke = jobs["smoke_test"]
assert(smoke["if"] == "${{ github.event_name == 'workflow_dispatch' }}", "smoke condition changed")
assert(smoke["permissions"] == {"id-token" => "write"}, "smoke job must grant id-token write")
assert(smoke["uses"] == trusted_uses, "smoke job target changed")
assert(!smoke.key?("secrets"), "smoke job must not pass secrets")
assert(smoke["with"].keys.sort == ["outcome", "summary"], "smoke inputs must match Oidrune contract")
assert(smoke["with"]["outcome"] == "failure", "smoke outcome changed")
["Title:", "Project:", "Result:", "Target SHA:", "Run URL:", "Workflow:", "Event:", "Attempt:", "Actor:", "Ref:", "Details:"].each do |label|
  assert(smoke["with"]["summary"].include?(label), "smoke summary lacks #{label}")
end

assert(jobs["resolve_release_context"]["permissions"] == {"actions" => "read"}, "resolver permissions changed")
assert(workflow_text.include?("Release Meta"), "Release Meta log resolution is missing")
assert(workflow_text.include?("Release Publish"), "Release Publish log resolution is missing")
assert(workflow_text.include?("RELEASE_REQUESTED_SHA"), "requested release target observation is missing")
assert(workflow_text.include?("RELEASE_TARGET_SHA"), "Release target observation is missing")
assert(workflow_text.include?("target sha resolution used workflow_run head sha"), "fallback resolution details are missing")
puts "notify release failure workflow contract tests passed"
RUBY
