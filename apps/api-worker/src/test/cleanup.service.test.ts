import { beforeEach, describe, expect, it, vi } from "vitest";

const { parseRuntimeConfig } = vi.hoisted(() => ({
  parseRuntimeConfig: vi.fn(),
}));
const {
  autorepairStaleDestroyingMailboxes,
  destroyMailbox,
  listMailboxIdsPendingCleanup,
} = vi.hoisted(() => ({
  autorepairStaleDestroyingMailboxes: vi.fn(),
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
  autorepairStaleDestroyingMailboxes,
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
    MAILBOX_CLEANUP_AUTOREPAIR_MIN_AGE_MINUTES: 120,
    MAILBOX_CLEANUP_REPAIR_BATCH_SIZE: 100,
    SUBDOMAIN_CLEANUP_BATCH_SIZE: 1,
  } as never;

  beforeEach(() => {
    vi.clearAllMocks();
    parseRuntimeConfig.mockReturnValue(config);
    autorepairStaleDestroyingMailboxes.mockResolvedValue(0);
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
    expect(autorepairStaleDestroyingMailboxes).toHaveBeenCalledWith(
      {} as never,
      config,
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

  it("runs message verification backfill after mailbox cleanup", async () => {
    listMailboxIdsPendingCleanup.mockResolvedValue(["mbx_expired"]);
    destroyMailbox.mockResolvedValue(undefined);
    const callOrder: string[] = [];

    destroyMailbox.mockImplementationOnce(async () => {
      callOrder.push("mailbox");
    });
    backfillMessageVerification.mockImplementationOnce(async () => {
      callOrder.push("backfill");
      return 0;
    });

    await expect(runMailboxCleanup({} as never)).resolves.toBe(1);

    expect(callOrder).toEqual(["mailbox", "backfill"]);
  });

  it("includes autorepaired stale destroying mailboxes in the cleanup count", async () => {
    autorepairStaleDestroyingMailboxes.mockResolvedValue(2);
    listMailboxIdsPendingCleanup.mockResolvedValue(["mbx_expired"]);
    destroyMailbox.mockResolvedValue(undefined);

    await expect(runMailboxCleanup({} as never)).resolves.toBe(3);
  });

  it("still runs message verification backfill when mailbox cleanup has nothing to do", async () => {
    listMailboxIdsPendingCleanup.mockResolvedValue([]);

    await expect(runMailboxCleanup({} as never)).resolves.toBe(0);

    expect(backfillMessageVerification).toHaveBeenCalledWith(
      {} as never,
      config,
    );
  });
});
