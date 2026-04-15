import { nowIso } from "./crypto";

export type OperationalLogLevel = "info" | "warn" | "error";

type OperationalLogPayload = Record<string, unknown>;

const toSerializable = (value: unknown): unknown => {
  if (value instanceof Error) {
    return {
      name: value.name,
      message: value.message,
      stack: value.stack ?? null,
    };
  }

  if (Array.isArray(value)) {
    return value.map((entry) => toSerializable(entry));
  }

  if (!value || typeof value !== "object") {
    return value ?? null;
  }

  return Object.fromEntries(
    Object.entries(value).map(([key, entry]) => [key, toSerializable(entry)]),
  );
};

export const logOperationalEvent = (
  level: OperationalLogLevel,
  event: string,
  payload: OperationalLogPayload = {},
) => {
  const serializedPayload = toSerializable(payload);
  const entry = {
    timestamp: nowIso(),
    level,
    event,
    ...(serializedPayload &&
    typeof serializedPayload === "object" &&
    !Array.isArray(serializedPayload)
      ? (serializedPayload as Record<string, unknown>)
      : { payload: serializedPayload }),
  };

  try {
    console[level](JSON.stringify(entry));
  } catch {
    console[level](event, entry);
  }
};

export const pickHeaders = (
  headers: Headers,
  names: string[],
): Record<string, string> =>
  names.reduce<Record<string, string>>((acc, name) => {
    const value = headers.get(name);
    if (typeof value === "string" && value.length > 0) {
      acc[name] = value;
    }
    return acc;
  }, {});
