import * as PopoverPrimitive from "@radix-ui/react-popover";
import * as React from "react";

import { cn } from "@/lib/utils";

export const Popover = PopoverPrimitive.Root;
export const PopoverTrigger = PopoverPrimitive.Trigger;
export const PopoverAnchor = PopoverPrimitive.Anchor;
export const PopoverClose = PopoverPrimitive.Close;

export const PopoverContent = React.forwardRef<
  React.ElementRef<typeof PopoverPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof PopoverPrimitive.Content>
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
          "z-50 w-[min(calc(100vw-2rem),28rem)] rounded-2xl border border-border bg-card p-5 text-foreground shadow-[0_28px_84px_rgba(2,6,23,0.46),0_14px_34px_rgba(2,6,23,0.32)] outline-none",
          className,
        )}
        collisionPadding={collisionPadding}
        hideWhenDetached={hideWhenDetached}
        side={side}
        sideOffset={sideOffset}
        sticky={sticky}
        {...props}
      >
        {children}
        <PopoverPrimitive.Arrow
          className="fill-card drop-shadow-[0_8px_18px_rgba(2,6,23,0.24)]"
          height={10}
          width={18}
        />
      </PopoverPrimitive.Content>
    </PopoverPrimitive.Portal>
  ),
);
PopoverContent.displayName = PopoverPrimitive.Content.displayName;
