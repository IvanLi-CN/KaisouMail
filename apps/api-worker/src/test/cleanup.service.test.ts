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

import { runMailboxCleanup } from "../services/cleanup";

describe("cleanup runner", () => {
  const config = {
    CLEANUP_BATCH_SIZE: 3,
  } as never;

  beforeEach(() => {
    vi.clearAllMocks();
    parseRuntimeConfig.mockReturnValue(config);
    backfillMessageVerification.mockResolvedValue(0);
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
});
