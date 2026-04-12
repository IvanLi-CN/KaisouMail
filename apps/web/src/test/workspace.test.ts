import { describe, expect, it } from "vitest";
import {
  resolveAutoRefreshInterval as resolveRefreshInterval,
  resolveNextSelectedMessageId as resolveSelectedMessageId,
} from "@/lib/message-refresh";
import {
  buildWorkspaceSearch,
  filterMailboxes,
  sortMailboxes,
} from "@/lib/workspace";
import { demoMailboxes, demoMessages } from "@/mocks/data";

describe("workspace helpers", () => {
  it("sorts mailboxes by recent receive time with nulls last", () => {
    const sorted = sortMailboxes(demoMailboxes, "recent");

    expect(sorted.map((mailbox) => mailbox.id)).toEqual([
      "mbx_catch_all",
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

  it("keeps the selected message when it still exists after refresh", () => {
    expect(resolveSelectedMessageId(demoMessages, "msg_beta")).toBe("msg_beta");
  });

  it("falls back to the newest message when the old selection disappears", () => {
    expect(resolveSelectedMessageId(demoMessages, "msg_missing")).toBe(
      "msg_alpha",
    );
  });

  it("disables polling when the page is hidden or offline", () => {
    expect(
      resolveRefreshInterval({
        requestedIntervalMs: 15_000,
        isDocumentVisible: false,
        isOnline: true,
      }),
    ).toBe(false);
    expect(
      resolveRefreshInterval({
        requestedIntervalMs: 15_000,
        isDocumentVisible: true,
        isOnline: false,
      }),
    ).toBe(false);
  });

  it("keeps polling active only when the page is visible and online", () => {
    expect(
      resolveRefreshInterval({
        requestedIntervalMs: 15_000,
        isDocumentVisible: true,
        isOnline: true,
      }),
    ).toBe(15_000);
  });
});
