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
      subject: "Build artifacts ready",
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
        text: "Candidate list: 551177 662288",
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
        text: "Candidate list: 551177 662288",
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
        text: "Candidate list: 551177 662288",
        html: null,
      },
    );

    expect(detection).toEqual({
      verification: null,
      shouldRetry: true,
    });
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
        verificationCheckedAt: expect.any(String),
      }),
    );
    expect(updates).toContainEqual(
      expect.objectContaining({
        verificationCode: "842911",
        verificationSource: "body",
        verificationMethod: "rules",
        verificationCheckedAt: expect.any(String),
      }),
    );
  });
});
