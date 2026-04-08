const input =
  process.env.CF_PAGES_SMOKE_ORIGINS ?? process.argv.slice(2).join(",");

const normalizeOrigin = (value) => {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }

  const withScheme = /^https?:\/\//i.test(trimmed)
    ? trimmed
    : `https://${trimmed}`;

  let parsed;
  try {
    parsed = new URL(withScheme);
  } catch {
    return null;
  }

  if (parsed.pathname.includes("*") || parsed.hostname.includes("*")) {
    return null;
  }

  parsed.hash = "";
  parsed.search = "";
  return parsed.origin;
};

const uniqueOrigins = new Set();
for (const candidate of input.split(/[\n,]/)) {
  const normalized = normalizeOrigin(candidate);
  if (normalized) {
    uniqueOrigins.add(normalized);
  }
}

for (const origin of uniqueOrigins) {
  console.log(origin);
}
