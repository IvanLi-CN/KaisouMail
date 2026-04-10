import { describe, expect, it } from "vitest";

import {
  formatMailboxTtl,
  mailboxTtlSliderFiniteStop,
  mailboxTtlToSliderPosition,
  parseMailboxTtlInput,
  parseMailboxTtlInputWithOptions,
  sliderPositionToMailboxTtl,
} from "@/lib/mailbox-ttl";

describe("mailbox TTL helpers", () => {
  it("parses common finite units and defaults unitless input to hours", () => {
    expect(parseMailboxTtlInput("36h")).toEqual({ ok: true, value: 2160 });
    expect(parseMailboxTtlInput("2d")).toEqual({ ok: true, value: 2880 });
    expect(parseMailboxTtlInput("1.5w")).toEqual({
      ok: true,
      value: 15120,
    });
    expect(parseMailboxTtlInput("1mo")).toEqual({
      ok: true,
      value: 43200,
    });
    expect(parseMailboxTtlInput("1月")).toEqual({
      ok: true,
      value: 43200,
    });
    expect(parseMailboxTtlInput("48")).toEqual({ ok: true, value: 2880 });
  });

  it("parses unlimited aliases", () => {
    expect(parseMailboxTtlInput("无限")).toEqual({ ok: true, value: null });
    expect(parseMailboxTtlInput("∞")).toEqual({ ok: true, value: null });
  });

  it("rejects unlimited aliases when the runtime capability is disabled", () => {
    expect(
      parseMailboxTtlInputWithOptions("无限", {
        supportsUnlimited: false,
      }),
    ).toEqual({
      ok: false,
      message: "当前环境暂不支持无限生命周期",
    });
  });

  it("rejects invalid finite ranges", () => {
    expect(parseMailboxTtlInput("0.5h")).toEqual({
      ok: false,
      message: "有限生命周期需在 1 小时到 30 天之间，或输入 无限",
    });
  });

  it("formats finite and unlimited values", () => {
    expect(formatMailboxTtl(2160)).toBe("1 天 12 小时");
    expect(formatMailboxTtl(null)).toBe("无限");
  });

  it("maps the final slider slot to unlimited", () => {
    expect(sliderPositionToMailboxTtl(1000)).toBeNull();
  });

  it("keeps the max finite TTL on a dedicated stop before unlimited", () => {
    expect(mailboxTtlToSliderPosition(43200, 60)).toBe(
      mailboxTtlSliderFiniteStop,
    );
    expect(mailboxTtlToSliderPosition(null, 60)).toBe(1000);
    expect(sliderPositionToMailboxTtl(mailboxTtlSliderFiniteStop)).toBe(43200);
  });
});
