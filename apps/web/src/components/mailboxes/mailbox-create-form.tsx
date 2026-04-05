import { mailboxLocalPartRegex, mailboxSubdomainRegex } from "@cf-mail/shared";
import { zodResolver } from "@hookform/resolvers/zod";
import { LoaderCircle } from "lucide-react";
import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

const mailboxFieldClassName =
  "flex h-10 w-full rounded-lg border border-input bg-muted/40 px-3 text-sm outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20 disabled:cursor-not-allowed disabled:opacity-60";

const createMailboxSchema = z.object({
  localPart: z
    .string()
    .max(32)
    .regex(mailboxLocalPartRegex, "仅支持小写字母、数字和短横线")
    .optional()
    .or(z.literal("")),
  subdomain: z
    .string()
    .max(190)
    .regex(mailboxSubdomainRegex, "支持多级子域，例如 team 或 inbox.team")
    .optional()
    .or(z.literal("")),
  rootDomain: z.string().optional().or(z.literal("")),
  expiresInMinutes: z
    .number()
    .int()
    .min(5)
    .max(24 * 60),
});

type CreateMailboxValues = z.infer<typeof createMailboxSchema>;

const pickRandomDomain = (domains: string[]) => {
  if (domains.length === 0) return "";
  const index = Math.floor(Math.random() * domains.length);
  return domains[index] ?? "";
};

export const MailboxCreateForm = ({
  onSubmit,
  onCancel,
  isPending = false,
  domains = [],
  defaultTtlMinutes,
  maxTtlMinutes,
  isMetaLoading = false,
  submitError = null,
  autoFocusFirstField = false,
  className,
  onDomainPreviewChange,
}: {
  onSubmit: (values: {
    localPart?: string;
    subdomain?: string;
    rootDomain?: string;
    expiresInMinutes: number;
  }) => Promise<void> | void;
  onCancel?: () => void;
  isPending?: boolean;
  domains?: string[];
  defaultTtlMinutes: number;
  maxTtlMinutes: number;
  isMetaLoading?: boolean;
  submitError?: string | null;
  autoFocusFirstField?: boolean;
  className?: string;
  onDomainPreviewChange?: (rootDomain: string) => void;
}) => {
  const form = useForm<CreateMailboxValues>({
    resolver: zodResolver(createMailboxSchema),
    defaultValues: {
      localPart: "",
      subdomain: "",
      rootDomain: pickRandomDomain(domains),
      expiresInMinutes: defaultTtlMinutes,
    },
  });

  const selectedRootDomain = form.watch("rootDomain");

  useEffect(() => {
    form.setValue("expiresInMinutes", defaultTtlMinutes, {
      shouldDirty: false,
    });
  }, [defaultTtlMinutes, form]);

  useEffect(() => {
    const nextDomain = selectedRootDomain;
    if (domains.length === 0) {
      if (nextDomain) {
        form.setValue("rootDomain", "", {
          shouldDirty: false,
          shouldTouch: false,
          shouldValidate: false,
        });
      }
      return;
    }
    if (nextDomain && domains.includes(nextDomain)) return;
    form.setValue("rootDomain", pickRandomDomain(domains), {
      shouldDirty: false,
      shouldTouch: false,
      shouldValidate: false,
    });
  }, [domains, form, selectedRootDomain]);

  useEffect(() => {
    onDomainPreviewChange?.(selectedRootDomain || domains[0] || "example.com");
  }, [domains, onDomainPreviewChange, selectedRootDomain]);

  return (
    <form
      className={cn("grid gap-4", className)}
      onSubmit={form.handleSubmit((values) =>
        onSubmit({
          localPart: values.localPart || undefined,
          subdomain: values.subdomain || undefined,
          rootDomain: values.rootDomain || undefined,
          expiresInMinutes: values.expiresInMinutes,
        }),
      )}
    >
      <fieldset className="grid gap-4" disabled={isPending}>
        <div
          className={
            domains.length > 0
              ? "grid gap-4 md:grid-cols-3"
              : "grid gap-4 md:grid-cols-2"
          }
        >
          <div className="space-y-2">
            <Label htmlFor="localPart">用户名</Label>
            <Input
              autoFocus={autoFocusFirstField}
              id="localPart"
              placeholder="留空则随机"
              {...form.register("localPart")}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="subdomain">子域名</Label>
            <Input
              id="subdomain"
              placeholder="留空则随机，例如 ops.alpha"
              {...form.register("subdomain")}
            />
          </div>
          {domains.length > 0 ? (
            <div className="space-y-2">
              <Label htmlFor="rootDomain">邮箱域名</Label>
              <select
                id="rootDomain"
                className={mailboxFieldClassName}
                {...form.register("rootDomain")}
              >
                {domains.map((domain) => (
                  <option key={domain} value={domain}>
                    {domain}
                  </option>
                ))}
              </select>
            </div>
          ) : null}
        </div>

        <div className="space-y-2">
          <Label htmlFor="ttl">生命周期（分钟）</Label>
          <Input
            id="ttl"
            max={maxTtlMinutes}
            min={5}
            type="number"
            {...form.register("expiresInMinutes", { valueAsNumber: true })}
          />
        </div>
      </fieldset>

      {submitError ? (
        <p className="text-sm text-destructive" role="alert">
          {submitError}
        </p>
      ) : null}

      <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
        {onCancel ? (
          <Button
            className="w-full sm:w-auto"
            disabled={isPending}
            type="button"
            variant="outline"
            onClick={onCancel}
          >
            取消
          </Button>
        ) : null}
        <Button
          className="w-full sm:w-auto"
          disabled={isPending || isMetaLoading}
          type="submit"
        >
          {isPending ? (
            <>
              <LoaderCircle
                aria-hidden="true"
                className="h-4 w-4 shrink-0 animate-spin"
              />
              创建中…
            </>
          ) : isMetaLoading ? (
            "读取规则中…"
          ) : (
            "创建邮箱"
          )}
        </Button>
      </div>
    </form>
  );
};
