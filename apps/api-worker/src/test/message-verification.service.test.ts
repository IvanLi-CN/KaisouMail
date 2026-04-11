import { beforeEach, describe, expect, it, vi } from "vitest";

const { getDb } = vi.hoisted(() => ({
  getDb: vi.fn(),
}));
const { getRuntimeStateValue, setRuntimeStateValue } = vi.hoisted(() => ({
  getRuntimeStateValue: vi.fn(),
  setRuntimeStateValue: vi.fn(),
}));

vi.mock("../db/client", () => ({
  getDb,
}));

vi.mock("../services/runtime-state", () => ({
  getRuntimeStateValue,
  setRuntimeStateValue,
}));

import {
  backfillMessageVerification,
  detectVerificationForMessage,
  listMessageIdsPendingVerification,
  resolveVerificationDetectionForMessage,
} from "../services/message-verification";

describe("message verification service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getRuntimeStateValue.mockResolvedValue(null);
    setRuntimeStateValue.mockResolvedValue(undefined);
  });

  it("prefers a subject match over body matches", async () => {
    const verification = await detectVerificationForMessage({} as never, {
      subject: "Your verification code is 842911",
      text: "Fallback body code 551177",
      html: null,
    });

    expect(verification).toEqual({
      code: "842911",
      source: "subject",
      method: "rules",
    });
  });

  it("falls back to body text when the subject has no usable code", async () => {
    const verification = await detectVerificationForMessage({} as never, {
      subject: "Build 551177 ready",
      text: "Use verification code 551177 to unlock the preview URL.",
      html: null,
    });

    expect(verification).toEqual({
      code: "551177",
      source: "body",
      method: "rules",
    });
  });

  it("falls back to stripped HTML when the text part has no usable code", async () => {
    const verification = await detectVerificationForMessage({} as never, {
      subject: "Build artifacts ready",
      text: "Open the branded email to continue.",
      html: "<p>Use verification code <strong>662288</strong> to continue.</p>",
    });

    expect(verification).toEqual({
      code: "662288",
      source: "body",
      method: "rules",
    });
  });

  it("preserves the original casing for alphanumeric verification codes", async () => {
    const verification = await detectVerificationForMessage({} as never, {
      subject: "Your verification code is ab12Cd",
      text: null,
      html: null,
    });

    expect(verification).toEqual({
      code: "ab12Cd",
      source: "subject",
      method: "rules",
    });
  });

  it("does not truncate longer identifiers into direct verification matches", async () => {
    const verification = await detectVerificationForMessage({} as never, {
      subject: "Your verification code is AB1234567",
      text: null,
      html: null,
    });

    expect(verification).toBeNull();
  });

  it("ignores generic code-review subjects that only contain build numbers", async () => {
    const verification = await detectVerificationForMessage({} as never, {
      subject: "Code review for build 123456",
      text: null,
      html: null,
    });

    expect(verification).toBeNull();
  });

  it("uses Workers AI as a fallback for ambiguous candidates", async () => {
    const run = vi.fn().mockResolvedValue({
      response: '{"verdict":"match","code":"662288","source":"body"}',
    });

    const verification = await detectVerificationForMessage(
      {
        AI: { run },
      } as never,
      {
        subject: "Verification request",
        text: "Your verification codes are 551177 and 662288. Use the latest one to continue.",
        html: null,
      },
    );

    expect(run).toHaveBeenCalledTimes(1);
    expect(verification).toEqual({
      code: "662288",
      source: "body",
      method: "ai",
    });
  });

  it("maps AI matches back to the original source casing", async () => {
    const run = vi.fn().mockResolvedValue({
      response: '{"verdict":"match","code":"AB12CD","source":"body"}',
    });

    const verification = await detectVerificationForMessage(
      {
        AI: { run },
      } as never,
      {
        subject: "Verification request",
        text: "Your verification codes are ab12Cd and z9y8x7. Use the latest one to continue.",
        html: null,
      },
    );

    expect(verification).toEqual({
      code: "ab12Cd",
      source: "body",
      method: "ai",
    });
  });

  it("keeps the relevant verification line in the AI body snippet for long emails", async () => {
    const run = vi.fn().mockResolvedValue({
      response: '{"verdict":"match","code":"662288","source":"body"}',
    });
    const longBody = [
      ...Array.from({ length: 40 }, () => "This is boilerplate legal text."),
      "Your verification codes are 551177 and 662288. Use the latest one to continue.",
    ].join("\n");

    const verification = await detectVerificationForMessage(
      {
        AI: { run },
      } as never,
      {
        subject: "Verification request",
        text: longBody,
        html: null,
      },
    );

    expect(run).toHaveBeenCalledTimes(1);
    expect(
      (
        run.mock.calls[0]?.[1] as {
          messages: Array<{ content: string }>;
        }
      ).messages[1]?.content,
    ).toContain("Your verification codes are 551177 and 662288.");
    expect(verification).toEqual({
      code: "662288",
      source: "body",
      method: "ai",
    });
  });

  it("pauses Workers AI until reset when the free tier quota is exhausted", async () => {
    const run = vi
      .fn()
      .mockRejectedValue(
        Object.assign(
          new Error(
            "Workers AI error 3036: daily free allocation of 10,000 neurons exhausted",
          ),
          { status: 429 },
        ),
      );

    const verification = await detectVerificationForMessage(
      {
        AI: { run },
      } as never,
      {
        subject: "Verification request",
        text: "Your verification codes are 551177 and 662288. Use the latest one to continue.",
        html: null,
      },
    );

    expect(verification).toBeNull();
    expect(setRuntimeStateValue).toHaveBeenCalledWith(
      { AI: { run } },
      "workers_ai_verification_paused_until",
      expect.stringMatching(/T00:00:00\.000Z$/),
    );
  });

  it("marks plain non-verification messages as checked without retry", async () => {
    const detection = await resolveVerificationDetectionForMessage(
      {} as never,
      {
        subject: "Spec review notes",
        text: "There are two action items and one blocker around API scopes.",
        html: null,
      },
    );

    expect(detection).toEqual({
      verification: null,
      shouldRetry: false,
      retryAfter: null,
    });
  });

  it("does not treat promotional use-code emails as verification messages", async () => {
    const detection = await resolveVerificationDetectionForMessage(
      {} as never,
      {
        subject: "Weekend sale",
        text: "Use code 123456 to save 20% on your next order.",
        html: null,
      },
    );

    expect(detection).toEqual({
      verification: null,
      shouldRetry: false,
      retryAfter: null,
    });
  });

  it("keeps ambiguous messages retryable while Workers AI is paused", async () => {
    getRuntimeStateValue.mockResolvedValue("2099-01-01T00:00:00.000Z");

    const detection = await resolveVerificationDetectionForMessage(
      {
        AI: { run: vi.fn() },
      } as never,
      {
        subject: "Verification request",
        text: "Your verification codes are 551177 and 662288. Use the latest one to continue.",
        html: null,
      },
    );

    expect(detection).toEqual({
      verification: null,
      shouldRetry: true,
      retryAfter: "2099-01-01T00:00:00.000Z",
    });
  });

  it("keeps ambiguous messages retryable when the AI binding is unavailable", async () => {
    const detection = await resolveVerificationDetectionForMessage(
      {} as never,
      {
        subject: "Verification request",
        text: "Your verification codes are 551177 and 662288. Use the latest one to continue.",
        html: null,
      },
    );

    expect(detection.verification).toBeNull();
    expect(detection.shouldRetry).toBe(true);
    expect(detection.retryAfter).toEqual(expect.any(String));
  });

  it("backfills verification metadata for unchecked messages", async () => {
    const updates: Array<Record<string, unknown>> = [];
    const select = vi.fn((fields?: Record<string, unknown>) => {
      if (fields && Object.keys(fields).length === 1 && "id" in fields) {
        return {
          from: vi.fn(() => ({
            where: vi.fn(() => ({
              orderBy: vi.fn(() => ({
                limit: vi.fn(async () => [{ id: "msg_verify" }]),
              })),
            })),
          })),
        };
      }

      return {
        from: vi.fn(() => ({
          where: vi.fn(() => ({
            limit: vi.fn(async () => [
              {
                id: "msg_verify",
                subject: "Build artifacts ready",
                parsedR2Key: "parsed/msg_verify.json",
              },
            ]),
          })),
        })),
      };
    });
    const update = vi.fn(() => ({
      set: vi.fn((values: Record<string, unknown>) => ({
        where: vi.fn(async () => {
          updates.push(values);
        }),
      })),
    }));

    getDb.mockReturnValue({
      select,
      update,
    });

    const processed = await backfillMessageVerification(
      {
        MAIL_BUCKET: {
          get: vi.fn(async () => ({
            text: async () =>
              JSON.stringify({
                html: null,
                text: "Use verification code 842911 to unlock the preview URL.",
              }),
          })),
        },
      } as never,
      {
        CLEANUP_BATCH_SIZE: 1,
      },
    );

    expect(processed).toBe(1);
    expect(updates).toContainEqual(
      expect.objectContaining({
        verificationCode: "842911",
        verificationSource: "body",
        verificationMethod: "rules",
        verificationCheckedAt: expect.any(String),
        verificationRetryAfter: null,
      }),
    );
  });

  it("keeps retryable backfill messages unchecked while Workers AI is paused", async () => {
    const updates: Array<Record<string, unknown>> = [];
    const select = vi.fn((fields?: Record<string, unknown>) => {
      if (fields && Object.keys(fields).length === 1 && "id" in fields) {
        return {
          from: vi.fn(() => ({
            where: vi.fn(() => ({
              orderBy: vi.fn(() => ({
                limit: vi.fn(async () => [{ id: "msg_retry" }]),
              })),
            })),
          })),
        };
      }

      return {
        from: vi.fn(() => ({
          where: vi.fn(() => ({
            limit: vi.fn(async () => [
              {
                id: "msg_retry",
                subject: "Verification request",
                parsedR2Key: "parsed/msg_retry.json",
              },
            ]),
          })),
        })),
      };
    });
    const update = vi.fn(() => ({
      set: vi.fn((values: Record<string, unknown>) => ({
        where: vi.fn(async () => {
          updates.push(values);
        }),
      })),
    }));

    getDb.mockReturnValue({
      select,
      update,
    });
    getRuntimeStateValue.mockResolvedValue("2099-01-01T00:00:00.000Z");

    const processed = await backfillMessageVerification(
      {
        AI: { run: vi.fn() },
        MAIL_BUCKET: {
          get: vi.fn(async () => ({
            text: async () =>
              JSON.stringify({
                html: null,
                text: "Your verification codes are 551177 and 662288. Use the latest one to continue.",
              }),
          })),
        },
      } as never,
      {
        CLEANUP_BATCH_SIZE: 1,
      },
    );

    expect(processed).toBe(1);
    expect(updates).toContainEqual(
      expect.objectContaining({
        verificationCode: null,
        verificationSource: null,
        verificationMethod: null,
        verificationCheckedAt: null,
        verificationRetryAfter: "2099-01-01T00:00:00.000Z",
      }),
    );
  });

  it("continues backfill after a malformed parsed payload", async () => {
    const updates: Array<Record<string, unknown>> = [];
    const select = vi.fn((fields?: Record<string, unknown>) => {
      if (fields && Object.keys(fields).length === 1 && "id" in fields) {
        return {
          from: vi.fn(() => ({
            where: vi.fn(() => ({
              orderBy: vi.fn(() => ({
                limit: vi.fn(async () => [
                  { id: "msg_bad" },
                  { id: "msg_good" },
                ]),
              })),
            })),
          })),
        };
      }

      return {
        from: vi.fn(() => ({
          where: vi.fn(() => ({
            limit: vi
              .fn()
              .mockResolvedValueOnce([
                {
                  id: "msg_bad",
                  subject: "Broken payload",
                  parsedR2Key: "parsed/msg_bad.json",
                },
              ])
              .mockResolvedValueOnce([
                {
                  id: "msg_good",
                  subject: "Backup code",
                  parsedR2Key: "parsed/msg_good.json",
                },
              ]),
          })),
        })),
      };
    });
    const update = vi.fn(() => ({
      set: vi.fn((values: Record<string, unknown>) => ({
        where: vi.fn(async () => {
          updates.push(values);
        }),
      })),
    }));

    getDb.mockReturnValue({
      select,
      update,
    });

    const bucketGet = vi
      .fn()
      .mockResolvedValueOnce({
        text: async () => "{not-json",
      })
      .mockResolvedValueOnce({
        text: async () =>
          JSON.stringify({
            html: null,
            text: "Use verification code 842911 to unlock the preview URL.",
          }),
      });

    const processed = await backfillMessageVerification(
      {
        MAIL_BUCKET: {
          get: bucketGet,
        },
      } as never,
      {
        CLEANUP_BATCH_SIZE: 2,
      },
    );

    expect(processed).toBe(2);
    expect(updates).toContainEqual(
      expect.objectContaining({
        verificationCode: null,
        verificationSource: null,
        verificationMethod: null,
        verificationCheckedAt: null,
        verificationRetryAfter: expect.any(String),
      }),
    );
    expect(updates).toContainEqual(
      expect.objectContaining({
        verificationCode: "842911",
        verificationSource: "body",
        verificationMethod: "rules",
        verificationCheckedAt: expect.any(String),
        verificationRetryAfter: null,
      }),
    );
  });

  it("keeps backfill messages retryable after transient read failures", async () => {
    const updates: Array<Record<string, unknown>> = [];
    const select = vi.fn((fields?: Record<string, unknown>) => {
      if (fields && Object.keys(fields).length === 1 && "id" in fields) {
        return {
          from: vi.fn(() => ({
            where: vi.fn(() => ({
              orderBy: vi.fn(() => ({
                limit: vi.fn(async () => [{ id: "msg_retry_read" }]),
              })),
            })),
          })),
        };
      }

      return {
        from: vi.fn(() => ({
          where: vi.fn(() => ({
            limit: vi.fn(async () => [
              {
                id: "msg_retry_read",
                subject: "Verification request",
                parsedR2Key: "parsed/msg_retry_read.json",
              },
            ]),
          })),
        })),
      };
    });
    const update = vi.fn(() => ({
      set: vi.fn((values: Record<string, unknown>) => ({
        where: vi.fn(async () => {
          updates.push(values);
        }),
      })),
    }));

    getDb.mockReturnValue({
      select,
      update,
    });

    const processed = await backfillMessageVerification(
      {
        MAIL_BUCKET: {
          get: vi.fn(async () => ({
            text: async () => {
              throw new Error("temporary read failure");
            },
          })),
        },
      } as never,
      {
        CLEANUP_BATCH_SIZE: 1,
      },
    );

    expect(processed).toBe(1);
    expect(updates).toContainEqual(
      expect.objectContaining({
        verificationCode: null,
        verificationSource: null,
        verificationMethod: null,
        verificationCheckedAt: null,
        verificationRetryAfter: expect.any(String),
      }),
    );
  });

  it("limits pending verification selection to the configured cleanup batch size", async () => {
    const limit = vi.fn(async () => []);

    getDb.mockReturnValue({
      select: vi.fn(() => ({
        from: vi.fn(() => ({
          where: vi.fn(() => ({
            orderBy: vi.fn(() => ({
              limit,
            })),
          })),
        })),
      })),
    });

    await listMessageIdsPendingVerification({} as never, {
      CLEANUP_BATCH_SIZE: 3,
    });

    expect(limit).toHaveBeenCalledWith(3);
  });
});
