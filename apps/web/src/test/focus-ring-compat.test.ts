import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

describe("focus ring compatibility styles", () => {
  it("defines custom ring color shims for shared token-based utilities", () => {
    const css = readFileSync(
      path.resolve(process.cwd(), "src/index.css"),
      "utf8",
    );

    expect(css).toContain(".focus\\:ring-primary\\/20:focus");
    expect(css).toContain(".focus-visible\\:ring-ring:focus-visible");
    expect(css).toContain(".ring-offset-background");
    expect(css).toContain("--tw-ring-color: hsl(var(--primary) / 0.2);");
    expect(css).toContain("--tw-ring-color: hsl(var(--ring) / 0.34);");
    expect(css).toContain("--tw-ring-offset-color: hsl(var(--background));");
  });
});
