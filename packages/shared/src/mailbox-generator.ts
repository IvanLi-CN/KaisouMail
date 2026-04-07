import { mailboxLocalPartRegex, mailboxSubdomainRegex } from "./consts";

export type MailboxRandomSource = () => number;

export const generatedMailboxMaxAttempts = 8;

export const mailboxPreviewExample = {
  localPart: "ava-lin",
  subdomain: "desk.hub",
} as const;

const mailboxExampleSeeds = [
  mailboxPreviewExample,
  {
    localPart: "hello",
    subdomain: "ops.alpha",
  },
] as const;

const personalMailboxFirstNames = [
  "ava",
  "leo",
  "mia",
  "kai",
  "nora",
  "zoe",
  "milo",
  "iris",
  "luca",
  "noah",
] as const;

const personalMailboxLastNames = [
  "lin",
  "park",
  "stone",
  "wren",
  "chen",
  "hart",
  "song",
  "west",
  "reed",
  "lee",
] as const;

const functionalMailboxLocalParts = [
  "hello",
  "updates",
  "contact",
  "support",
  "alerts",
  "notify",
  "status",
  "careers",
  "billing",
  "press",
  "product",
  "welcome",
] as const;

const singleLabelMailboxSubdomains = [
  "mail",
  "relay",
  "desk",
  "hub",
  "post",
  "inbox",
  "notify",
  "status",
  "support",
  "letters",
] as const;

const multiLabelMailboxSubdomains = [
  ["ops", "alpha"],
  ["team", "hub"],
  ["desk", "mail"],
  ["relay", "ops"],
  ["support", "desk"],
  ["status", "mail"],
  ["inbox", "team"],
  ["post", "hub"],
] as const;

const fallbackMailboxLocalParts = [
  "hello",
  "contact",
  "updates",
  "notify",
] as const;

const fallbackMailboxSubdomains = [
  ["mail"],
  ["relay"],
  ["desk", "team"],
  ["ops", "hub"],
] as const;

const mailboxLocalPartMaxLength = 32;
const mailboxSubdomainLabelMaxLength = 32;
const digits = "0123456789";
const pickPoolItem = <T>(pool: readonly T[], rng: MailboxRandomSource) => {
  const value =
    pool[Math.min(Math.floor(rng() * pool.length), pool.length - 1)] ?? pool[0];
  if (value === undefined) {
    throw new Error("Mailbox generation pool is empty");
  }
  return value;
};

const randomInt = (min: number, max: number, rng: MailboxRandomSource) =>
  min + Math.floor(rng() * (max - min + 1));

const randomTail = (
  length: number,
  alphabet: string,
  rng: MailboxRandomSource,
) => {
  if (!alphabet) return "";

  return Array.from(
    { length },
    () => alphabet[Math.floor(rng() * alphabet.length)] ?? alphabet[0],
  )
    .join("")
    .toLowerCase();
};

const trimLabelForSuffix = (
  label: string,
  suffix: string,
  maxLength: number,
) => {
  const availableLength = Math.max(1, maxLength - suffix.length);
  const trimmed = label.slice(0, availableLength).replace(/-+$/g, "");
  return `${trimmed || label.slice(0, 1)}${suffix}`;
};

const buildPersonalMailboxLocalPart = (rng: MailboxRandomSource) => {
  const firstName = pickPoolItem(personalMailboxFirstNames, rng);
  const lastName = pickPoolItem(personalMailboxLastNames, rng);

  switch (randomInt(0, 3, rng)) {
    case 0:
      return `${firstName}-${lastName}`;
    case 1:
      return `${firstName}${lastName}`;
    case 2:
      return `${firstName}${randomTail(2, digits, rng)}`;
    default:
      return `${firstName}${lastName.slice(0, 1)}${randomTail(2, digits, rng)}`;
  }
};

const buildFunctionalMailboxLocalPart = (rng: MailboxRandomSource) => {
  const base = pickPoolItem(functionalMailboxLocalParts, rng);

  switch (randomInt(0, 2, rng)) {
    case 0:
      return base;
    case 1:
      return `${base}${randomTail(2, digits, rng)}`;
    default:
      return `${base}-${pickPoolItem(["team", "desk", "ops"], rng)}`;
  }
};

const appendRetrySuffixToLocalPart = (
  localPart: string,
  attempt: number,
  rng: MailboxRandomSource,
) => {
  if (attempt === 0) return localPart;

  const suffixLength = attempt >= generatedMailboxMaxAttempts - 1 ? 4 : 2;

  return trimLabelForSuffix(
    localPart,
    randomTail(suffixLength, digits, rng),
    mailboxLocalPartMaxLength,
  );
};

const appendRetrySuffixToSubdomain = (
  subdomain: string,
  attempt: number,
  rng: MailboxRandomSource,
) => {
  if (attempt === 0) return subdomain;

  const labels = subdomain.split(".");
  const lastLabel = labels.at(-1) ?? "mail";
  const suffixLength = attempt >= generatedMailboxMaxAttempts - 1 ? 4 : 2;

  labels[labels.length - 1] = trimLabelForSuffix(
    lastLabel,
    randomTail(suffixLength, digits, rng),
    mailboxSubdomainLabelMaxLength,
  );

  return labels.join(".");
};

export const generateRealisticMailboxLocalPart = ({
  attempt = 0,
  rng = Math.random,
}: {
  attempt?: number;
  rng?: MailboxRandomSource;
} = {}) => {
  const base =
    attempt >= generatedMailboxMaxAttempts - 1
      ? pickPoolItem(fallbackMailboxLocalParts, rng)
      : randomInt(0, 9, rng) < 6
        ? buildPersonalMailboxLocalPart(rng)
        : buildFunctionalMailboxLocalPart(rng);

  const candidate = appendRetrySuffixToLocalPart(base, attempt, rng);

  if (mailboxLocalPartRegex.test(candidate)) return candidate;

  return trimLabelForSuffix(
    pickPoolItem(fallbackMailboxLocalParts, rng),
    randomTail(4, digits, rng),
    mailboxLocalPartMaxLength,
  );
};

export const generateRealisticMailboxSubdomain = ({
  attempt = 0,
  rng = Math.random,
}: {
  attempt?: number;
  rng?: MailboxRandomSource;
} = {}) => {
  const base =
    attempt >= generatedMailboxMaxAttempts - 1
      ? pickPoolItem(fallbackMailboxSubdomains, rng).join(".")
      : randomInt(0, 9, rng) < 5
        ? pickPoolItem(singleLabelMailboxSubdomains, rng)
        : pickPoolItem(multiLabelMailboxSubdomains, rng).join(".");

  const candidate = appendRetrySuffixToSubdomain(base, attempt, rng);

  if (mailboxSubdomainRegex.test(candidate)) return candidate;

  const fallback = pickPoolItem(fallbackMailboxSubdomains, rng);
  const [head, ...tail] = fallback;
  const suffix = randomTail(4, digits, rng);
  return [
    head,
    ...tail.slice(0, -1),
    trimLabelForSuffix(
      tail.at(-1) ?? "mail",
      suffix,
      mailboxSubdomainLabelMaxLength,
    ),
  ].join(".");
};

export const buildRealisticMailboxAddressExample = (rootDomain: string) =>
  `${mailboxPreviewExample.localPart}@${mailboxPreviewExample.subdomain}.${rootDomain}`;

export const buildRealisticMailboxAddressExamples = (rootDomains: string[]) =>
  rootDomains
    .slice(0, 2)
    .flatMap((rootDomain) =>
      mailboxExampleSeeds.map(
        (seed) => `${seed.localPart}@${seed.subdomain}.${rootDomain}`,
      ),
    );
