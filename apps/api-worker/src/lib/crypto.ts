const encoder = new TextEncoder();

export const toBase64Url = (input: ArrayBuffer | Uint8Array) => {
  const bytes = input instanceof Uint8Array ? input : new Uint8Array(input);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
};

export const fromBase64Url = (input: string) => {
  const normalized = input.replace(/-/g, "+").replace(/_/g, "/");
  const padded =
    normalized + "=".repeat((4 - (normalized.length % 4 || 4)) % 4);
  const binary = atob(padded);
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
};

export const nowIso = () => new Date().toISOString();
export const randomId = (prefix: string) =>
  `${prefix}_${crypto.randomUUID().replace(/-/g, "")}`;

export const sha256Hex = async (value: string) => {
  const digest = await crypto.subtle.digest("SHA-256", encoder.encode(value));
  return Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
};

export const randomSecret = (bytes = 24) => {
  const array = crypto.getRandomValues(new Uint8Array(bytes));
  return toBase64Url(array);
};

export interface SessionPayload {
  sub: string;
  email: string;
  name: string;
  role: string;
  iat: number;
  exp: number;
}

type ExpiringPayload = {
  iat: number;
  exp: number;
};

export const signPayload = async <T extends ExpiringPayload>(
  payload: T,
  secret: string,
) => {
  const body = toBase64Url(encoder.encode(JSON.stringify(payload)));
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(body));
  return `${body}.${toBase64Url(signature)}`;
};

export const verifyPayload = async <T extends ExpiringPayload>(
  token: string,
  secret: string,
): Promise<T | null> => {
  const [body, signature] = token.split(".");
  if (!body || !signature) return null;
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["verify"],
  );
  const valid = await crypto.subtle.verify(
    "HMAC",
    key,
    fromBase64Url(signature),
    encoder.encode(body),
  );
  if (!valid) return null;
  const payload = JSON.parse(
    new TextDecoder().decode(fromBase64Url(body)),
  ) as T;
  if (Date.now() >= payload.exp * 1000) return null;
  return payload;
};

export const signSession = async (payload: SessionPayload, secret: string) =>
  signPayload(payload, secret);

export const verifySession = async (
  token: string,
  secret: string,
): Promise<SessionPayload | null> =>
  verifyPayload<SessionPayload>(token, secret);
