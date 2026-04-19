import { beforeEach, describe, expect, it, vi } from "vitest";

const { parseRuntimeConfig } = vi.hoisted(() => ({
  parseRuntimeConfig: vi.fn(),
}));
const { destroyMailbox, listMailboxIdsPendingCleanup } = vi.hoisted(() => ({
  destroyMailbox: vi.fn(),
  listMailboxIdsPendingCleanup: vi.fn(),
}));
const { backfillMessageVerification } = vi.hoisted(() => ({
  backfillMessageVerification: vi.fn(),
}));
const { runSubdomainCleanup } = vi.hoisted(() => ({
  runSubdomainCleanup: vi.fn(),
}));

vi.mock("../env", () => ({
  parseRuntimeConfig,
}));

vi.mock("../services/mailboxes", () => ({
  destroyMailbox,
  listMailboxIdsPendingCleanup,
}));

vi.mock("../services/message-verification", () => ({
  backfillMessageVerification,
}));

vi.mock("../services/subdomain-cleanup", () => ({
  runSubdomainCleanup,
}));

import { runMailboxCleanup } from "../services/cleanup";

describe("cleanup runner", () => {
  const config = {
    CLEANUP_BATCH_SIZE: 3,
    SUBDOMAIN_CLEANUP_BATCH_SIZE: 1,
    SUBDOMAIN_CLEANUP_REQUEST_BUDGET: 400,
  } as never;

  beforeEach(() => {
    vi.clearAllMocks();
    parseRuntimeConfig.mockReturnValue(config);
    backfillMessageVerification.mockResolvedValue(0);
    runSubdomainCleanup.mockResolvedValue(0);
  });

  it("continues later cleanup retries even when an earlier mailbox fails", async () => {
    listMailboxIdsPendingCleanup.mockResolvedValue([
      "mbx_active_fail",
      "mbx_destroying_retry",
    ]);
    destroyMailbox.mockRejectedValueOnce(new Error("active cleanup failed"));
    destroyMailbox.mockResolvedValueOnce(undefined);

    await expect(runMailboxCleanup({} as never)).rejects.toThrow(
      "Mailbox cleanup failed for 1 mailbox(es): mbx_active_fail",
    );

    expect(destroyMailbox).toHaveBeenNthCalledWith(
      1,
      {} as never,
      config,
      "mbx_active_fail",
    );
    expect(destroyMailbox).toHaveBeenNthCalledWith(
      2,
      {} as never,
      config,
      "mbx_destroying_retry",
    );
    expect(backfillMessageVerification).toHaveBeenCalledWith(
      {} as never,
      config,
    );
  });

  it("runs subdomain cleanup after mailbox cleanup and before message verification backfill", async () => {
    listMailboxIdsPendingCleanup.mockResolvedValue(["mbx_expired"]);
    destroyMailbox.mockResolvedValue(undefined);
    const callOrder: string[] = [];

    destroyMailbox.mockImplementationOnce(async () => {
      callOrder.push("mailbox");
    });
    runSubdomainCleanup.mockImplementationOnce(async () => {
      callOrder.push("subdomain");
      return 0;
    });
    backfillMessageVerification.mockImplementationOnce(async () => {
      callOrder.push("backfill");
      return 0;
    });

    await expect(runMailboxCleanup({} as never)).resolves.toBe(1);

    expect(callOrder).toEqual(["mailbox", "subdomain", "backfill"]);
    expect(runSubdomainCleanup).toHaveBeenCalledWith({} as never, config);
  });

  it("still runs message verification backfill when subdomain cleanup hits Cloudflare cooldown", async () => {
    listMailboxIdsPendingCleanup.mockResolvedValue([]);
    runSubdomainCleanup.mockRejectedValueOnce(
      new Error("Cloudflare API rate limit reached; retry later"),
    );

    await expect(runMailboxCleanup({} as never)).rejects.toThrow(
      "Cloudflare API rate limit reached; retry later",
    );

    expect(backfillMessageVerification).toHaveBeenCalledWith(
      {} as never,
      config,
    );
  });
});
