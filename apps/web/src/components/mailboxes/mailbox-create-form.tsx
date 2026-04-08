import {
  buildMailboxAddress,
  mailboxLocalPartRegex,
  mailboxSubdomainRegex,
  normalizeMailboxAddress,
  normalizeMailboxLabel,
  normalizeRootDomain,
  type ParsedMailboxAddress,
  parseMailboxAddressAgainstDomains,
} from "@kaisoumail/shared";
import { LoaderCircle } from "lucide-react";
import { type ClipboardEvent, useEffect, useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import {
  type MailboxCreateInputMode,
  type MailboxCreatePreviewState,
  RANDOM_ROOT_DOMAIN_OPTION_LABEL,
} from "@/components/mailboxes/mailbox-create-preview";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

const mailboxFieldClassName =
  "flex h-10 w-full rounded-lg border border-input bg-muted/40 px-3 text-sm outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20 disabled:cursor-not-allowed disabled:opacity-60";
const mailboxAddressSegmentClassName = "min-w-0 flex-1";
const segmentedModeLabel = "分段输入";
const fullAddressModeLabel = "完整邮箱地址";
const resolvePasteSuggestionMessage =
  "检测到完整邮箱地址，请先选择切换输入方式，或保留这次原始粘贴";

type CreateMailboxValues = {
  localPart: string;
  subdomain: string;
  rootDomain: string;
  address: string;
  expiresInMinutes: number;
};

type SegmentFieldName = "localPart" | "subdomain";

type PasteSuggestionState = {
  address: string;
  parsed: ParsedMailboxAddress;
  field: SegmentFieldName;
  restoreValue: string;
};

const normalizeOptionalValue = (value: string) => {
  const normalized = normalizeMailboxLabel(value);
  return normalized || "";
};

const buildSupportedMailboxAddressFromSegments = ({
  localPart,
  subdomain,
  rootDomain,
  domains,
}: {
  localPart: string;
  subdomain: string;
  rootDomain: string;
  domains: string[];
}) => {
  const normalizedLocalPart = normalizeOptionalValue(localPart);
  const normalizedSubdomain = normalizeOptionalValue(subdomain);
  const normalizedRootDomain = normalizeRootDomain(rootDomain);

  if (!normalizedLocalPart || !normalizedSubdomain || !normalizedRootDomain) {
    return null;
  }
  if (!domains.includes(normalizedRootDomain)) return null;
  if (!mailboxLocalPartRegex.test(normalizedLocalPart)) return null;
  if (!mailboxSubdomainRegex.test(normalizedSubdomain)) return null;

  return buildMailboxAddress(
    normalizedLocalPart,
    normalizedSubdomain,
    normalizedRootDomain,
  );
};

const resolveAddressValidationMessage = (value: string, domains: string[]) => {
  if (!normalizeMailboxAddress(value)) return "请输入完整邮箱地址";

  return domains.length > 0
    ? "请输入当前支持域名下的完整邮箱地址"
    : "当前没有可用域名，暂时无法使用完整邮箱地址输入";
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
  onPreviewChange,
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
  onPreviewChange?: (preview: MailboxCreatePreviewState) => void;
}) => {
  const [inputMode, setInputMode] =
    useState<MailboxCreateInputMode>("segmented");
  const [pasteSuggestion, setPasteSuggestion] =
    useState<PasteSuggestionState | null>(null);
  const normalizedDomains = useMemo(
    () => domains.map((domain) => normalizeRootDomain(domain)),
    [domains],
  );
  const form = useForm<CreateMailboxValues>({
    defaultValues: {
      localPart: "",
      subdomain: "",
      rootDomain: "",
      address: "",
      expiresInMinutes: defaultTtlMinutes,
    },
  });

  const selectedRootDomain = form.watch("rootDomain");
  const localPart = form.watch("localPart");
  const subdomain = form.watch("subdomain");
  const fullAddress = form.watch("address");

  const parsedFullAddress = useMemo(
    () => parseMailboxAddressAgainstDomains(fullAddress, normalizedDomains),
    [fullAddress, normalizedDomains],
  );
  const segmentedAddress = useMemo(
    () =>
      buildSupportedMailboxAddressFromSegments({
        localPart,
        subdomain,
        rootDomain: selectedRootDomain,
        domains: normalizedDomains,
      }),
    [localPart, normalizedDomains, selectedRootDomain, subdomain],
  );

  useEffect(() => {
    form.setValue("expiresInMinutes", defaultTtlMinutes, {
      shouldDirty: false,
    });
  }, [defaultTtlMinutes, form]);

  useEffect(() => {
    const nextDomain = normalizeRootDomain(selectedRootDomain);
    if (!nextDomain) return;
    if (normalizedDomains.includes(nextDomain)) return;
    form.setValue("rootDomain", "", {
      shouldDirty: false,
      shouldTouch: false,
      shouldValidate: false,
    });
  }, [form, normalizedDomains, selectedRootDomain]);

  useEffect(() => {
    onPreviewChange?.(
      inputMode === "address"
        ? {
            mode: "address",
            rootDomain: parsedFullAddress?.rootDomain,
            address: parsedFullAddress?.address,
          }
        : {
            mode: "segmented",
            rootDomain: normalizeRootDomain(selectedRootDomain) || undefined,
          },
    );
  }, [inputMode, onPreviewChange, parsedFullAddress, selectedRootDomain]);

  useEffect(() => {
    if (inputMode === "address" && parsedFullAddress) {
      form.clearErrors("address");
    }
  }, [form, inputMode, parsedFullAddress]);

  const segmentedErrorMessage =
    form.formState.errors.localPart?.message ??
    form.formState.errors.subdomain?.message ??
    null;
  const addressErrorMessage = form.formState.errors.address?.message ?? null;

  const switchToAddressMode = ({
    parsed,
    clearSuggestion = true,
  }: {
    parsed?: ParsedMailboxAddress | null;
    clearSuggestion?: boolean;
  } = {}) => {
    const nextParsed = parsed ?? segmentedAddress;
    if (nextParsed) {
      form.setValue("localPart", nextParsed.localPart, {
        shouldDirty: true,
        shouldTouch: true,
        shouldValidate: false,
      });
      form.setValue("subdomain", nextParsed.subdomain, {
        shouldDirty: true,
        shouldTouch: true,
        shouldValidate: false,
      });
      form.setValue("rootDomain", nextParsed.rootDomain, {
        shouldDirty: true,
        shouldTouch: true,
        shouldValidate: false,
      });
      form.setValue("address", nextParsed.address, {
        shouldDirty: true,
        shouldTouch: true,
        shouldValidate: false,
      });
      form.clearErrors("address");
    } else if (!normalizeMailboxAddress(fullAddress)) {
      form.setValue("address", "", {
        shouldDirty: false,
        shouldTouch: false,
        shouldValidate: false,
      });
    }

    if (clearSuggestion) {
      setPasteSuggestion(null);
    }
    form.clearErrors(["localPart", "subdomain"]);
    setInputMode("address");
  };

  const switchToSegmentedMode = () => {
    if (parsedFullAddress) {
      form.setValue("localPart", parsedFullAddress.localPart, {
        shouldDirty: true,
        shouldTouch: true,
        shouldValidate: false,
      });
      form.setValue("subdomain", parsedFullAddress.subdomain, {
        shouldDirty: true,
        shouldTouch: true,
        shouldValidate: false,
      });
      form.setValue("rootDomain", parsedFullAddress.rootDomain, {
        shouldDirty: true,
        shouldTouch: true,
        shouldValidate: false,
      });
    }

    setPasteSuggestion(null);
    setInputMode("segmented");
    form.clearErrors(["address", "localPart", "subdomain"]);
  };

  const handleSegmentPaste = (
    field: SegmentFieldName,
    event: ClipboardEvent<HTMLInputElement>,
  ) => {
    if (inputMode !== "segmented") return;

    const pastedText = event.clipboardData.getData("text");
    const parsed = parseMailboxAddressAgainstDomains(
      pastedText,
      normalizedDomains,
    );
    if (!parsed) return;

    event.preventDefault();
    setPasteSuggestion({
      address: parsed.address,
      parsed,
      field,
      restoreValue: pastedText,
    });
  };

  const restoreSuggestedPaste = () => {
    if (!pasteSuggestion) return;

    form.setValue(pasteSuggestion.field, pasteSuggestion.restoreValue, {
      shouldDirty: true,
      shouldTouch: true,
      shouldValidate: false,
    });
    form.clearErrors(pasteSuggestion.field);
    setPasteSuggestion(null);
  };

  return (
    <form
      className={cn("grid gap-4", className)}
      onSubmit={form.handleSubmit((values) => {
        if (inputMode === "address") {
          const parsed = parseMailboxAddressAgainstDomains(
            values.address,
            normalizedDomains,
          );
          if (!parsed) {
            form.setError("address", {
              message: resolveAddressValidationMessage(
                values.address,
                normalizedDomains,
              ),
            });
            return;
          }

          return onSubmit({
            localPart: parsed.localPart,
            subdomain: parsed.subdomain,
            rootDomain: parsed.rootDomain,
            expiresInMinutes: values.expiresInMinutes,
          });
        }

        if (pasteSuggestion) {
          form.setError(pasteSuggestion.field, {
            message: resolvePasteSuggestionMessage,
          });
          return;
        }

        const normalizedLocalPart = normalizeOptionalValue(values.localPart);
        const normalizedSubdomain = normalizeOptionalValue(values.subdomain);
        const normalizedRootDomain = normalizeRootDomain(values.rootDomain);

        if (
          normalizedLocalPart &&
          !mailboxLocalPartRegex.test(normalizedLocalPart)
        ) {
          form.setError("localPart", {
            message: "仅支持小写字母、数字和短横线",
          });
          return;
        }
        if (
          normalizedSubdomain &&
          !mailboxSubdomainRegex.test(normalizedSubdomain)
        ) {
          form.setError("subdomain", {
            message: "支持多级子域，例如 team 或 inbox.team",
          });
          return;
        }

        return onSubmit({
          ...(normalizedLocalPart ? { localPart: normalizedLocalPart } : {}),
          ...(normalizedSubdomain ? { subdomain: normalizedSubdomain } : {}),
          ...(normalizedRootDomain ? { rootDomain: normalizedRootDomain } : {}),
          expiresInMinutes: values.expiresInMinutes,
        });
      })}
    >
      <fieldset className="grid gap-4" disabled={isPending}>
        <div className="space-y-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <Label>邮箱地址</Label>
            <fieldset className="flex flex-wrap gap-2">
              <legend className="sr-only">邮箱输入方式</legend>
              <Button
                aria-pressed={inputMode === "segmented"}
                size="sm"
                variant={inputMode === "segmented" ? "secondary" : "ghost"}
                onClick={switchToSegmentedMode}
              >
                {segmentedModeLabel}
              </Button>
              <Button
                aria-pressed={inputMode === "address"}
                size="sm"
                variant={inputMode === "address" ? "secondary" : "ghost"}
                onClick={() => switchToAddressMode()}
              >
                {fullAddressModeLabel}
              </Button>
            </fieldset>
          </div>

          <div className="rounded-xl border border-border bg-muted/15 p-3">
            {inputMode === "address" ? (
              <div className="space-y-2">
                <Label className="sr-only" htmlFor="address">
                  完整邮箱地址
                </Label>
                <Input
                  aria-invalid={Boolean(addressErrorMessage)}
                  aria-label="完整邮箱地址"
                  autoFocus={autoFocusFirstField}
                  className={cn(
                    addressErrorMessage ? "border-destructive" : undefined,
                  )}
                  id="address"
                  placeholder="完整邮箱地址"
                  {...form.register("address")}
                />
                <p className="text-xs leading-5 text-muted-foreground">
                  请输入当前支持域名下的完整邮箱地址，例如
                  <span className="ml-1 font-medium text-foreground">
                    build@ops.alpha.mail.example.net
                  </span>
                  。
                </p>
              </div>
            ) : (
              <div className="flex flex-col gap-2 md:flex-row md:items-center">
                <div className={mailboxAddressSegmentClassName}>
                  <Label className="sr-only" htmlFor="localPart">
                    用户名
                  </Label>
                  <Input
                    aria-invalid={Boolean(form.formState.errors.localPart)}
                    aria-label="用户名"
                    autoFocus={autoFocusFirstField}
                    className={cn(
                      form.formState.errors.localPart
                        ? "border-destructive"
                        : undefined,
                    )}
                    id="localPart"
                    placeholder="用户名"
                    {...form.register("localPart", {
                      validate: (value) => {
                        if (inputMode !== "segmented") return true;
                        const normalizedValue = normalizeOptionalValue(value);
                        if (!normalizedValue) return true;
                        return (
                          mailboxLocalPartRegex.test(normalizedValue) ||
                          "仅支持小写字母、数字和短横线"
                        );
                      },
                    })}
                    onPaste={(event) => handleSegmentPaste("localPart", event)}
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
                    aria-invalid={Boolean(form.formState.errors.subdomain)}
                    aria-label="子域名"
                    className={cn(
                      form.formState.errors.subdomain
                        ? "border-destructive"
                        : undefined,
                    )}
                    id="subdomain"
                    placeholder="子域名"
                    {...form.register("subdomain", {
                      validate: (value) => {
                        if (inputMode !== "segmented") return true;
                        const normalizedValue = normalizeOptionalValue(value);
                        if (!normalizedValue) return true;
                        return (
                          mailboxSubdomainRegex.test(normalizedValue) ||
                          "支持多级子域，例如 team 或 inbox.team"
                        );
                      },
                    })}
                    onPaste={(event) => handleSegmentPaste("subdomain", event)}
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
            )}
          </div>

          {pasteSuggestion ? (
            <div className="rounded-xl border border-primary/40 bg-primary/10 p-4 text-sm">
              <p className="font-medium text-foreground">
                检测到这是当前支持的完整邮箱地址：
                <span className="ml-1 break-all">
                  {pasteSuggestion.address}
                </span>
              </p>
              <p className="mt-1 text-xs leading-5 text-muted-foreground">
                可直接切换到完整邮箱地址输入，并自动帮你填好；如果不切换，也会恢复这次原始粘贴。
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() =>
                    switchToAddressMode({
                      parsed: pasteSuggestion.parsed,
                      clearSuggestion: true,
                    })
                  }
                >
                  切换到完整邮箱地址输入
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={restoreSuggestedPaste}
                >
                  保留当前粘贴
                </Button>
              </div>
            </div>
          ) : null}

          {inputMode === "address" ? (
            addressErrorMessage ? (
              <p className="text-sm text-destructive" role="alert">
                {addressErrorMessage}
              </p>
            ) : null
          ) : segmentedErrorMessage ? (
            <p className="text-sm text-destructive" role="alert">
              {segmentedErrorMessage}
            </p>
          ) : null}
        </div>

        <div className="space-y-2">
          <Label htmlFor="ttl">生命周期（分钟）</Label>
          <Input
            id="ttl"
            max={maxTtlMinutes}
            min={5}
            type="number"
            {...form.register("expiresInMinutes", {
              valueAsNumber: true,
              validate: (value) => {
                if (!Number.isInteger(value)) return "请输入有效的生命周期";
                if (value < 5) return "生命周期不能低于 5 分钟";
                if (value > maxTtlMinutes) {
                  return `生命周期不能超过 ${maxTtlMinutes} 分钟`;
                }
                return true;
              },
            })}
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
