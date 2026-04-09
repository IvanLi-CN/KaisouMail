import { maxMailboxTtlMinutes, minMailboxTtlMinutes } from "@kaisoumail/shared";

export const mailboxTtlSliderMax = 1000;
export const mailboxTtlSliderFiniteMax = mailboxTtlSliderMax - 1;
const mailboxTtlMinutesPerHour = 60;
const mailboxTtlMinutesPerDay = 24 * mailboxTtlMinutesPerHour;
const mailboxTtlMinutesPerWeek = 7 * mailboxTtlMinutesPerDay;
const mailboxTtlMinutesPerMonth = 30 * mailboxTtlMinutesPerDay;

const clamp = (value: number, min: number, max: number) =>
  Math.min(Math.max(value, min), max);

type MailboxTtlOptions = {
  minMinutes?: number;
  maxMinutes?: number;
  supportsUnlimited?: boolean;
};

const resolveMailboxTtlOptions = ({
  minMinutes = minMailboxTtlMinutes,
  maxMinutes = maxMailboxTtlMinutes,
  supportsUnlimited = true,
}: MailboxTtlOptions = {}) => ({
  minMinutes,
  maxMinutes,
  supportsUnlimited,
});

const getMailboxTtlLogBounds = (options?: MailboxTtlOptions) => {
  const { minMinutes, maxMinutes, supportsUnlimited } =
    resolveMailboxTtlOptions(options);
  return {
    minMinutes,
    maxMinutes,
    logMin: Math.log(minMinutes),
    logMax: Math.log(maxMinutes),
    supportsUnlimited,
  };
};

export const resolveMailboxTtlSliderMax = (supportsUnlimited = true) =>
  supportsUnlimited ? mailboxTtlSliderMax : mailboxTtlSliderFiniteMax;

const quantizeSliderFiniteTtl = (
  minutes: number,
  options?: MailboxTtlOptions,
) => {
  const { minMinutes, maxMinutes } = resolveMailboxTtlOptions(options);
  const step =
    minutes <= 12 * mailboxTtlMinutesPerHour
      ? 30
      : minutes <= 3 * mailboxTtlMinutesPerDay
        ? mailboxTtlMinutesPerHour
        : minutes <= 14 * mailboxTtlMinutesPerDay
          ? 6 * mailboxTtlMinutesPerHour
          : mailboxTtlMinutesPerDay;

  return clamp(Math.round(minutes / step) * step, minMinutes, maxMinutes);
};

export const isUnlimitedMailboxTtl = (minutes: number | null | undefined) =>
  minutes === null;

export const isFiniteMailboxTtl = (
  minutes: number | null | undefined,
): minutes is number => typeof minutes === "number" && Number.isFinite(minutes);

export const mailboxTtlToSliderPosition = (
  minutes: number | null | undefined,
  fallbackMinutes = minMailboxTtlMinutes,
  options?: MailboxTtlOptions,
) => {
  const { minMinutes, maxMinutes, logMin, logMax, supportsUnlimited } =
    getMailboxTtlLogBounds(options);
  if (minutes === null && supportsUnlimited) return mailboxTtlSliderMax;

  const finiteMinutes = clamp(
    isFiniteMailboxTtl(minutes) ? minutes : fallbackMinutes,
    minMinutes,
    maxMinutes,
  );
  const ratio = (Math.log(finiteMinutes) - logMin) / (logMax - logMin);

  return clamp(
    Math.round(ratio * mailboxTtlSliderFiniteMax),
    0,
    resolveMailboxTtlSliderMax(supportsUnlimited),
  );
};

export const sliderPositionToMailboxTtl = (
  position: number,
  options?: MailboxTtlOptions,
) => {
  const { logMin, logMax, supportsUnlimited } = getMailboxTtlLogBounds(options);
  const sliderMax = resolveMailboxTtlSliderMax(supportsUnlimited);
  const clampedPosition = clamp(position, 0, sliderMax);
  if (supportsUnlimited && clampedPosition >= mailboxTtlSliderMax) return null;

  const ratio = clampedPosition / mailboxTtlSliderFiniteMax;
  const minutes = Math.exp(logMin + ratio * (logMax - logMin));

  return quantizeSliderFiniteTtl(minutes, options);
};

export const formatMailboxTtl = (minutes: number | null | undefined) => {
  if (minutes === null) return "无限";
  if (!isFiniteMailboxTtl(minutes)) return "—";

  let remaining: number = minutes;
  const days = Math.floor(remaining / mailboxTtlMinutesPerDay);
  remaining -= days * mailboxTtlMinutesPerDay;
  const hours = Math.floor(remaining / mailboxTtlMinutesPerHour);
  remaining -= hours * mailboxTtlMinutesPerHour;

  const parts: string[] = [];
  if (days > 0) parts.push(`${days} 天`);
  if (hours > 0) parts.push(`${hours} 小时`);
  if (remaining > 0 || parts.length === 0) parts.push(`${remaining} 分钟`);

  return parts.slice(0, 2).join(" ");
};

export const formatMailboxTtlEditorValue = (
  minutes: number | null | undefined,
) => {
  if (minutes === null) return "无限";
  if (!isFiniteMailboxTtl(minutes)) return `${minMailboxTtlMinutes / 60}`;
  if (minutes % mailboxTtlMinutesPerDay === 0) {
    return `${minutes / mailboxTtlMinutesPerDay}d`;
  }
  if (minutes % mailboxTtlMinutesPerHour === 0) {
    return `${minutes / mailboxTtlMinutesPerHour}h`;
  }
  return `${minutes}m`;
};

const unlimitedMailboxTtlTokens = new Set([
  "∞",
  "inf",
  "infinite",
  "unlimited",
  "forever",
  "永久",
  "无限",
  "永不过期",
]);

const mailboxTtlUnitMap = new Map<string, number>([
  ["m", 1],
  ["min", 1],
  ["mins", 1],
  ["minute", 1],
  ["minutes", 1],
  ["分钟", 1],
  ["分", 1],
  ["h", mailboxTtlMinutesPerHour],
  ["hr", mailboxTtlMinutesPerHour],
  ["hrs", mailboxTtlMinutesPerHour],
  ["hour", mailboxTtlMinutesPerHour],
  ["hours", mailboxTtlMinutesPerHour],
  ["小时", mailboxTtlMinutesPerHour],
  ["时", mailboxTtlMinutesPerHour],
  ["d", mailboxTtlMinutesPerDay],
  ["day", mailboxTtlMinutesPerDay],
  ["days", mailboxTtlMinutesPerDay],
  ["天", mailboxTtlMinutesPerDay],
  ["w", mailboxTtlMinutesPerWeek],
  ["wk", mailboxTtlMinutesPerWeek],
  ["wks", mailboxTtlMinutesPerWeek],
  ["week", mailboxTtlMinutesPerWeek],
  ["weeks", mailboxTtlMinutesPerWeek],
  ["周", mailboxTtlMinutesPerWeek],
  ["星期", mailboxTtlMinutesPerWeek],
  ["mo", mailboxTtlMinutesPerMonth],
  ["mon", mailboxTtlMinutesPerMonth],
  ["month", mailboxTtlMinutesPerMonth],
  ["months", mailboxTtlMinutesPerMonth],
  ["月", mailboxTtlMinutesPerMonth],
]);

export const parseMailboxTtlInput = (rawValue: string) => {
  return parseMailboxTtlInputWithOptions(rawValue);
};

export const parseMailboxTtlInputWithOptions = (
  rawValue: string,
  options?: MailboxTtlOptions,
) => {
  const { minMinutes, maxMinutes, supportsUnlimited } =
    resolveMailboxTtlOptions(options);
  const normalized = rawValue.trim().toLowerCase();
  if (!normalized) {
    return {
      ok: false as const,
      message: "请输入生命周期，例如 36h、2d、1mo 或 无限",
    };
  }
  if (unlimitedMailboxTtlTokens.has(normalized)) {
    if (!supportsUnlimited) {
      return {
        ok: false as const,
        message: "当前环境暂不支持无限生命周期",
      };
    }
    return { ok: true as const, value: null as number | null };
  }

  const match = normalized.match(/^(\d+(?:\.\d+)?)\s*([a-z\u4e00-\u9fa5]+)?$/i);
  if (!match) {
    return {
      ok: false as const,
      message: "仅支持数字加常见时间单位，未带单位时默认按小时解析",
    };
  }

  const [, numericPart, unitPart] = match;
  const amount = Number.parseFloat(numericPart ?? "");
  if (!Number.isFinite(amount) || amount <= 0) {
    return {
      ok: false as const,
      message: "生命周期必须是大于 0 的数字",
    };
  }

  const unit = unitPart ?? "h";
  const factor = mailboxTtlUnitMap.get(unit);
  if (!factor) {
    return {
      ok: false as const,
      message: "仅支持分钟、小时、天、周、月或 无限",
    };
  }

  const minutes = Math.round(amount * factor);
  if (minutes < minMinutes || minutes > maxMinutes) {
    return {
      ok: false as const,
      message: supportsUnlimited
        ? `有限生命周期需在 ${formatMailboxTtl(minMinutes)}到 ${formatMailboxTtl(maxMinutes)}之间，或输入 无限`
        : `有限生命周期需在 ${formatMailboxTtl(minMinutes)}到 ${formatMailboxTtl(maxMinutes)}之间`,
    };
  }

  return { ok: true as const, value: minutes };
};
