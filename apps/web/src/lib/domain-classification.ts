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

export const classifyMailDomain = (
  mailDomain: string,
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

  if (normalizedMailDomain.endsWith(`.${registrableDomain}`)) {
    const delegatedLabel = normalizedMailDomain.slice(
      0,
      -(registrableDomain.length + 1),
    );

    if (delegatedLabel) {
      return {
        type: "subdomain",
        mailDomain: normalizedMailDomain,
        registrableDomain,
        parentDomain: registrableDomain,
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
