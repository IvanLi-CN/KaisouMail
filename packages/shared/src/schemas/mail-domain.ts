import { z } from "zod";

import { rootDomainRegex } from "../consts";

const normalizeMailDomain = (value: string | undefined) => {
  const normalized = value?.trim().toLowerCase();
  return normalized ? normalized : undefined;
};

const mailDomainValueSchema = z
  .string()
  .trim()
  .toLowerCase()
  .regex(rootDomainRegex);

const canonicalMailDomainSchema = mailDomainValueSchema.describe(
  "Canonical mailbox domain field. Use `mailDomain` for new integrations.",
);

const deprecatedRootDomainAliasSchema = mailDomainValueSchema.describe(
  "Deprecated compatibility alias for `mailDomain`.",
);

type MailDomainInputShape = {
  mailDomain: z.ZodOptional<typeof mailDomainValueSchema>;
  rootDomain: z.ZodOptional<typeof mailDomainValueSchema>;
};

type MailDomainSchema<TShape extends z.ZodRawShape> = z.ZodObject<
  TShape & MailDomainInputShape
>;

type MailDomainRequiredOutput<TShape extends z.ZodRawShape> = z.output<
  z.ZodObject<TShape>
> & {
  mailDomain: string;
  rootDomain: string;
};

type MailDomainOptionalOutput<TShape extends z.ZodRawShape> = z.output<
  z.ZodObject<TShape>
> & {
  mailDomain?: string;
  rootDomain?: string;
};

export function withMailDomainAliases<TShape extends z.ZodRawShape>(
  shape: TShape,
  options: {
    required: true;
    strict?: boolean;
  },
): z.ZodPipe<
  MailDomainSchema<TShape>,
  z.ZodTransform<
    MailDomainRequiredOutput<TShape>,
    z.input<MailDomainSchema<TShape>>
  >
>;

export function withMailDomainAliases<TShape extends z.ZodRawShape>(
  shape: TShape,
  options?: {
    required?: false;
    strict?: boolean;
  },
): z.ZodPipe<
  MailDomainSchema<TShape>,
  z.ZodTransform<
    MailDomainOptionalOutput<TShape>,
    z.input<MailDomainSchema<TShape>>
  >
>;

export function withMailDomainAliases<TShape extends z.ZodRawShape>(
  shape: TShape,
  options?: {
    required?: boolean;
    strict?: boolean;
  },
) {
  const baseShape = {
    ...shape,
    mailDomain: canonicalMailDomainSchema.optional(),
    rootDomain: deprecatedRootDomainAliasSchema.optional(),
  } as TShape & MailDomainInputShape;
  const baseObject = z.object(baseShape);
  const objectSchema = (
    options?.strict ? baseObject.strict() : baseObject
  ) as MailDomainSchema<TShape>;

  const transformed = objectSchema
    .superRefine((value, ctx) => {
      const fields = value as {
        mailDomain?: string;
        rootDomain?: string;
      };
      const mailDomain = normalizeMailDomain(fields.mailDomain);
      const rootDomain = normalizeMailDomain(fields.rootDomain);

      if (options?.required && !mailDomain && !rootDomain) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["mailDomain"],
          message: "Either mailDomain or rootDomain is required",
        });
        return;
      }

      if (mailDomain && rootDomain && mailDomain !== rootDomain) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["mailDomain"],
          message:
            "mailDomain and rootDomain must match when both are provided",
        });
      }
    })
    .transform((value) => {
      const fields = value as {
        mailDomain?: string;
        rootDomain?: string;
      };
      const mailDomain =
        normalizeMailDomain(fields.mailDomain) ??
        normalizeMailDomain(fields.rootDomain);

      if (!mailDomain) {
        return value as MailDomainOptionalOutput<TShape>;
      }

      return {
        ...value,
        mailDomain,
        rootDomain: mailDomain,
      } as MailDomainRequiredOutput<TShape>;
    });

  return transformed;
}
