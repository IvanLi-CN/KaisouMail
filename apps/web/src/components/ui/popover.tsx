import * as PopoverPrimitive from "@radix-ui/react-popover";
import * as React from "react";

import { cn } from "@/lib/utils";

export const Popover = PopoverPrimitive.Root;
export const PopoverTrigger = PopoverPrimitive.Trigger;
export const PopoverAnchor = PopoverPrimitive.Anchor;
export const PopoverClose = PopoverPrimitive.Close;

type PopoverContentProps = React.ComponentPropsWithoutRef<
  typeof PopoverPrimitive.Content
> & {
  hideArrow?: boolean;
  arrowClassName?: string;
  arrowStyle?: React.CSSProperties;
  arrowWidth?: number;
  arrowHeight?: number;
};

export const PopoverContent = React.forwardRef<
  React.ElementRef<typeof PopoverPrimitive.Content>,
  PopoverContentProps
>(
  (
    {
      className,
      align = "end",
      side = "bottom",
      sideOffset = 10,
      collisionPadding = 16,
      avoidCollisions = true,
      sticky = "partial",
      hideWhenDetached = true,
      children,
      style,
      hideArrow = false,
      arrowClassName,
      arrowStyle,
      arrowWidth = 18,
      arrowHeight = 10,
      ...props
    },
    ref,
  ) => (
    <PopoverPrimitive.Portal>
      <PopoverPrimitive.Content
        ref={ref}
        align={align}
        avoidCollisions={avoidCollisions}
        className={cn(
          "z-50 w-[min(calc(100vw-2rem),28rem)] rounded-2xl border border-white/10 bg-card/88 p-5 text-foreground shadow-[0_28px_84px_rgba(2,6,23,0.46),0_14px_34px_rgba(2,6,23,0.32),inset_0_1px_0_rgba(255,255,255,0.05)] outline-none backdrop-blur-2xl supports-[backdrop-filter]:bg-card/78",
          className,
        )}
        collisionPadding={collisionPadding}
        hideWhenDetached={hideWhenDetached}
        side={side}
        sideOffset={sideOffset}
        sticky={sticky}
        style={style}
        {...props}
      >
        {children}
        {hideArrow ? null : (
          <PopoverPrimitive.Arrow
            className={cn(
              "drop-shadow-[0_8px_18px_rgba(2,6,23,0.24)]",
              arrowClassName,
            )}
            height={arrowHeight}
            style={{
              fill: "hsl(var(--card) / 0.86)",
              stroke: "rgba(255,255,255,0.1)",
              strokeWidth: 1,
              ...arrowStyle,
            }}
            width={arrowWidth}
          />
        )}
      </PopoverPrimitive.Content>
    </PopoverPrimitive.Portal>
  ),
);
PopoverContent.displayName = PopoverPrimitive.Content.displayName;
