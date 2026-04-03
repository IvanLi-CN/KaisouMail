import { execSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");
const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));

const safe = (command, fallback) => {
  try {
    return (
      execSync(command, { cwd: root, stdio: ["ignore", "pipe", "ignore"] })
        .toString()
        .trim() || fallback
    );
  } catch {
    return fallback;
  }
};

const firstNonEmpty = (...values) => {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
  }
  return "";
};

const exactReleaseTag = safe(
  "git tag --points-at HEAD --list 'v*' | sort -V | tail -n 1",
  "",
);
const exactReleaseVersion = exactReleaseTag.startsWith("v")
  ? exactReleaseTag.slice(1)
  : "";
const releaseBranch = firstNonEmpty(
  process.env.CF_MAIL_RELEASE_BRANCH,
  safe("git branch --show-current", ""),
  safe("git rev-parse --abbrev-ref HEAD", ""),
  "detached",
);

const versionInfo = {
  version: firstNonEmpty(
    process.env.CF_MAIL_RELEASE_VERSION,
    exactReleaseVersion,
    pkg.version,
  ),
  commitSha: firstNonEmpty(
    process.env.CF_MAIL_RELEASE_SHA,
    safe("git rev-parse --short HEAD", "dev"),
  ),
  branch: releaseBranch,
  builtAt: new Date().toISOString(),
};

const target = join(root, "packages/shared/src/version.generated.ts");
mkdirSync(dirname(target), { recursive: true });
const serialized = `export const versionInfo = {
  version: ${JSON.stringify(versionInfo.version)},
  commitSha: ${JSON.stringify(versionInfo.commitSha)},
  branch: ${JSON.stringify(versionInfo.branch)},
  builtAt: ${JSON.stringify(versionInfo.builtAt)},
} as const;
`;

writeFileSync(target, serialized, "utf8");
