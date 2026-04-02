import type { LucideIcon } from "lucide-react";
import * as React from "react";

import { Button, type ButtonProps } from "@/components/ui/button";
import { Tooltip } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

export type ActionButtonDensity = "default" | "dense";
export type ActionButtonPriority = "primary" | "secondary";

export interface ActionButtonProps extends Omit<ButtonProps, "children"> {
  label: string;
  icon: LucideIcon;
  children?: React.ReactElement<{ children?: React.ReactNode }>;
  density?: ActionButtonDensity;
  forceIconOnly?: boolean;
  iconClassName?: string;
  priority?: ActionButtonPriority;
  tooltip?: React.ReactNode;
  tooltipDelayDuration?: number;
}

export const ActionButton = React.forwardRef<
  HTMLButtonElement,
  ActionButtonProps
>(
  (
    {
      label,
      icon: Icon,
      children,
      className,
      density = "default",
      forceIconOnly,
      iconClassName,
      priority = "secondary",
      size,
      tooltip,
      tooltipDelayDuration,
      asChild = false,
      "aria-label": ariaLabel,
      ...props
    },
    ref,
  ) => {
    const iconOnly =
      forceIconOnly ?? (density === "dense" && priority !== "primary");
    const resolvedSize = iconOnly
      ? size === "sm"
        ? "icon-sm"
        : "icon"
      : (size ?? "default");
    const content = (
      <>
        <Icon
          aria-hidden="true"
          className={cn("h-4 w-4 shrink-0", iconClassName)}
        />
        {iconOnly ? (
          <span className="sr-only">{label}</span>
        ) : (
          <span className="whitespace-nowrap">{label}</span>
        )}
      </>
    );

    const buttonChild = asChild
      ? React.cloneElement(
          React.Children.only(children) as React.ReactElement<{
            children?: React.ReactNode;
          }>,
          {
            children: content,
          },
        )
      : content;

    const button = (
      <Button
        ref={ref}
        asChild={asChild}
        aria-label={iconOnly ? label : ariaLabel}
        className={cn(className)}
        data-density={density}
        data-icon-only={iconOnly ? "true" : "false"}
        size={resolvedSize}
        {...props}
      >
        {buttonChild}
      </Button>
    );

    if (!iconOnly) {
      return button;
    }

    return (
      <Tooltip
        delayDuration={tooltipDelayDuration}
        tooltipContent={tooltip ?? label}
      >
        {button}
      </Tooltip>
    );
  },
);
ActionButton.displayName = "ActionButton";
