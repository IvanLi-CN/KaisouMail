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

  it("detects sign-in request emails that place the numeric code under the heading", async () => {
    const verification = await detectVerificationForMessage({} as never, {
      subject: "Authentication alert",
      text: "Sign-in request\n123456",
      html: null,
    });

    expect(verification).toEqual({
      code: "123456",
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

  it("detects hyphenated verification codes from messages that pair confirmation copy with a standalone validation block", async () => {
    const verification = await detectVerificationForMessage({} as never, {
      subject: "WXN-DTJ xAI confirmation code",
      text: [
        "Validate your email address.",
        "Use the code below to finish signup.",
        "WXN-DTJ",
      ].join("\n"),
      html: null,
    });

    expect(verification).toEqual({
      code: "WXN-DTJ",
      source: "body",
      method: "rules",
    });
  });

  it("detects pure-alpha hyphenated OTPs when the subject explicitly assigns the code", async () => {
    const verification = await detectVerificationForMessage({} as never, {
      subject: "Your confirmation code is WXN-DTJ",
      text: null,
      html: null,
    });

    expect(verification).toEqual({
      code: "WXN-DTJ",
      source: "subject",
      method: "rules",
    });
  });

  it("detects reverse-order pure-alpha hyphenated OTP labels in supported subject formats", async () => {
    const confirmationVerification = await detectVerificationForMessage(
      {} as never,
      {
        subject: "WXN-DTJ confirmation code",
        text: null,
        html: null,
      },
    );
    const localizedVerification = await detectVerificationForMessage(
      {} as never,
      {
        subject: "WXN-DTJ 驗證碼",
        text: null,
        html: null,
      },
    );

    expect(confirmationVerification).toEqual({
      code: "WXN-DTJ",
      source: "subject",
      method: "rules",
    });
    expect(localizedVerification).toEqual({
      code: "WXN-DTJ",
      source: "subject",
      method: "rules",
    });
  });

  it("detects hyphenated verification tokens for supported passcode, otp, and localized subject labels", async () => {
    const passcodeVerification = await detectVerificationForMessage(
      {} as never,
      {
        subject: "Your passcode is WXN-DTJ",
        text: null,
        html: null,
      },
    );
    const otpVerification = await detectVerificationForMessage({} as never, {
      subject: "OTP: WXN-DTJ",
      text: null,
      html: null,
    });
    const localizedVerification = await detectVerificationForMessage(
      {} as never,
      {
        subject: "驗證碼：WXN-DTJ",
        text: null,
        html: null,
      },
    );
    const authenticationVerification = await detectVerificationForMessage(
      {} as never,
      {
        subject: "Your authentication code is WXN-DTJ",
        text: null,
        html: null,
      },
    );

    expect(passcodeVerification).toEqual({
      code: "WXN-DTJ",
      source: "subject",
      method: "rules",
    });
    expect(otpVerification).toEqual({
      code: "WXN-DTJ",
      source: "subject",
      method: "rules",
    });
    expect(localizedVerification).toEqual({
      code: "WXN-DTJ",
      source: "subject",
      method: "rules",
    });
    expect(authenticationVerification).toEqual({
      code: "WXN-DTJ",
      source: "subject",
      method: "rules",
    });
  });

  it("detects hyphenated verification codes from email-validation body content", async () => {
    const verification = await detectVerificationForMessage({} as never, {
      subject: "Welcome to xAI",
      text: "Validate your email address with the code below.\nWXN-DTJ",
      html: [
        "<h1>Validate your email</h1>",
        "<p>Please use the code below to finish creating your account.</p>",
        "<div>WXN-DTJ</div>",
      ].join(""),
    });

    expect(verification).toEqual({
      code: "WXN-DTJ",
      source: "body",
      method: "rules",
    });
  });

  it("detects standalone hyphenated verification codes from localized email-validation copy", async () => {
    const verification = await detectVerificationForMessage({} as never, {
      subject: "歡迎使用 xAI",
      text: "驗證電子郵件\n請輸入以下代碼\nWXN-DTJ",
      html: null,
    });

    expect(verification).toEqual({
      code: "WXN-DTJ",
      source: "body",
      method: "rules",
    });
  });

  it("detects standalone hyphenated body codes when the verification cue only appears in the subject", async () => {
    const verification = await detectVerificationForMessage({} as never, {
      subject: "Your verification code",
      text: "WXN-DTJ",
      html: null,
    });

    expect(verification).toEqual({
      code: "WXN-DTJ",
      source: "body",
      method: "rules",
    });
  });

  it("detects standalone hyphenated validation codes even when the destination address is nearby", async () => {
    const verification = await detectVerificationForMessage({} as never, {
      subject: "Welcome to xAI",
      text: [
        "Validate your email address for ju**9@outlook.com.",
        "Use the code below to finish signup.",
        "WXN-DTJ",
      ].join("\n"),
      html: null,
    });

    expect(verification).toEqual({
      code: "WXN-DTJ",
      source: "body",
      method: "rules",
    });
  });

  it("keeps traditional Chinese security codes when a masked mailbox appears on the same line", async () => {
    const verification = await detectVerificationForMessage({} as never, {
      subject: "個人 Microsoft 帳戶安全性代碼",
      text: "安全代碼：007206，請在Ju**9@outlook.com上輸入此代碼。",
      html: null,
    });

    expect(verification).toEqual({
      code: "007206",
      source: "body",
      method: "rules",
    });
  });

  it("detects traditional Chinese Microsoft security codes from text and html bodies", async () => {
    const verification = await detectVerificationForMessage({} as never, {
      subject: "個人 Microsoft 帳戶安全性代碼",
      text: "請使用下列 Microsoft 帳戶 Ju**9@outlook.com 的安全性代碼。安全代碼：007206 僅在官方網站或應用程式上輸入此代碼。",
      html: [
        "<p>請使用下列個人 Microsoft 帳戶 <strong>Ju**9@outlook.com</strong> 的安全性代碼。</p>",
        "<p><strong>安全代碼: 007206</strong></p>",
      ].join(""),
    });

    expect(verification).toEqual({
      code: "007206",
      source: "body",
      method: "rules",
    });
  });

  it("recognizes plain verification codes after dash separators", async () => {
    const englishVerification = await detectVerificationForMessage(
      {} as never,
      {
        subject: "verification code-123456",
        text: null,
        html: null,
      },
    );
    const chineseVerification = await detectVerificationForMessage(
      {} as never,
      {
        subject: "安全通知",
        text: "验证码-654321",
        html: null,
      },
    );

    expect(englishVerification).toEqual({
      code: "123456",
      source: "subject",
      method: "rules",
    });
    expect(chineseVerification).toEqual({
      code: "654321",
      source: "body",
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

  it("does not truncate multi-hyphen identifiers into hyphenated verification matches", async () => {
    const suffixVerification = await detectVerificationForMessage({} as never, {
      subject: "ABC-123-XYZ confirmation code",
      text: null,
      html: null,
    });
    const prefixVerification = await detectVerificationForMessage({} as never, {
      subject: "xAI confirmation code ABC-123-XYZ",
      text: null,
      html: null,
    });

    expect(suffixVerification).toBeNull();
    expect(prefixVerification).toBeNull();
  });

  it("does not treat sign-in phrasing as a hyphenated verification code", async () => {
    const verification = await detectVerificationForMessage({} as never, {
      subject: "Your sign-in confirmation code",
      text: "Use verification code 842911 to continue.",
      html: null,
    });

    expect(verification).toEqual({
      code: "842911",
      source: "body",
      method: "rules",
    });
  });

  it("ignores generic code-review subjects that only contain build numbers", async () => {
    const verification = await detectVerificationForMessage({} as never, {
      subject: "Code review for build 123456",
      text: null,
      html: null,
    });

    expect(verification).toBeNull();
  });

  it("prefers the actual sign-in code over nearby reference numbers", async () => {
    const verification = await detectVerificationForMessage({} as never, {
      subject: "Sign-in request",
      text: "To sign in, enter 123456. Reference 789012",
      html: null,
    });

    expect(verification).toEqual({
      code: "123456",
      source: "body",
      method: "rules",
    });
  });

  it("does not promote email-validation references into verification codes", async () => {
    const verification = await detectVerificationForMessage({} as never, {
      subject: "Welcome to xAI",
      text: "Please validate your email. Reference 123456.",
      html: null,
    });

    expect(verification).toBeNull();
  });

  it("does not let generic confirmation subjects bless standalone hyphenated body ids", async () => {
    const verification = await detectVerificationForMessage({} as never, {
      subject: "Your booking confirmation code",
      text: "ABC-123",
      html: null,
    });

    expect(verification).toBeNull();
  });

  it("does not treat booking or order confirmation assignments as verification codes", async () => {
    const bookingVerification = await detectVerificationForMessage(
      {} as never,
      {
        subject: "Your booking confirmation code is AB1-2CD3",
        text: null,
        html: null,
      },
    );
    const orderVerification = await detectVerificationForMessage({} as never, {
      subject: "Your order confirmation code is 123456",
      text: null,
      html: null,
    });

    expect(bookingVerification).toBeNull();
    expect(orderVerification).toBeNull();
  });

  it("does not promote standalone locale or template labels from subject-only verification cues", async () => {
    const localeVerification = await detectVerificationForMessage({} as never, {
      subject: "Your verification code",
      text: "EN-US",
      html: null,
    });
    const templateVerification = await detectVerificationForMessage(
      {} as never,
      {
        subject: "Your verification code",
        text: "PDF-CSV",
        html: null,
      },
    );

    expect(localeVerification).toBeNull();
    expect(templateVerification).toBeNull();
  });

  it("does not let generic security or authentication subjects bless standalone hyphenated body ids", async () => {
    const securityVerification = await detectVerificationForMessage(
      {} as never,
      {
        subject: "Security alert",
        text: "AB1-2CD3",
        html: null,
      },
    );
    const authenticationVerification = await detectVerificationForMessage(
      {} as never,
      {
        subject: "Authentication alert",
        text: "ABC-DEF",
        html: null,
      },
    );

    expect(securityVerification).toBeNull();
    expect(authenticationVerification).toBeNull();
  });

  it("does not treat generic all-caps hyphenated subject phrases as verification codes", async () => {
    const localeVerification = await detectVerificationForMessage({} as never, {
      subject: "EN-US confirmation code",
      text: null,
      html: null,
    });
    const templateVerification = await detectVerificationForMessage(
      {} as never,
      {
        subject: "PDF-CSV confirmation code",
        text: null,
        html: null,
      },
    );
    const additionalLocaleVerification = await detectVerificationForMessage(
      {} as never,
      {
        subject: "NL-BE confirmation code",
        text: null,
        html: null,
      },
    );

    expect(localeVerification).toBeNull();
    expect(templateVerification).toBeNull();
    expect(additionalLocaleVerification).toBeNull();
  });

  it("does not treat forward subject hyphenated labels as explicit verification assignments", async () => {
    const localeVerification = await detectVerificationForMessage({} as never, {
      subject: "confirmation code EN-US",
      text: null,
      html: null,
    });
    const templateVerification = await detectVerificationForMessage(
      {} as never,
      {
        subject: "verification code PDF-CSV",
        text: null,
        html: null,
      },
    );
    const dashSeparatedVerification = await detectVerificationForMessage(
      {} as never,
      {
        subject: "confirmation code-EN-US",
        text: null,
        html: null,
      },
    );

    expect(localeVerification).toBeNull();
    expect(templateVerification).toBeNull();
    expect(dashSeparatedVerification).toBeNull();
  });

  it("does not treat inline hyphenated phrases in validation emails as verification codes", async () => {
    const verification = await detectVerificationForMessage({} as never, {
      subject: "Welcome to xAI",
      text: "Validate your email and use SAVE-MORE to continue.",
      html: null,
    });

    expect(verification).toBeNull();
  });

  it("does not treat localized body labels as pure-alpha hyphenated verification codes", async () => {
    const reverseVerification = await detectVerificationForMessage(
      {} as never,
      {
        subject: "Template notice",
        text: "EN-US confirmation code",
        html: null,
      },
    );
    const forwardVerification = await detectVerificationForMessage(
      {} as never,
      {
        subject: "Template notice",
        text: "confirmation code PDF-CSV",
        html: null,
      },
    );

    expect(reverseVerification).toBeNull();
    expect(forwardVerification).toBeNull();
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

  it("rejects Workers AI subject matches for pure-alpha hyphenated labels without an explicit assignment cue", async () => {
    const run = vi.fn().mockResolvedValue({
      response: '{"verdict":"match","code":"EN-US","source":"subject"}',
    });

    const verification = await detectVerificationForMessage(
      {
        AI: { run },
      } as never,
      {
        subject: "EN-US confirmation code",
        text: null,
        html: null,
      },
    );

    expect(run).not.toHaveBeenCalled();
    expect(verification).toBeNull();
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

  it("keeps subject-cued standalone body tokens in the AI body snippet for long emails", async () => {
    const run = vi.fn().mockResolvedValue({
      response: '{"verdict":"match","code":"WXN-DTJ","source":"body"}',
    });
    const longBody = [
      ...Array.from({ length: 40 }, () => "This is boilerplate legal text."),
      "WXN-DTJ",
      "ABC-DEF",
    ].join("\n");

    const verification = await detectVerificationForMessage(
      {
        AI: { run },
      } as never,
      {
        subject: "Your verification code",
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
    ).toContain("WXN-DTJ\nABC-DEF");
    expect(verification).toEqual({
      code: "WXN-DTJ",
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

  it("stores a temporary Workers AI cooldown for generic 429 responses", async () => {
    const run = vi.fn().mockRejectedValue({
      status: 429,
      retryAfter: "120",
      message: "Workers AI rate limited",
    });

    const detection = await resolveVerificationDetectionForMessage(
      {
        AI: { run },
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
      retryAfter: expect.any(String),
    });
    expect(setRuntimeStateValue).toHaveBeenCalledWith(
      { AI: { run } },
      "workers_ai_verification_rate_limited_until",
      expect.any(String),
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

  it("does not extract direct verification codes from adjacent glued text", async () => {
    const suffixVerification = await detectVerificationForMessage({} as never, {
      subject: "verification code1234y",
      text: null,
      html: null,
    });
    const prefixVerification = await detectVerificationForMessage({} as never, {
      subject: "abcverification code1234",
      text: null,
      html: null,
    });

    expect(suffixVerification).toBeNull();
    expect(prefixVerification).toBeNull();
  });

  it("does not extract verification codes from email-address fragments", async () => {
    const numericVerification = await detectVerificationForMessage(
      {} as never,
      {
        subject: "confirmation code 1234@domain.com",
        text: null,
        html: null,
      },
    );
    const hyphenatedVerification = await detectVerificationForMessage(
      {} as never,
      {
        subject: "confirmation code WXN-DTJ@domain.com",
        text: null,
        html: null,
      },
    );

    expect(numericVerification).toBeNull();
    expect(hyphenatedVerification).toBeNull();
  });

  it("does not treat mailbox host fragments as hyphenated verification codes", async () => {
    const detection = await resolveVerificationDetectionForMessage(
      {} as never,
      {
        subject: "xAI confirmation code",
        text: "Mailbox ID: GROK-698F7E26@BOX-C14F5924.707979.XYZ",
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

  it("settles ambiguous messages without retries when the AI binding is unavailable", async () => {
    const detection = await resolveVerificationDetectionForMessage(
      {} as never,
      {
        subject: "Verification request",
        text: "Your verification codes are 551177 and 662288. Use the latest one to continue.",
        html: null,
      },
    );

    expect(detection.verification).toBeNull();
    expect(detection.shouldRetry).toBe(false);
    expect(detection.retryAfter).toBeNull();
  });

  it("retries ambiguous messages when the AI response JSON does not match the schema", async () => {
    const detection = await resolveVerificationDetectionForMessage(
      {
        AI: {
          run: vi.fn().mockResolvedValue({
            response: '{"verdict":"match","code":"662288"}',
          }),
        },
      } as never,
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
