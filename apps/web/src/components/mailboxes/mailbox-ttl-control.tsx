import { maxMailboxTtlMinutes, minMailboxTtlMinutes } from "@kaisoumail/shared";
import { useEffect, useMemo, useRef, useState } from "react";

import { Input } from "@/components/ui/input";
import { Slider } from "@/components/ui/slider";
import {
  formatMailboxTtl,
  formatMailboxTtlEditorValue,
  mailboxTtlSliderFiniteStop,
  mailboxTtlSliderMax,
  mailboxTtlToSliderPosition,
  parseMailboxTtlInputWithOptions,
  resolveMailboxTtlSliderMax,
  sliderPositionToMailboxTtl,
} from "@/lib/mailbox-ttl";
import { cn } from "@/lib/utils";

export const MailboxTtlControl = ({
  id,
  value,
  onChange,
  disabled = false,
  errorMessage = null,
  minMinutes = minMailboxTtlMinutes,
  maxMinutes = maxMailboxTtlMinutes,
  supportsUnlimited = true,
  onEditorStateChange,
}: {
  id: string;
  value: number | null;
  onChange: (value: number | null) => void;
  disabled?: boolean;
  errorMessage?: string | null;
  minMinutes?: number;
  maxMinutes?: number;
  supportsUnlimited?: boolean;
  onEditorStateChange?: (state: {
    isEditing: boolean;
    draftValue: string;
    hasError: boolean;
  }) => void;
}) => {
  const [isEditing, setIsEditing] = useState(false);
  const [draftValue, setDraftValue] = useState(() =>
    formatMailboxTtlEditorValue(value),
  );
  const [editError, setEditError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  const displayValue = useMemo(() => formatMailboxTtl(value), [value]);
  const sliderMax = useMemo(
    () => resolveMailboxTtlSliderMax(supportsUnlimited),
    [supportsUnlimited],
  );
  const sliderValue = useMemo(
    () => [
      mailboxTtlToSliderPosition(value, minMinutes, {
        minMinutes,
        maxMinutes,
        supportsUnlimited,
      }),
    ],
    [maxMinutes, minMinutes, supportsUnlimited, value],
  );
  const resolvedError = editError ?? errorMessage;
  const finiteLabelLeft = useMemo(() => {
    if (!supportsUnlimited) return "100%";
    return `${(mailboxTtlSliderFiniteStop / mailboxTtlSliderMax) * 100}%`;
  }, [supportsUnlimited]);

  useEffect(() => {
    if (!isEditing) {
      setDraftValue(formatMailboxTtlEditorValue(value));
    }
  }, [isEditing, value]);

  useEffect(() => {
    if (!isEditing || !inputRef.current) return;
    inputRef.current.focus();
    inputRef.current.select();
  }, [isEditing]);

  useEffect(() => {
    onEditorStateChange?.({
      isEditing,
      draftValue,
      hasError: Boolean(editError),
    });
  }, [draftValue, editError, isEditing, onEditorStateChange]);

  const beginEditing = () => {
    if (disabled) return;
    setDraftValue(formatMailboxTtlEditorValue(value));
    setEditError(null);
    setIsEditing(true);
  };

  const cancelEditing = () => {
    setDraftValue(formatMailboxTtlEditorValue(value));
    setEditError(null);
    setIsEditing(false);
  };

  const commitEditing = () => {
    const parsed = parseMailboxTtlInputWithOptions(draftValue, {
      minMinutes,
      maxMinutes,
      supportsUnlimited,
    });
    if (!parsed.ok) {
      setEditError(parsed.message);
      return false;
    }

    setEditError(null);
    setIsEditing(false);
    onChange(parsed.value);
    return true;
  };

  return (
    <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_9rem] sm:items-start">
      <div className="pt-2 sm:pt-3">
        <div className="relative">
          <Slider
            aria-label="生命周期滑块"
            disabled={disabled}
            max={sliderMax}
            min={0}
            step={1}
            value={sliderValue}
            onValueChange={(nextValue) => {
              const nextTtl = sliderPositionToMailboxTtl(nextValue[0] ?? 0, {
                minMinutes,
                maxMinutes,
                supportsUnlimited,
              });
              setEditError(null);
              onChange(nextTtl);
            }}
          />
          {supportsUnlimited ? (
            <>
              <span
                aria-hidden="true"
                className="pointer-events-none absolute top-1/2 h-5 w-px -translate-x-1/2 -translate-y-1/2 bg-border"
                style={{ left: finiteLabelLeft }}
              />
              <span
                aria-hidden="true"
                className="pointer-events-none absolute right-0 top-1/2 h-3 w-3 -translate-y-1/2 rounded-full border border-border bg-background"
              />
            </>
          ) : null}
        </div>
      </div>

      <div className="space-y-2">
        {isEditing ? (
          <Input
            ref={inputRef}
            id={id}
            aria-label="生命周期值"
            aria-invalid={Boolean(resolvedError)}
            className={cn(resolvedError ? "border-destructive" : undefined)}
            disabled={disabled}
            value={draftValue}
            onBlur={() => {
              void commitEditing();
            }}
            onChange={(event) => {
              setDraftValue(event.target.value);
              if (editError) setEditError(null);
            }}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                void commitEditing();
              }
              if (event.key === "Escape") {
                event.preventDefault();
                cancelEditing();
              }
            }}
          />
        ) : (
          <button
            id={id}
            aria-label="生命周期值"
            className={cn(
              "flex h-10 w-full items-center justify-end rounded-lg border border-input bg-muted/40 px-3 text-right text-sm outline-none transition focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-primary/20",
              disabled ? "cursor-not-allowed opacity-60" : "cursor-text",
              resolvedError ? "border-destructive" : undefined,
            )}
            disabled={disabled}
            title="双击编辑"
            type="button"
            onDoubleClick={beginEditing}
            onKeyDown={(event) => {
              if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                beginEditing();
              }
            }}
          >
            {displayValue}
          </button>
        )}
      </div>

      {resolvedError ? (
        <p className="text-sm text-destructive sm:col-span-2" role="alert">
          {resolvedError}
        </p>
      ) : null}
      <span className="sr-only">
        有限生命周期范围为 {formatMailboxTtl(minMinutes)} 到{" "}
        {formatMailboxTtl(maxMinutes)}
        {supportsUnlimited ? "，最右侧为无限。" : "。"}
      </span>
    </div>
  );
};
