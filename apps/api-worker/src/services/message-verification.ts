import { and, asc, eq, isNull, lte, or } from "drizzle-orm";
import { z } from "zod";

import { getDb } from "../db/client";
import { messages } from "../db/schema";
import {
  DEFAULT_WORKERS_AI_MODEL,
  type RuntimeConfig,
  type WorkerEnv,
} from "../env";
import { nowIso } from "../lib/crypto";
import { ApiError } from "../lib/errors";
import { logOperationalEvent } from "../lib/observability";
import {
  resolveRetryAfterIso,
  resolveRetryAfterSeconds,
} from "../lib/rate-limit";
import { getRuntimeStateValue, setRuntimeStateValue } from "./runtime-state";

const WORKERS_AI_PAUSED_UNTIL_KEY = "workers_ai_verification_paused_until";
const WORKERS_AI_RATE_LIMITED_UNTIL_KEY =
  "workers_ai_verification_rate_limited_until";
const MESSAGE_VERIFICATION_BACKFILL_BATCH_SIZE = 20;
const MESSAGE_VERIFICATION_RETRY_BACKOFF_MS = 15 * 60 * 1000;
const DEFAULT_TOKEN_CONTEXT_RADIUS = 40;
const HYPHENATED_TOKEN_CONTEXT_RADIUS = 120;
const CODE_PATTERN = /^(?:\d{4,8}|(?=.*[A-Za-z])(?=.*\d)[A-Za-z0-9]{4,8})$/;
const HYPHENATED_CODE_PATTERN = /^(?=.*[A-Za-z])[A-Za-z0-9]+-[A-Za-z0-9]+$/;
const UPPERCASE_ALPHA_HYPHENATED_CODE_PATTERN = /^[A-Z]{2,3}-[A-Z]{2,3}$/;
const CODE_TOKEN_PATTERN =
  /(?<![A-Za-z0-9])(?:(?=[A-Za-z0-9-]{5,9}(?=$|[^A-Za-z0-9]))[A-Za-z0-9]{1,8}-[A-Za-z0-9]{1,8}|[A-Za-z0-9]{4,8})(?=$|[^A-Za-z0-9])/g;
const VERIFICATION_KEYWORDS = [
  "verification code",
  "security code",
  "passcode",
  "one-time code",
  "one time code",
  "login code",
  "confirm code",
  "otp",
  "验证码",
  "校验码",
  "动态码",
  "认证码",
  "登入码",
  "登录码",
  "驗證碼",
  "安全代碼",
  "安全性代碼",
] as const;
const HYPHENATED_CONFIRMATION_KEYWORDS = [
  "confirmation code",
  "validation code",
] as const;
const VERIFICATION_EMAIL_SIGNAL_PHRASES = [
  "validate your email",
  "validate email",
  "email validation",
  "驗證電子郵件",
] as const;
const VALIDATION_CODE_CUE_PATTERN =
  /\bcode\b|代碼|代码|驗證碼|验证码|安全代碼|安全代码|安全性代碼|安全性代码/i;
const EMAIL_OR_URL_PATTERNS = [
  /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g,
  /https?:\/\/[^\s<>()]+/gi,
] as const;
const escapedKeywords = VERIFICATION_KEYWORDS.map((keyword) =>
  keyword.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"),
);
const escapedHyphenatedConfirmationKeywords =
  HYPHENATED_CONFIRMATION_KEYWORDS.map((keyword) =>
    keyword.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"),
  );
const FORWARD_DIRECT_CODE_CAPTURE =
  "(?<![A-Za-z0-9-])([A-Za-z0-9]+(?:-[A-Za-z0-9]+)?)(?=$|[^A-Za-z0-9-])";
const REVERSE_DIRECT_CODE_CAPTURE =
  "(?<![A-Za-z0-9-])([A-Za-z0-9]+(?:-[A-Za-z0-9]+)?)(?=$|[^A-Za-z0-9-])";
const DIRECT_CODE_PATTERNS = [
  {
    direction: "forward" as const,
    pattern: new RegExp(
      `(?:${escapedKeywords.join("|")})[^A-Za-z0-9]{0,24}${FORWARD_DIRECT_CODE_CAPTURE}`,
      "gi",
    ),
  },
  {
    direction: "reverse" as const,
    pattern: new RegExp(
      `${REVERSE_DIRECT_CODE_CAPTURE}[^A-Za-z0-9]{0,24}(?:${escapedKeywords.join("|")})`,
      "gi",
    ),
  },
  {
    direction: "forward" as const,
    pureAlphaHyphenatedOnly: true,
    pattern: new RegExp(
      `(?:${escapedHyphenatedConfirmationKeywords.join("|")})[^A-Za-z0-9]{0,24}${FORWARD_DIRECT_CODE_CAPTURE}`,
      "gi",
    ),
  },
  {
    direction: "reverse" as const,
    pureAlphaHyphenatedOnly: true,
    pattern: new RegExp(
      `${REVERSE_DIRECT_CODE_CAPTURE}[^A-Za-z0-9]{0,24}(?:${escapedHyphenatedConfirmationKeywords.join("|")})`,
      "gi",
    ),
  },
] as const;
const GENERIC_CODE_CONTEXT_PATTERN =
  /\b(one[- ]time|login|log[ -]?in|sign(?:ing)?[ -]?in|verification|security|confirm|authentication|authenticate|access)\s+code\b/i;
const VERIFICATION_CONTEXT_PATTERN =
  /\b(verification|verify|otp|passcode|login|log[ -]?in|sign(?:ing)?[ -]?in|confirm|security|one[- ]time|authentication|authenticate)\b|验证码|校验码|动态码|认证码|登入码|登录码|驗證碼|安全代碼|安全性代碼/i;
const FILE_LABEL_SEGMENTS = new Set([
  "CSV",
  "DOC",
  "DOCX",
  "HTML",
  "JPG",
  "JSON",
  "PDF",
  "PNG",
  "TXT",
  "WEBP",
  "XLS",
  "XLSX",
  "XML",
]);

const aiDecisionSchema = z.object({
  verdict: z.enum(["match", "none"]),
  code: z.string().nullable(),
  source: z.enum(["subject", "body", "none"]),
});

export type StoredVerification = {
  code: string;
  source: "subject" | "body";
  method: "rules" | "ai";
};

type RuleDetection = {
  match: StoredVerification | null;
  candidates: string[];
  ambiguous: boolean;
  hadSignal: boolean;
};

export type VerificationDetectionResult = {
  verification: StoredVerification | null;
  shouldRetry: boolean;
  retryAfter: string | null;
};

const normalizeWhitespace = (value: string) =>
  value.replace(/\s+/g, " ").trim();

const normalizeBodyText = (value: string | null | undefined) =>
  (value ?? "")
    .split(/\r?\n/)
    .map((line) => normalizeWhitespace(line))
    .filter(Boolean)
    .join("\n");

const normalizeVerificationCode = (value: string | null | undefined) => {
  const normalized = value?.replace(/\s+/g, "").trim() ?? "";
  if (CODE_PATTERN.test(normalized)) {
    return normalized;
  }

  if (!HYPHENATED_CODE_PATTERN.test(normalized)) {
    return null;
  }

  const compact = normalized.replace(/-/g, "");
  if (compact.length < 4 || compact.length > 8 || /^\d+$/.test(compact)) {
    return null;
  }

  if (
    !/\d/.test(compact) &&
    !UPPERCASE_ALPHA_HYPHENATED_CODE_PATTERN.test(normalized)
  ) {
    return null;
  }

  return normalized;
};

const compareVerificationCodes = (left: string, right: string) =>
  left.localeCompare(right, undefined, { sensitivity: "accent" }) === 0;

const stripHtmlToText = (html: string | null | undefined) => {
  if (!html) return "";

  return normalizeBodyText(
    html
      .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ")
      .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, " ")
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<\/p>/gi, "\n")
      .replace(/<[^>]+>/g, " ")
      .replace(/&nbsp;/gi, " ")
      .replace(/&amp;/gi, "&")
      .replace(/&lt;/gi, "<")
      .replace(/&gt;/gi, ">")
      .replace(/&#39;/g, "'")
      .replace(/&quot;/gi, '"'),
  );
};

const findKeywordHit = (value: string) => {
  const lowered = value.toLowerCase();
  return VERIFICATION_KEYWORDS.some((keyword) => lowered.includes(keyword));
};

const findEmailValidationSignalHit = (value: string) => {
  const lowered = value.toLowerCase();
  return VERIFICATION_EMAIL_SIGNAL_PHRASES.some((keyword) =>
    lowered.includes(keyword),
  );
};

const hasStandaloneValidationCodeSignal = (value: string) =>
  findEmailValidationSignalHit(value) &&
  VALIDATION_CODE_CUE_PATTERN.test(value);

const hasVerificationContextSignal = (value: string) =>
  findKeywordHit(value) ||
  GENERIC_CODE_CONTEXT_PATTERN.test(value) ||
  VERIFICATION_CONTEXT_PATTERN.test(value);

const REFERENCE_LABEL_PATTERN =
  /\b(reference|ref|order|invoice|ticket|case|build|tracking|number|no\.?)\s*[:#-]?\s*$/i;
const EXPLICIT_AUTH_CODE_ASSIGNMENT_PATTERN =
  /(?:^|[^A-Za-z0-9])(?:your\s+)?(?:(?:verification|security|authentication|login|confirm)\s+code|passcode|otp|验证码|校验码|动态码|认证码|登入码|登录码|驗證碼|安全代碼|安全性代碼)(?:(?:\s+is)?\s*[:：]|\s+is)\s*$/i;
const EXPLICIT_CONFIRMATION_CODE_ASSIGNMENT_PATTERN =
  /(?:^|[^A-Za-z0-9])(?:your\s+)?(?:confirmation|validation)\s+code(?:(?:\s+is)?\s*[:：]|\s+is)\s*$/i;
const NON_VERIFICATION_CONFIRMATION_CONTEXT_PATTERN =
  /\b(booking|order|reservation|ticket|invoice|tracking|reference|case)\b/i;

const isSafeBoundary = (value: string | undefined) =>
  !value || !/[A-Za-z0-9]/.test(value);

const isPureAlphaHyphenatedCode = (value: string) =>
  UPPERCASE_ALPHA_HYPHENATED_CODE_PATTERN.test(value);

const getTokenContextRadius = (token: string) =>
  token.includes("-")
    ? HYPHENATED_TOKEN_CONTEXT_RADIUS
    : DEFAULT_TOKEN_CONTEXT_RADIUS;

const hasExplicitCodeAssignmentCue = (value: string, index: number) => {
  const cueWindow = value.slice(Math.max(0, index - 64), index);
  if (EXPLICIT_AUTH_CODE_ASSIGNMENT_PATTERN.test(cueWindow)) {
    return true;
  }

  return (
    EXPLICIT_CONFIRMATION_CODE_ASSIGNMENT_PATTERN.test(cueWindow) &&
    !NON_VERIFICATION_CONFIRMATION_CONTEXT_PATTERN.test(cueWindow)
  );
};

const hasStandaloneBodySubjectCue = (value: string) =>
  findKeywordHit(value) || hasStandaloneValidationCodeSignal(value);

const isLikelyHyphenatedLabelToken = (value: string) => {
  if (!isPureAlphaHyphenatedCode(value)) return false;

  if (/^[A-Z]{2}-[A-Z]{2}$/.test(value)) {
    return true;
  }

  return value
    .split("-")
    .every((segment) => FILE_LABEL_SEGMENTS.has(segment.toUpperCase()));
};

const isStandaloneTokenLine = (value: string, token: string, index: number) => {
  const lineStart = value.lastIndexOf("\n", index - 1) + 1;
  const lineEndIndex = value.indexOf("\n", index + token.length);
  const lineEnd = lineEndIndex === -1 ? value.length : lineEndIndex;
  return value.slice(lineStart, lineEnd).trim() === token;
};

const isEmailOrUrlSegment = (
  value: string,
  index: number,
  tokenLength: number,
) =>
  EMAIL_OR_URL_PATTERNS.some((pattern) =>
    [...value.matchAll(pattern)].some((match) => {
      const matchIndex = match.index ?? -1;
      if (matchIndex < 0) return false;

      const matchEnd = matchIndex + match[0].length;
      return index >= matchIndex && index + tokenLength <= matchEnd;
    }),
  );

const extractCodeTokens = (
  value: string,
  source: "subject" | "body" = "body",
  relatedSubject = "",
) => {
  const matches = new Map<string, number>();

  for (const match of value.matchAll(CODE_TOKEN_PATTERN)) {
    const token = match[0];
    const index = match.index ?? 0;
    const previous = value[index - 1];
    const next = value[index + token.length];
    if (!isSafeBoundary(previous) || !isSafeBoundary(next)) continue;

    const normalized = normalizeVerificationCode(token);
    if (!normalized) continue;
    if (isLikelyHyphenatedLabelToken(normalized)) continue;
    const isStandaloneLineToken = isStandaloneTokenLine(value, token, index);
    const contextRadius = getTokenContextRadius(normalized);

    const context = value.slice(
      Math.max(0, index - contextRadius),
      index + token.length + contextRadius,
    );
    const hasExplicitAssignmentCue = hasExplicitCodeAssignmentCue(value, index);
    const hasStandaloneSubjectCue =
      source === "body" &&
      isStandaloneLineToken &&
      hasStandaloneBodySubjectCue(relatedSubject);
    if (isPureAlphaHyphenatedCode(normalized)) {
      if (source === "subject" && !hasExplicitAssignmentCue) {
        continue;
      }
      if (
        source === "body" &&
        !hasExplicitAssignmentCue &&
        !(
          hasStandaloneValidationCodeSignal(context) && isStandaloneLineToken
        ) &&
        !hasStandaloneSubjectCue
      ) {
        continue;
      }
    }
    if (isEmailOrUrlSegment(value, index, token.length)) continue;
    if (normalized.includes("-") && (previous === "-" || next === "-")) {
      continue;
    }
    if (
      normalized.includes("-") &&
      !hasVerificationContextSignal(context) &&
      !(hasStandaloneValidationCodeSignal(context) && isStandaloneLineToken) &&
      !hasStandaloneSubjectCue &&
      !hasExplicitAssignmentCue
    ) {
      continue;
    }
    matches.set(normalized, index);
  }

  return [...matches.entries()].map(([token, index]) => ({ token, index }));
};

const findVerificationCodeInSource = (
  value: string,
  code: string,
  source: "subject" | "body",
  relatedSubject = "",
) =>
  extractCodeTokens(value, source, relatedSubject).find(({ token }) =>
    compareVerificationCodes(token, code),
  )?.token ?? null;

const scoreToken = (
  value: string,
  token: string,
  index: number,
  source: "subject" | "body",
  relatedSubject = "",
) => {
  const isStandaloneLineToken = isStandaloneTokenLine(value, token, index);
  const contextRadius = getTokenContextRadius(token);
  const leadingContext = value.slice(Math.max(0, index - 24), index);
  const hasExplicitAssignmentCue = hasExplicitCodeAssignmentCue(value, index);
  const window = value
    .slice(
      Math.max(0, index - contextRadius),
      Math.min(value.length, index + token.length + contextRadius),
    )
    .toLowerCase();
  const hasContextSignal = hasVerificationContextSignal(window);
  let score = /^\d+$/.test(token) ? 120 : 95;

  if (source === "subject") score += 40;
  if (findKeywordHit(window)) score += 120;
  if (hasContextSignal) score += 40;
  if (hasExplicitAssignmentCue) score += 80;
  if (
    token.includes("-") &&
    hasStandaloneValidationCodeSignal(window) &&
    isStandaloneLineToken
  ) {
    score += 70;
  }
  if (
    source === "body" &&
    token.includes("-") &&
    isStandaloneLineToken &&
    hasStandaloneBodySubjectCue(relatedSubject)
  ) {
    score += 80;
  }
  if (/^(?:code|otp|passcode)\d+[a-z0-9]*$/.test(token)) score -= 220;
  if (REFERENCE_LABEL_PATTERN.test(leadingContext)) score -= 160;
  if (/^\d{6}$/.test(token)) score += 15;
  if (/^(19|20)\d{2}$/.test(token) && !findKeywordHit(window)) score -= 160;
  if (/kb|mb|gb|am|pm/.test(window)) score -= 60;

  return {
    score,
    hasContextSignal,
    hasExplicitAssignmentCue,
  };
};

const uniqueStrings = (values: string[]) => [...new Set(values)];

const detectWithRules = (
  rawValue: string | null | undefined,
  source: "subject" | "body",
  relatedSubject = "",
): RuleDetection => {
  const value =
    source === "body"
      ? normalizeBodyText(rawValue)
      : normalizeWhitespace(rawValue ?? "");
  if (!value) {
    return { match: null, candidates: [], ambiguous: false, hadSignal: false };
  }

  const directMatches = uniqueStrings(
    DIRECT_CODE_PATTERNS.flatMap((patternConfig) => {
      const pureAlphaHyphenatedOnly =
        "pureAlphaHyphenatedOnly" in patternConfig &&
        patternConfig.pureAlphaHyphenatedOnly;

      return [...value.matchAll(patternConfig.pattern)]
        .flatMap((match) => {
          const token = match[1];
          const normalized = normalizeVerificationCode(token);
          if (!normalized) return [];
          if (
            pureAlphaHyphenatedOnly &&
            !isPureAlphaHyphenatedCode(normalized)
          ) {
            return [];
          }

          const wholeMatch = match[0] ?? "";
          const matchIndex = match.index ?? 0;
          const tokenOffset = wholeMatch.lastIndexOf(token);
          const tokenIndex =
            tokenOffset >= 0 ? matchIndex + tokenOffset : matchIndex;
          if (isPureAlphaHyphenatedCode(normalized)) {
            if (
              isLikelyHyphenatedLabelToken(normalized) ||
              (patternConfig.direction === "forward" &&
                !hasExplicitCodeAssignmentCue(value, tokenIndex))
            ) {
              return [];
            }
          }
          if (isEmailOrUrlSegment(value, tokenIndex, token.length)) {
            return [];
          }

          return [normalized];
        })
        .filter((token): token is string => Boolean(token));
    }),
  );

  if (directMatches.length === 1) {
    return {
      match: {
        code: directMatches[0],
        source,
        method: "rules",
      },
      candidates: directMatches,
      ambiguous: false,
      hadSignal: true,
    };
  }

  if (directMatches.length > 1) {
    return {
      match: null,
      candidates: directMatches,
      ambiguous: true,
      hadSignal: true,
    };
  }

  const scored = extractCodeTokens(value, source, relatedSubject)
    .filter(({ token, index }) => {
      if (!(source === "subject" && isPureAlphaHyphenatedCode(token))) {
        return true;
      }

      return hasExplicitCodeAssignmentCue(value, index);
    })
    .map(({ token, index }) => ({
      token,
      ...scoreToken(value, token, index, source, relatedSubject),
    }))
    .sort((left, right) => right.score - left.score);

  const candidates = uniqueStrings(scored.map(({ token }) => token));
  const best = scored[0];
  const second = scored.find(({ token }) => token !== best?.token);
  const hasSignal =
    directMatches.length > 0 ||
    scored.some(({ hasContextSignal }) => hasContextSignal) ||
    hasVerificationContextSignal(value);

  if (!best || best.score < 150) {
    return {
      match: null,
      candidates,
      ambiguous: false,
      hadSignal: hasSignal,
    };
  }

  if (
    source === "subject" &&
    !best.hasContextSignal &&
    !best.hasExplicitAssignmentCue
  ) {
    return {
      match: null,
      candidates,
      ambiguous: false,
      hadSignal: hasSignal,
    };
  }

  if (second && best.score - second.score < 25) {
    return {
      match: null,
      candidates,
      ambiguous: true,
      hadSignal: true,
    };
  }

  return {
    match: {
      code: best.token,
      source,
      method: "rules",
    },
    candidates,
    ambiguous: false,
    hadSignal: hasSignal,
  };
};

const buildRelevantBodySnippet = (value: string, relatedSubject = "") => {
  if (!value) return "";

  const lines = value
    .split(/\r?\n/)
    .map((line) => normalizeWhitespace(line))
    .filter(Boolean);
  const relevant = lines.filter(
    (line) =>
      findKeywordHit(line) ||
      extractCodeTokens(line, "body", relatedSubject).length > 0,
  );
  const snippet = (relevant.length > 0 ? relevant : lines)
    .slice(0, 8)
    .join("\n");

  return snippet.slice(0, 1200);
};

const resolveAiText = (value: unknown): string | null => {
  if (!value) return null;
  if (typeof value === "string") return value;
  if (typeof value !== "object") return null;

  const candidate = value as {
    response?: unknown;
    completion?: unknown;
  };

  if (typeof candidate.response === "string") return candidate.response;
  if (typeof candidate.completion === "string") return candidate.completion;

  if (
    candidate.response &&
    typeof candidate.response === "object" &&
    "completion" in candidate.response &&
    typeof (candidate.response as { completion?: unknown }).completion ===
      "string"
  ) {
    return (candidate.response as { completion: string }).completion;
  }

  if (candidate.response && typeof candidate.response === "object") {
    return JSON.stringify(candidate.response);
  }

  return null;
};

const resolveNextUtcMidnightIso = () => {
  const next = new Date();
  next.setUTCHours(24, 0, 0, 0);
  return next.toISOString();
};

export const resolveNextVerificationRetryAtIso = (
  baseTime = Date.now(),
  backoffMs = MESSAGE_VERIFICATION_RETRY_BACKOFF_MS,
) => new Date(baseTime + backoffMs).toISOString();

const extractErrorStatus = (error: unknown) => {
  if (!error || typeof error !== "object") return null;

  for (const key of ["status", "statusCode", "httpCode"] as const) {
    const value = (error as Record<string, unknown>)[key];
    if (typeof value === "number") return value;
    if (typeof value === "string" && /^\d+$/.test(value)) return Number(value);
  }

  return null;
};

const shouldPauseWorkersAi = (error: unknown) => {
  const status = extractErrorStatus(error);
  const message = error instanceof Error ? error.message : String(error ?? "");

  return (
    status === 429 &&
    (message.includes("3036") ||
      /daily free allocation|10,000 neurons|account limited/i.test(message))
  );
};

const extractRetryAfterValue = (error: unknown) => {
  if (!error || typeof error !== "object") return null;

  for (const key of ["retryAfter", "retry_after"] as const) {
    const value = (error as Record<string, unknown>)[key];
    if (typeof value === "string" || typeof value === "number") {
      return String(value);
    }
  }

  const headers = (error as Record<string, unknown>).headers;
  if (headers && typeof headers === "object") {
    if (
      "get" in headers &&
      typeof (headers as { get?: unknown }).get === "function"
    ) {
      const value = (
        headers as { get: (name: string) => string | null | undefined }
      ).get("retry-after");
      if (value) return value;
    }

    for (const key of ["retry-after", "Retry-After"] as const) {
      const value = (headers as Record<string, unknown>)[key];
      if (typeof value === "string" || typeof value === "number") {
        return String(value);
      }
    }
  }

  return null;
};

const resolveActiveIso = (...values: Array<string | null>) =>
  values.reduce<string | null>((latest, value) => {
    if (!value) return latest;

    const timestamp = new Date(value).getTime();
    if (Number.isNaN(timestamp) || timestamp <= Date.now()) {
      return latest;
    }

    if (!latest) return new Date(timestamp).toISOString();
    return timestamp > new Date(latest).getTime()
      ? new Date(timestamp).toISOString()
      : latest;
  }, null);

const getWorkersAiPausedUntil = async (env: WorkerEnv) =>
  resolveActiveIso(
    await getRuntimeStateValue(env, WORKERS_AI_PAUSED_UNTIL_KEY),
    await getRuntimeStateValue(env, WORKERS_AI_RATE_LIMITED_UNTIL_KEY),
  );

const pauseWorkersAiUntilReset = async (env: WorkerEnv, error: unknown) => {
  const retryAfter = resolveNextUtcMidnightIso();
  await setRuntimeStateValue(env, WORKERS_AI_PAUSED_UNTIL_KEY, retryAfter);
  logOperationalEvent("warn", "workers_ai.rate_limit.daily_pause", {
    retryAfter,
    reason: error instanceof Error ? error.message : String(error ?? "unknown"),
  });
  return retryAfter;
};

const pauseWorkersAiTemporarily = async (env: WorkerEnv, error: unknown) => {
  const retryAfterSeconds = resolveRetryAfterSeconds(
    extractRetryAfterValue(error),
    MESSAGE_VERIFICATION_RETRY_BACKOFF_MS / 1000,
  );
  const retryAfter = resolveRetryAfterIso(retryAfterSeconds);
  await setRuntimeStateValue(
    env,
    WORKERS_AI_RATE_LIMITED_UNTIL_KEY,
    retryAfter,
  );
  logOperationalEvent("warn", "workers_ai.rate_limit.temporary_pause", {
    retryAfter,
    retryAfterSeconds,
    reason: error instanceof Error ? error.message : String(error ?? "unknown"),
  });
  return retryAfter;
};

const maybeVerifyWithAi = async (
  env: WorkerEnv,
  subject: string,
  body: string,
  candidates: string[],
): Promise<VerificationDetectionResult> => {
  if (!env.AI) {
    return {
      verification: null,
      shouldRetry: false,
      retryAfter: null,
    };
  }
  const pausedUntil = await getWorkersAiPausedUntil(env);
  if (pausedUntil) {
    return {
      verification: null,
      shouldRetry: true,
      retryAfter: pausedUntil,
    };
  }

  const model = (env.WORKERS_AI_MODEL?.trim() ||
    DEFAULT_WORKERS_AI_MODEL) as Parameters<Ai["run"]>[0];
  const responseFormat = {
    type: "json_schema",
    json_schema: {
      type: "object",
      properties: {
        verdict: { type: "string", enum: ["match", "none"] },
        code: { type: ["string", "null"] },
        source: { type: "string", enum: ["subject", "body", "none"] },
      },
      required: ["verdict", "code", "source"],
      additionalProperties: false,
    },
  } as const;

  try {
    const result = await env.AI.run(model, {
      messages: [
        {
          role: "system",
          content:
            "You extract verification codes from transactional emails. Use only the provided subject/body snippets and candidate list. Never invent a code. Return JSON only.",
        },
        {
          role: "user",
          content: [
            `Subject: ${subject || "(empty)"}`,
            `Body snippet: ${body || "(empty)"}`,
            `Candidates: ${candidates.length > 0 ? candidates.join(", ") : "none"}`,
            "Choose a single verification code if and only if one is clearly the login/verification/OTP code. Prefer subject if both subject and body contain valid codes. Reply with verdict=none when uncertain.",
          ].join("\n\n"),
        },
      ],
      response_format: responseFormat,
    });

    const aiText = resolveAiText(result);
    if (!aiText) {
      return {
        verification: null,
        shouldRetry: true,
        retryAfter: resolveNextVerificationRetryAtIso(),
      };
    }

    const parsed = aiDecisionSchema.safeParse(JSON.parse(aiText));
    if (!parsed.success) {
      return createRetryableVerificationFallback();
    }

    if (parsed.data.verdict !== "match") {
      return {
        verification: null,
        shouldRetry: false,
        retryAfter: null,
      };
    }

    const normalizedCode = normalizeVerificationCode(parsed.data.code);
    if (!normalizedCode || parsed.data.source === "none") {
      return {
        verification: null,
        shouldRetry: false,
        retryAfter: null,
      };
    }

    const sourceText = parsed.data.source === "subject" ? subject : body;
    const sourceCode = findVerificationCodeInSource(
      sourceText,
      normalizedCode,
      parsed.data.source,
      subject,
    );
    if (!sourceCode) {
      return {
        verification: null,
        shouldRetry: false,
        retryAfter: null,
      };
    }

    return {
      verification: {
        code: sourceCode,
        source: parsed.data.source,
        method: "ai",
      },
      shouldRetry: false,
      retryAfter: null,
    };
  } catch (error) {
    if (shouldPauseWorkersAi(error)) {
      const retryAfter = await pauseWorkersAiUntilReset(env, error);
      return {
        verification: null,
        shouldRetry: true,
        retryAfter,
      };
    }

    if (extractErrorStatus(error) === 429) {
      const retryAfter = await pauseWorkersAiTemporarily(env, error);
      return {
        verification: null,
        shouldRetry: true,
        retryAfter,
      };
    }

    if (error instanceof ApiError || error instanceof Error) {
      const message = error.message.toLowerCase();
      if (message.includes("json mode couldn't be met")) {
        return {
          verification: null,
          shouldRetry: true,
          retryAfter: resolveNextVerificationRetryAtIso(),
        };
      }
    }

    return {
      verification: null,
      shouldRetry: true,
      retryAfter: resolveNextVerificationRetryAtIso(),
    };
  }
};

export const createRetryableVerificationFallback = (
  retryAfter = resolveNextVerificationRetryAtIso(),
): VerificationDetectionResult => ({
  verification: null,
  shouldRetry: true,
  retryAfter,
});

export const resolveVerificationDetectionForMessage = async (
  env: WorkerEnv,
  input: {
    subject: string | null | undefined;
    text: string | null | undefined;
    html: string | null | undefined;
  },
): Promise<VerificationDetectionResult> => {
  const subject = normalizeWhitespace(input.subject ?? "");
  const textBody = normalizeBodyText(input.text);
  const htmlBody = stripHtmlToText(input.html);
  const bodyVariants = [textBody];
  if (htmlBody && htmlBody !== textBody) {
    bodyVariants.push(htmlBody);
  }

  const subjectDetection = detectWithRules(subject, "subject");
  if (subjectDetection.match) {
    return {
      verification: subjectDetection.match,
      shouldRetry: false,
      retryAfter: null,
    };
  }

  const bodyDetections = bodyVariants.map((value) =>
    detectWithRules(value, "body", subject),
  );
  const bodyMatch = bodyDetections.find((detection) => detection.match)?.match;
  if (bodyMatch) {
    return {
      verification: bodyMatch,
      shouldRetry: false,
      retryAfter: null,
    };
  }

  const candidateList = uniqueStrings([
    ...subjectDetection.candidates,
    ...bodyDetections.flatMap((detection) => detection.candidates),
  ]);
  const shouldUseAi =
    subjectDetection.ambiguous ||
    bodyDetections.some((detection) => detection.ambiguous) ||
    subjectDetection.hadSignal ||
    bodyDetections.some((detection) => detection.hadSignal);

  if (!shouldUseAi) {
    return {
      verification: null,
      shouldRetry: false,
      retryAfter: null,
    };
  }

  return maybeVerifyWithAi(
    env,
    subject,
    buildRelevantBodySnippet(bodyVariants.filter(Boolean).join("\n"), subject),
    candidateList,
  );
};

export const detectVerificationForMessage = async (
  env: WorkerEnv,
  input: {
    subject: string | null | undefined;
    text: string | null | undefined;
    html: string | null | undefined;
  },
): Promise<StoredVerification | null> =>
  (await resolveVerificationDetectionForMessage(env, input)).verification;

export const listMessageIdsPendingVerification = async (
  env: WorkerEnv,
  config: Pick<RuntimeConfig, "CLEANUP_BATCH_SIZE">,
) => {
  const db = getDb(env);
  const limit = Math.min(
    config.CLEANUP_BATCH_SIZE,
    MESSAGE_VERIFICATION_BACKFILL_BATCH_SIZE,
  );
  const rows = await db
    .select({ id: messages.id })
    .from(messages)
    .where(
      and(
        isNull(messages.verificationCheckedAt),
        or(
          isNull(messages.verificationRetryAfter),
          lte(messages.verificationRetryAfter, nowIso()),
        ),
      ),
    )
    .orderBy(asc(messages.receivedAt))
    .limit(limit);

  return rows.map((row) => row.id);
};

export const backfillMessageVerification = async (
  env: WorkerEnv,
  config: Pick<RuntimeConfig, "CLEANUP_BATCH_SIZE">,
) => {
  const db = getDb(env);
  const messageIds = await listMessageIdsPendingVerification(env, config);
  let processed = 0;

  for (const messageId of messageIds) {
    const rows = await db
      .select({
        id: messages.id,
        subject: messages.subject,
        parsedR2Key: messages.parsedR2Key,
      })
      .from(messages)
      .where(
        and(eq(messages.id, messageId), isNull(messages.verificationCheckedAt)),
      )
      .limit(1);
    const message = rows[0];
    if (!message) continue;

    const parsedObject = await env.MAIL_BUCKET.get(message.parsedR2Key);
    if (!parsedObject) {
      await db
        .update(messages)
        .set({
          verificationCode: null,
          verificationSource: null,
          verificationMethod: null,
          verificationCheckedAt: nowIso(),
          verificationRetryAfter: null,
        })
        .where(eq(messages.id, message.id));
      processed += 1;
      continue;
    }

    let detection: VerificationDetectionResult = {
      verification: null,
      shouldRetry: false,
      retryAfter: null,
    };
    try {
      const parsedText = await parsedObject.text();
      const parsedPayload = JSON.parse(parsedText) as {
        html: string | null;
        text: string | null;
      };
      detection = await resolveVerificationDetectionForMessage(env, {
        subject: message.subject,
        text: parsedPayload.text,
        html: parsedPayload.html,
      });
    } catch {
      detection = createRetryableVerificationFallback();
    }

    await db
      .update(messages)
      .set({
        verificationCode: detection.verification?.code ?? null,
        verificationSource: detection.verification?.source ?? null,
        verificationMethod: detection.verification?.method ?? null,
        verificationCheckedAt: detection.shouldRetry ? null : nowIso(),
        verificationRetryAfter: detection.shouldRetry
          ? (detection.retryAfter ?? resolveNextVerificationRetryAtIso())
          : null,
      })
      .where(eq(messages.id, message.id));
    processed += 1;
  }

  return processed;
};
