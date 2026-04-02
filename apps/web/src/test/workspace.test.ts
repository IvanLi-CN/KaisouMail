import { describe, expect, it } from "vitest";
import {
  buildWorkspaceSearch,
  filterMailboxes,
  sortMailboxes,
} from "@/lib/workspace";
import { demoMailboxes } from "@/mocks/data";

describe("workspace helpers", () => {
  it("sorts mailboxes by recent receive time with nulls last", () => {
    const sorted = sortMailboxes(demoMailboxes, "recent");

    expect(sorted.map((mailbox) => mailbox.id)).toEqual([
      "mbx_beta",
      "mbx_alpha",
      "mbx_gamma",
    ]);
  });

  it("filters mailboxes by address text", () => {
    const filtered = filterMailboxes(demoMailboxes, "ops.beta");

    expect(filtered).toHaveLength(1);
    expect(filtered[0]?.id).toBe("mbx_beta");
  });

  it("builds stable workspace query strings", () => {
    expect(
      buildWorkspaceSearch({
        mailbox: "mbx_beta",
        message: "msg_beta",
        sort: "recent",
        q: "spec",
      }),
    ).toBe("?mailbox=mbx_beta&sort=recent&q=spec&message=msg_beta");
  });
});
