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

const versionInfo = {
  version: pkg.version,
  commitSha: safe("git rev-parse --short HEAD", "dev"),
  branch: safe("git branch --show-current", "detached"),
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
