const input =
  process.env.CF_PAGES_SMOKE_ORIGINS ?? process.argv.slice(2).join(",");

const normalizeOrigin = (value) => {
  if (typeof value !== "string") {
    return { ok: false, reason: "not-a-string" };
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return { ok: false, reason: "empty" };
  }

  const withScheme = /^https?:\/\//i.test(trimmed)
    ? trimmed
    : `https://${trimmed}`;

  let parsed;
  try {
    parsed = new URL(withScheme);
  } catch {
    return { ok: false, reason: "invalid-url", value: trimmed };
  }

  if (!["http:", "https:"].includes(parsed.protocol)) {
    return { ok: false, reason: "invalid-protocol", value: trimmed };
  }

  if (parsed.hostname.includes("*")) {
    return { ok: false, reason: "wildcard-hostname", value: trimmed };
  }

  if (
    parsed.pathname !== "/" ||
    parsed.search ||
    parsed.hash ||
    parsed.username ||
    parsed.password
  ) {
    return { ok: false, reason: "not-an-origin", value: trimmed };
  }

  return { ok: true, origin: parsed.origin };
};

const uniqueOrigins = new Set();
const invalidEntries = [];
for (const candidate of input.split(/[\n,]/)) {
  const normalized = normalizeOrigin(candidate);
  if (normalized.ok) {
    uniqueOrigins.add(normalized.origin);
    continue;
  }

  if (normalized.reason !== "empty") {
    invalidEntries.push(candidate.trim());
  }
}

if (invalidEntries.length > 0) {
  console.error(
    `Invalid CF_PAGES_SMOKE_ORIGINS entries: ${invalidEntries.join(", ")}`,
  );
  process.exit(1);
}

for (const origin of uniqueOrigins) {
  console.log(origin);
}
