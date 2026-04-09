import {
  buildMailboxAddress,
  mailboxLocalPartRegex,
  mailboxSubdomainRegex,
  minMailboxTtlMinutes,
  normalizeMailboxAddress,
  normalizeMailboxLabel,
  normalizeRootDomain,
  type ParsedMailboxAddress,
  parseMailboxAddressAgainstDomains,
} from "@kaisoumail/shared";
import { LoaderCircle } from "lucide-react";
import {
  type ClipboardEvent,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useForm } from "react-hook-form";
import {
  type MailboxCreateInputMode,
  type MailboxCreatePreviewState,
  RANDOM_ROOT_DOMAIN_OPTION_LABEL,
} from "@/components/mailboxes/mailbox-create-preview";
import { MailboxTtlControl } from "@/components/mailboxes/mailbox-ttl-control";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Popover,
  PopoverAnchor,
  PopoverContent,
} from "@/components/ui/popover";
import {
  formatMailboxTtl,
  parseMailboxTtlInputWithOptions,
} from "@/lib/mailbox-ttl";
import { cn } from "@/lib/utils";

const mailboxFieldClassName =
  "flex h-10 w-full rounded-lg border border-input bg-muted/40 px-3 text-sm outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20 disabled:cursor-not-allowed disabled:opacity-60";
const mailboxAddressSegmentClassName = "min-w-0 flex-1";
const inputModeSwitcherClassName =
  "inline-flex items-center gap-0.5 rounded-xl border border-white/10 bg-white/5 p-0.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]";
const inputModeButtonClassName =
  "inline-flex h-8 min-w-[3.5rem] items-center justify-center rounded-[10px] px-3 text-xs font-medium transition-[background-color,color,box-shadow] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50";
const inputModeButtonActiveClassName =
  "bg-white/10 text-foreground shadow-[inset_0_1px_0_rgba(255,255,255,0.05),0_1px_2px_rgba(2,6,23,0.32)]";
const inputModeButtonInactiveClassName =
  "text-muted-foreground hover:text-foreground";
const segmentedModeLabel = "分段";
const fullAddressModeLabel = "完整";

type CreateMailboxValues = {
  localPart: string;
  subdomain: string;
  rootDomain: string;
  address: string;
  expiresInMinutes: number | null;
};

type SegmentFieldName = "localPart" | "subdomain";

type PasteSuggestionState = {
  address: string;
  parsed: ParsedMailboxAddress;
  field: SegmentFieldName;
  observedValue: string;
};

type DismissedPasteSuggestionState = {
  field: SegmentFieldName;
  observedValue: string;
};

type SegmentedDraftState = Pick<
  CreateMailboxValues,
  "localPart" | "subdomain" | "rootDomain"
>;

type TtlEditorState = {
  isEditing: boolean;
  draftValue: string;
  hasError: boolean;
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
  minTtlMinutes = minMailboxTtlMinutes,
  maxTtlMinutes,
  supportsUnlimitedTtl = true,
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
    expiresInMinutes: number | null;
  }) => Promise<void> | void;
  onCancel?: () => void;
  isPending?: boolean;
  domains?: string[];
  defaultTtlMinutes: number;
  minTtlMinutes?: number;
  maxTtlMinutes: number;
  supportsUnlimitedTtl?: boolean;
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
  const [dismissedPasteSuggestion, setDismissedPasteSuggestion] =
    useState<DismissedPasteSuggestionState | null>(null);
  const [segmentedDraftBeforeAddressMode, setSegmentedDraftBeforeAddressMode] =
    useState<SegmentedDraftState | null>(null);
  const [ttlEditorState, setTtlEditorState] = useState<TtlEditorState>({
    isEditing: false,
    draftValue: `${defaultTtlMinutes / 60}h`,
    hasError: false,
  });
  const pasteDetectionTimeoutRef = useRef<number | null>(null);
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
            address: normalizeMailboxAddress(fullAddress) || undefined,
          }
        : {
            mode: "segmented",
            rootDomain: normalizeRootDomain(selectedRootDomain) || undefined,
          },
    );
  }, [
    fullAddress,
    inputMode,
    onPreviewChange,
    parsedFullAddress,
    selectedRootDomain,
  ]);

  useEffect(() => {
    if (inputMode === "address" && parsedFullAddress) {
      form.clearErrors("address");
    }
  }, [form, inputMode, parsedFullAddress]);

  useEffect(
    () => () => {
      if (pasteDetectionTimeoutRef.current !== null) {
        window.clearTimeout(pasteDetectionTimeoutRef.current);
      }
    },
    [],
  );

  useEffect(() => {
    if (!pasteSuggestion || inputMode !== "segmented") return;

    const activeValue =
      pasteSuggestion.field === "localPart" ? localPart : subdomain;
    const parsed = parseMailboxAddressAgainstDomains(
      activeValue,
      normalizedDomains,
    );
    if (!parsed || parsed.address !== pasteSuggestion.address) {
      setPasteSuggestion(null);
    }
  }, [inputMode, localPart, normalizedDomains, pasteSuggestion, subdomain]);

  useEffect(() => {
    if (!dismissedPasteSuggestion) return;

    const activeValue =
      dismissedPasteSuggestion.field === "localPart" ? localPart : subdomain;
    if (activeValue !== dismissedPasteSuggestion.observedValue) {
      setDismissedPasteSuggestion(null);
    }
  }, [dismissedPasteSuggestion, localPart, subdomain]);

  const segmentedErrorMessage =
    form.formState.errors.localPart?.message ??
    form.formState.errors.subdomain?.message ??
    null;
  const addressErrorMessage = form.formState.errors.address?.message ?? null;
  const ttlErrorMessage =
    (form.formState.errors.expiresInMinutes?.message as string | undefined) ??
    null;

  const switchToAddressMode = ({
    parsed,
    clearSuggestion = true,
  }: {
    parsed?: ParsedMailboxAddress | null;
    clearSuggestion?: boolean;
  } = {}) => {
    const nextParsed = parsed ?? segmentedAddress;
    if (nextParsed) {
      setSegmentedDraftBeforeAddressMode(null);
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
    } else {
      setSegmentedDraftBeforeAddressMode({
        localPart: form.getValues("localPart"),
        subdomain: form.getValues("subdomain"),
        rootDomain: form.getValues("rootDomain"),
      });
      form.setValue("address", "", {
        shouldDirty: false,
        shouldTouch: false,
        shouldValidate: false,
      });
    }

    if (clearSuggestion) {
      setPasteSuggestion(null);
      setDismissedPasteSuggestion(null);
    }
    form.clearErrors(["localPart", "subdomain"]);
    setInputMode("address");
  };

  const switchToSegmentedMode = () => {
    const normalizedAddress = normalizeMailboxAddress(
      form.getValues("address"),
    );

    if (parsedFullAddress) {
      setSegmentedDraftBeforeAddressMode(null);
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
    } else if (!normalizedAddress && segmentedDraftBeforeAddressMode) {
      form.setValue("localPart", segmentedDraftBeforeAddressMode.localPart, {
        shouldDirty: true,
        shouldTouch: false,
        shouldValidate: false,
      });
      form.setValue("subdomain", segmentedDraftBeforeAddressMode.subdomain, {
        shouldDirty: true,
        shouldTouch: false,
        shouldValidate: false,
      });
      form.setValue("rootDomain", segmentedDraftBeforeAddressMode.rootDomain, {
        shouldDirty: true,
        shouldTouch: false,
        shouldValidate: false,
      });
      setSegmentedDraftBeforeAddressMode(null);
    } else {
      setSegmentedDraftBeforeAddressMode(null);
      form.setValue("localPart", "", {
        shouldDirty: true,
        shouldTouch: false,
        shouldValidate: false,
      });
      form.setValue("subdomain", "", {
        shouldDirty: true,
        shouldTouch: false,
        shouldValidate: false,
      });
      form.setValue("rootDomain", "", {
        shouldDirty: true,
        shouldTouch: false,
        shouldValidate: false,
      });
    }

    setPasteSuggestion(null);
    setDismissedPasteSuggestion(null);
    setInputMode("segmented");
    form.clearErrors(["address", "localPart", "subdomain"]);
  };

  const handleSegmentPaste = (
    field: SegmentFieldName,
    event: ClipboardEvent<HTMLInputElement>,
  ) => {
    if (inputMode !== "segmented") return;

    const input = event.currentTarget;
    if (pasteDetectionTimeoutRef.current !== null) {
      window.clearTimeout(pasteDetectionTimeoutRef.current);
    }

    pasteDetectionTimeoutRef.current = window.setTimeout(() => {
      pasteDetectionTimeoutRef.current = null;

      const observedValue = input.value;
      const parsed = parseMailboxAddressAgainstDomains(
        observedValue,
        normalizedDomains,
      );
      if (!parsed) {
        setPasteSuggestion((current) =>
          current?.field === field ? null : current,
        );
        return;
      }
      if (
        dismissedPasteSuggestion?.field === field &&
        dismissedPasteSuggestion.observedValue === observedValue
      ) {
        return;
      }

      setPasteSuggestion({
        address: parsed.address,
        parsed,
        field,
        observedValue,
      });
    }, 0);
  };

  const handleAddressModeToggle = () =>
    switchToAddressMode({
      parsed: pasteSuggestion?.parsed,
      clearSuggestion: true,
    });

  const dismissPasteSuggestion = () => {
    if (!pasteSuggestion) return;

    setDismissedPasteSuggestion({
      field: pasteSuggestion.field,
      observedValue: pasteSuggestion.observedValue,
    });
    setPasteSuggestion(null);
    form.clearErrors(pasteSuggestion.field);
  };

  return (
    <form
      className={cn("grid gap-4", className)}
      onSubmit={form.handleSubmit((values) => {
        const ttlResult = ttlEditorState.isEditing
          ? parseMailboxTtlInputWithOptions(ttlEditorState.draftValue, {
              minMinutes: minTtlMinutes,
              maxMinutes: maxTtlMinutes,
              supportsUnlimited: supportsUnlimitedTtl,
            })
          : ({
              ok: true,
              value: values.expiresInMinutes,
            } as const);
        if (!ttlResult.ok) {
          form.setError("expiresInMinutes", {
            message: ttlResult.message,
          });
          return;
        }

        const resolvedExpiresInMinutes = ttlResult.value;
        if (resolvedExpiresInMinutes !== values.expiresInMinutes) {
          form.setValue("expiresInMinutes", resolvedExpiresInMinutes, {
            shouldDirty: true,
            shouldTouch: true,
            shouldValidate: false,
          });
        }

        if (inputMode === "address") {
          if (
            resolvedExpiresInMinutes !== null &&
            !Number.isInteger(resolvedExpiresInMinutes)
          ) {
            form.setError("expiresInMinutes", {
              message: "请输入有效的生命周期",
            });
            return;
          }

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
            expiresInMinutes: resolvedExpiresInMinutes,
          });
        }

        const normalizedLocalPart = normalizeOptionalValue(values.localPart);
        const normalizedSubdomain = normalizeOptionalValue(values.subdomain);
        const normalizedRootDomain = normalizeRootDomain(values.rootDomain);
        if (
          resolvedExpiresInMinutes !== null &&
          !Number.isInteger(resolvedExpiresInMinutes)
        ) {
          form.setError("expiresInMinutes", {
            message: "请输入有效的生命周期",
          });
          return;
        }
        if (
          typeof resolvedExpiresInMinutes === "number" &&
          resolvedExpiresInMinutes < minTtlMinutes
        ) {
          form.setError("expiresInMinutes", {
            message: `生命周期不能低于 ${formatMailboxTtl(minTtlMinutes)}`,
          });
          return;
        }
        if (
          typeof resolvedExpiresInMinutes === "number" &&
          resolvedExpiresInMinutes > maxTtlMinutes
        ) {
          form.setError("expiresInMinutes", {
            message: `生命周期不能超过 ${formatMailboxTtl(maxTtlMinutes)}`,
          });
          return;
        }

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
          expiresInMinutes: resolvedExpiresInMinutes,
        });
      })}
    >
      <fieldset className="grid gap-4" disabled={isPending}>
        <div className="space-y-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <Label>邮箱地址</Label>
            <fieldset className={inputModeSwitcherClassName}>
              <legend className="sr-only">邮箱输入方式</legend>
              <button
                aria-pressed={inputMode === "segmented"}
                className={cn(
                  inputModeButtonClassName,
                  inputMode === "segmented"
                    ? inputModeButtonActiveClassName
                    : inputModeButtonInactiveClassName,
                )}
                type="button"
                onClick={switchToSegmentedMode}
              >
                {segmentedModeLabel}
              </button>
              <Popover
                open={inputMode === "segmented" && Boolean(pasteSuggestion)}
              >
                <PopoverAnchor asChild>
                  <button
                    aria-pressed={inputMode === "address"}
                    className={cn(
                      inputModeButtonClassName,
                      inputMode === "address"
                        ? inputModeButtonActiveClassName
                        : inputModeButtonInactiveClassName,
                    )}
                    type="button"
                    onClick={handleAddressModeToggle}
                  >
                    {fullAddressModeLabel}
                  </button>
                </PopoverAnchor>
                {pasteSuggestion ? (
                  <PopoverContent
                    align="end"
                    className="w-[min(calc(100vw-2rem),24rem)] space-y-3 p-4"
                    collisionPadding={20}
                    side="bottom"
                    sideOffset={10}
                    onOpenAutoFocus={(event) => event.preventDefault()}
                  >
                    <div className="space-y-1">
                      <p className="text-sm font-medium text-foreground">
                        检测到这是当前支持的完整邮箱地址：
                      </p>
                      <p className="break-all text-sm text-foreground">
                        {pasteSuggestion.address}
                      </p>
                      <p className="text-xs leading-5 text-muted-foreground">
                        你刚刚的粘贴已保留在输入框里；如果这是你想要的完整地址，可直接切换过去并自动填好。
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={handleAddressModeToggle}
                      >
                        切换到完整
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={dismissPasteSuggestion}
                      >
                        继续用分段
                      </Button>
                    </div>
                  </PopoverContent>
                ) : null}
              </Popover>
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
          <Label htmlFor="ttl-display">生命周期</Label>
          <MailboxTtlControl
            id="ttl-display"
            disabled={isPending}
            errorMessage={ttlErrorMessage}
            maxMinutes={maxTtlMinutes}
            minMinutes={minTtlMinutes}
            supportsUnlimited={supportsUnlimitedTtl}
            value={form.watch("expiresInMinutes")}
            onEditorStateChange={setTtlEditorState}
            onChange={(nextValue) => {
              form.clearErrors("expiresInMinutes");
              form.setValue("expiresInMinutes", nextValue, {
                shouldDirty: true,
                shouldTouch: true,
                shouldValidate: false,
              });
            }}
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
