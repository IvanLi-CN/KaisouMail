import { readFileSync } from "node:fs";

const configPath = process.argv[2] ?? "apps/api-worker/wrangler.jsonc";

const uniqueUrls = new Set();

const normalizeUrl = (value) => {
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

  if (parsed.pathname === "/*") {
    parsed.pathname = "";
  }

  if (parsed.pathname.includes("*")) {
    return null;
  }

  parsed.hash = "";
  parsed.search = "";

  const pathname =
    parsed.pathname === "/" ? "" : parsed.pathname.replace(/\/$/, "");
  return `${parsed.origin}${pathname}`;
};

const addUrl = (value) => {
  const normalized = normalizeUrl(value);
  if (normalized) {
    uniqueUrls.add(normalized);
  }
};

addUrl(process.env.VITE_API_BASE_URL);
addUrl(process.env.API_BASE_URL);

const config = JSON.parse(readFileSync(configPath, "utf8"));
const routes = Array.isArray(config?.routes) ? config.routes : [];

for (const route of routes) {
  if (typeof route === "string") {
    addUrl(route);
    continue;
  }

  if (route && typeof route === "object" && typeof route.pattern === "string") {
    addUrl(route.pattern);
  }
}

for (const url of uniqueUrls) {
  console.log(url);
}
