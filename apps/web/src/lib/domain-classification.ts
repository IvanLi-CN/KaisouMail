import { getDomain } from "tldts";

export type MailDomainClassification =
  | {
      type: "apex";
      mailDomain: string;
      registrableDomain: string;
      parentDomain: null;
      delegatedLabel: null;
    }
  | {
      type: "subdomain";
      mailDomain: string;
      registrableDomain: string;
      parentDomain: string;
      delegatedLabel: string;
    }
  | {
      type: "unknown";
      mailDomain: string;
      registrableDomain: null;
      parentDomain: null;
      delegatedLabel: null;
    };

const normalizeKnownParentZones = (knownParentZones?: string[]) =>
  [
    ...new Set(
      (knownParentZones ?? []).map((zone) => zone.trim().toLowerCase()),
    ),
  ]
    .filter(Boolean)
    .sort((left, right) => right.length - left.length);

export const classifyMailDomain = (
  mailDomain: string,
  options?: { knownParentZones?: string[] },
): MailDomainClassification => {
  const normalizedMailDomain = mailDomain.trim().toLowerCase();
  if (!normalizedMailDomain) {
    return {
      type: "unknown",
      mailDomain: normalizedMailDomain,
      registrableDomain: null,
      parentDomain: null,
      delegatedLabel: null,
    };
  }

  const registrableDomain = getDomain(normalizedMailDomain, {
    allowPrivateDomains: true,
  });
  if (!registrableDomain) {
    return {
      type: "unknown",
      mailDomain: normalizedMailDomain,
      registrableDomain: null,
      parentDomain: null,
      delegatedLabel: null,
    };
  }

  if (normalizedMailDomain === registrableDomain) {
    return {
      type: "apex",
      mailDomain: normalizedMailDomain,
      registrableDomain,
      parentDomain: null,
      delegatedLabel: null,
    };
  }

  const knownParentZone = normalizeKnownParentZones(options?.knownParentZones)
    .filter((zone) => zone !== normalizedMailDomain)
    .find((zone) => normalizedMailDomain.endsWith(`.${zone}`));
  const parentDomain = knownParentZone ?? registrableDomain;

  if (normalizedMailDomain.endsWith(`.${parentDomain}`)) {
    const delegatedLabel = normalizedMailDomain.slice(
      0,
      -(parentDomain.length + 1),
    );

    if (delegatedLabel) {
      return {
        type: "subdomain",
        mailDomain: normalizedMailDomain,
        registrableDomain,
        parentDomain,
        delegatedLabel,
      };
    }
  }

  return {
    type: "unknown",
    mailDomain: normalizedMailDomain,
    registrableDomain: null,
    parentDomain: null,
    delegatedLabel: null,
  };
};
