import type { ReactNode } from "react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export type SegmentedButtonGroupOption<TValue extends string> = {
  value: TValue;
  label: ReactNode;
  badge?: ReactNode;
  disabled?: boolean;
};

export type SegmentedButtonGroupProps<TValue extends string> = {
  ariaLabel: string;
  value: TValue;
  options: Array<SegmentedButtonGroupOption<TValue>>;
  onValueChange?: (value: TValue) => void;
  className?: string;
};

export const SegmentedButtonGroup = <TValue extends string>({
  ariaLabel,
  value,
  options,
  onValueChange,
  className,
}: SegmentedButtonGroupProps<TValue>) => (
  <div
    aria-label={ariaLabel}
    className={cn(
      "inline-flex w-fit items-center gap-1 rounded-xl border border-border bg-muted/20 p-1",
      className,
    )}
    role="radiogroup"
  >
    {options.map((option) => {
      const selected = value === option.value;

      return (
        <Button
          aria-checked={selected}
          className={cn(
            "h-9 cursor-pointer rounded-lg border px-3.5 text-xs font-semibold transition-[background-color,border-color,color,box-shadow] duration-200",
            selected
              ? "border-[#93c5fd] bg-[#60a5fa] text-[#07111f] shadow-[0_0_0_1px_rgba(147,197,253,0.45),0_0_16px_rgba(96,165,250,0.22)] hover:bg-[#60a5fa]"
              : "border-transparent bg-transparent text-muted-foreground hover:bg-secondary/70 hover:text-foreground",
          )}
          data-state={selected ? "checked" : "unchecked"}
          disabled={option.disabled}
          key={option.value}
          onClick={() => onValueChange?.(option.value)}
          role="radio"
          size="sm"
          type="button"
          variant={selected ? "default" : "ghost"}
        >
          <span>{option.label}</span>
          {option.badge !== undefined ? (
            <span
              className={cn(
                "ml-1 inline-flex min-w-5 items-center justify-center rounded-md border px-1.5 py-0 text-[0.625rem] leading-4",
                selected
                  ? "border-[#07111f]/20 bg-[#07111f]/10 text-[#07111f]"
                  : "border-border bg-background/60 text-muted-foreground",
              )}
            >
              {option.badge}
            </span>
          ) : null}
        </Button>
      );
    })}
  </div>
);
