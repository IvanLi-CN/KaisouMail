import { zodResolver } from "@hookform/resolvers/zod";
import {
  mailboxLocalPartRegex,
  mailboxSubdomainRegex,
} from "@kaisoumail/shared";
import { LoaderCircle } from "lucide-react";
import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { RANDOM_ROOT_DOMAIN_OPTION_LABEL } from "@/components/mailboxes/mailbox-create-preview";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

const mailboxFieldClassName =
  "flex h-10 w-full rounded-lg border border-input bg-muted/40 px-3 text-sm outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20 disabled:cursor-not-allowed disabled:opacity-60";
const mailboxAddressSegmentClassName = "min-w-0 flex-1";

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
  onDomainPreviewChange?: (rootDomain?: string) => void;
}) => {
  const form = useForm<CreateMailboxValues>({
    resolver: zodResolver(createMailboxSchema),
    defaultValues: {
      localPart: "",
      subdomain: "",
      rootDomain: "",
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
    if (!nextDomain) return;
    if (domains.includes(nextDomain)) return;
    form.setValue("rootDomain", "", {
      shouldDirty: false,
      shouldTouch: false,
      shouldValidate: false,
    });
  }, [domains, form, selectedRootDomain]);

  useEffect(() => {
    onDomainPreviewChange?.(selectedRootDomain || undefined);
  }, [onDomainPreviewChange, selectedRootDomain]);

  return (
    <form
      className={cn("grid gap-4", className)}
      onSubmit={form.handleSubmit((values) =>
        onSubmit({
          ...(values.localPart ? { localPart: values.localPart } : {}),
          ...(values.subdomain ? { subdomain: values.subdomain } : {}),
          ...(values.rootDomain ? { rootDomain: values.rootDomain } : {}),
          expiresInMinutes: values.expiresInMinutes,
        }),
      )}
    >
      <fieldset className="grid gap-4" disabled={isPending}>
        <div className="space-y-2">
          <Label>邮箱地址</Label>
          <div className="rounded-xl border border-border bg-muted/15 p-3">
            <div className="flex flex-col gap-2 md:flex-row md:items-center">
              <div className={mailboxAddressSegmentClassName}>
                <Label className="sr-only" htmlFor="localPart">
                  用户名
                </Label>
                <Input
                  autoFocus={autoFocusFirstField}
                  aria-label="用户名"
                  id="localPart"
                  placeholder="用户名"
                  {...form.register("localPart")}
                />
              </div>
              <span
                aria-hidden="true"
                className="hidden shrink-0 text-sm font-semibold text-muted-foreground md:inline"
              >
                @
              </span>
              <div className={mailboxAddressSegmentClassName}>
                <Label className="sr-only" htmlFor="subdomain">
                  子域名
                </Label>
                <Input
                  aria-label="子域名"
                  id="subdomain"
                  placeholder="子域名"
                  {...form.register("subdomain")}
                />
              </div>
              {domains.length > 0 ? (
                <>
                  <span
                    aria-hidden="true"
                    className="hidden shrink-0 text-sm font-semibold text-muted-foreground md:inline"
                  >
                    .
                  </span>
                  <div
                    className={cn(
                      mailboxAddressSegmentClassName,
                      "md:max-w-[14rem]",
                    )}
                  >
                    <Label className="sr-only" htmlFor="rootDomain">
                      邮箱域名
                    </Label>
                    <select
                      aria-label="邮箱域名"
                      id="rootDomain"
                      className={mailboxFieldClassName}
                      {...form.register("rootDomain")}
                    >
                      <option value="">
                        {RANDOM_ROOT_DOMAIN_OPTION_LABEL}
                      </option>
                      {domains.map((domain) => (
                        <option key={domain} value={domain}>
                          {domain}
                        </option>
                      ))}
                    </select>
                  </div>
                </>
              ) : null}
            </div>
          </div>
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
