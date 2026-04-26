import type { ReactNode } from "react";
import { useId } from "react";

import { cn } from "@/lib/utils";

export type RadioButtonGroupOption<TValue extends string> = {
  value: TValue;
  label: ReactNode;
  badge?: ReactNode;
  disabled?: boolean;
};

export type RadioButtonGroupProps<TValue extends string> = {
  ariaLabel: string;
  name: string;
  value: TValue;
  options: Array<RadioButtonGroupOption<TValue>>;
  onValueChange?: (value: TValue) => void;
  className?: string;
};

export const RadioButtonGroup = <TValue extends string>({
  ariaLabel,
  name,
  value,
  options,
  onValueChange,
  className,
}: RadioButtonGroupProps<TValue>) => {
  const id = useId();

  return (
    <fieldset
      aria-label={ariaLabel}
      className={cn(
        "inline-flex w-fit items-center overflow-hidden rounded-xl border border-border bg-background/35 p-1 shadow-inner shadow-black/10",
        className,
      )}
    >
      <legend className="sr-only">{ariaLabel}</legend>
      {options.map((option) => {
        const selected = value === option.value;
        const inputId = `${id}-${name}-${option.value}`;

        return (
          <label
            className={cn(
              "relative inline-flex min-h-9 cursor-pointer items-center justify-center gap-2 whitespace-nowrap rounded-lg border px-3.5 py-2 text-xs font-semibold transition-[background-color,border-color,color,box-shadow] duration-200 focus-within:outline-none focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2 focus-within:ring-offset-background",
              selected
                ? "border-[#93c5fd] bg-[#60a5fa] text-[#07111f] shadow-[0_0_0_1px_rgba(147,197,253,0.5),0_0_20px_rgba(96,165,250,0.34)]"
                : "border-transparent text-muted-foreground hover:bg-primary/10 hover:text-foreground",
              option.disabled && "cursor-not-allowed opacity-50",
            )}
            data-selected={selected ? "true" : undefined}
            htmlFor={inputId}
            key={option.value}
          >
            <input
              checked={selected}
              className="absolute inset-0 z-10 cursor-pointer opacity-0 disabled:cursor-not-allowed"
              disabled={option.disabled}
              id={inputId}
              name={name}
              onChange={() => onValueChange?.(option.value)}
              type="radio"
              value={option.value}
            />
            <span
              aria-hidden="true"
              className={cn(
                "flex h-4 w-4 shrink-0 items-center justify-center rounded-full border transition-colors duration-200",
                selected
                  ? "border-[#07111f] bg-[#07111f]"
                  : "border-muted-foreground/55 bg-transparent",
              )}
            >
              <span
                className={cn(
                  "h-2 w-2 rounded-full transition-opacity duration-200",
                  selected
                    ? "bg-[#60a5fa] opacity-100"
                    : "bg-transparent opacity-0",
                )}
              />
            </span>
            <span>{option.label}</span>
            {option.badge !== undefined ? (
              <span
                className={cn(
                  "inline-flex min-w-5 items-center justify-center rounded-md border px-1.5 py-0 text-[0.625rem] leading-4",
                  selected
                    ? "border-[#07111f]/25 bg-[#07111f]/10 text-[#07111f]"
                    : "border-border bg-background/60 text-muted-foreground",
                )}
              >
                {option.badge}
              </span>
            ) : null}
          </label>
        );
      })}
    </fieldset>
  );
};
