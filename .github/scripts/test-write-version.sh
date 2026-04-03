#!/usr/bin/env bash
set -euo pipefail

node <<'NODE'
const assert = require("node:assert/strict");
const { execFileSync } = require("node:child_process");
const { mkdtempSync, mkdirSync, readFileSync, writeFileSync, copyFileSync } = require("node:fs");
const { tmpdir } = require("node:os");
const { join } = require("node:path");

const repoRoot = process.cwd();
const tempRoot = mkdtempSync(join(tmpdir(), "cf-mail-write-version-"));
mkdirSync(join(tempRoot, "scripts"), { recursive: true });
mkdirSync(join(tempRoot, "packages/shared/src"), { recursive: true });
copyFileSync(
  join(repoRoot, "scripts/write-version.mjs"),
  join(tempRoot, "scripts/write-version.mjs"),
);

writeFileSync(
  join(tempRoot, "package.json"),
  JSON.stringify({ name: "cf-mail", version: "0.1.0", private: true, type: "module" }, null, 2),
);

const run = (cmd, args, env = process.env) =>
  execFileSync(cmd, args, {
    cwd: tempRoot,
    env,
    stdio: ["ignore", "pipe", "pipe"],
  })
    .toString()
    .trim();

run("git", ["init", "-b", "main"]);
run("git", ["config", "user.name", "Test Bot"]);
run("git", ["config", "user.email", "test@example.com"]);
run("git", ["add", "."]);
run("git", ["commit", "-m", "init"]);
run("git", ["tag", "v0.3.0"]);

run("node", ["scripts/write-version.mjs"]);
let generated = readFileSync(join(tempRoot, "packages/shared/src/version.generated.ts"), "utf8");
assert.match(generated, /version: "0\.3\.0"/);

const overrideEnv = {
  ...process.env,
  CF_MAIL_RELEASE_VERSION: "0.3.1",
  CF_MAIL_RELEASE_SHA: "abc1234",
  CF_MAIL_RELEASE_BRANCH: "main",
};
run("node", ["scripts/write-version.mjs"], overrideEnv);
generated = readFileSync(join(tempRoot, "packages/shared/src/version.generated.ts"), "utf8");
assert.match(generated, /version: "0\.3\.1"/);
assert.match(generated, /commitSha: "abc1234"/);
assert.match(generated, /branch: "main"/);

console.log("write-version tests passed");
NODE
