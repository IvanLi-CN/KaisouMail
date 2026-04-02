import * as TooltipPrimitive from "@radix-ui/react-tooltip";
import * as React from "react";

import { cn } from "@/lib/utils";

const composeEventHandlers = <E,>(
  theirHandler: ((event: E) => void) | undefined,
  ourHandler: (event: E) => void,
) => {
  return (event: E) => {
    theirHandler?.(event);
    ourHandler(event);
  };
};

export const TooltipProvider = TooltipPrimitive.Provider;

export const TooltipContent = React.forwardRef<
  React.ElementRef<typeof TooltipPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof TooltipPrimitive.Content>
>(
  (
    {
      className,
      sideOffset = 10,
      collisionPadding = 12,
      avoidCollisions = true,
      sticky = "partial",
      hideWhenDetached = true,
      children,
      ...props
    },
    ref,
  ) => (
    <TooltipPrimitive.Portal>
      <TooltipPrimitive.Content
        ref={ref}
        sideOffset={sideOffset}
        collisionPadding={collisionPadding}
        avoidCollisions={avoidCollisions}
        sticky={sticky}
        hideWhenDetached={hideWhenDetached}
        className={cn(
          "relative isolate z-50 max-w-[240px] rounded-lg border border-slate-950/12 bg-slate-50 px-3.5 py-2 text-[13px] font-medium leading-5 tracking-[0.01em] text-slate-950 shadow-[0_24px_64px_rgba(2,6,23,0.30),0_10px_28px_rgba(2,6,23,0.22)] outline-none before:pointer-events-none before:absolute before:-inset-2 before:-z-10 before:rounded-xl before:bg-slate-950/22 before:blur-lg",
          className,
        )}
        {...props}
      >
        {children}
        <TooltipPrimitive.Arrow
          className="fill-slate-50 drop-shadow-[0_8px_14px_rgba(2,6,23,0.18)]"
          height={7}
          width={11}
        />
      </TooltipPrimitive.Content>
    </TooltipPrimitive.Portal>
  ),
);
TooltipContent.displayName = TooltipPrimitive.Content.displayName;

export const Tooltip = ({
  children,
  tooltipContent,
  delayDuration = 400,
  disableHoverableContent = true,
  touchOpenDelay = 450,
  ...props
}: Omit<
  React.ComponentPropsWithoutRef<typeof TooltipPrimitive.Content>,
  "children" | "content"
> & {
  children: React.ReactElement;
  tooltipContent: React.ReactNode;
  delayDuration?: number;
  disableHoverableContent?: boolean;
  touchOpenDelay?: number;
}) => {
  const [open, setOpen] = React.useState(false);
  const longPressTimerRef = React.useRef<number | null>(null);

  const clearLongPressTimer = React.useCallback(() => {
    if (longPressTimerRef.current !== null) {
      window.clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
  }, []);

  React.useEffect(() => clearLongPressTimer, [clearLongPressTimer]);

  const child = React.Children.only(children) as React.ReactElement<{
    onPointerCancel?: React.PointerEventHandler;
    onPointerDown?: React.PointerEventHandler;
    onPointerLeave?: React.PointerEventHandler;
    onPointerUp?: React.PointerEventHandler;
  }>;
  const enhancedChild = React.cloneElement(child, {
    onPointerDown: composeEventHandlers(child.props.onPointerDown, (event) => {
      if (event.pointerType !== "touch") {
        return;
      }

      clearLongPressTimer();
      longPressTimerRef.current = window.setTimeout(() => {
        setOpen(true);
      }, touchOpenDelay);
    }),
    onPointerUp: composeEventHandlers(child.props.onPointerUp, (event) => {
      if (event.pointerType !== "touch") {
        return;
      }

      clearLongPressTimer();
      setOpen(false);
    }),
    onPointerCancel: composeEventHandlers(
      child.props.onPointerCancel,
      clearLongPressTimer,
    ),
    onPointerLeave: composeEventHandlers(
      child.props.onPointerLeave,
      (event) => {
        if (event.pointerType !== "touch") {
          return;
        }

        clearLongPressTimer();
        setOpen(false);
      },
    ),
  });

  return (
    <TooltipPrimitive.Provider
      delayDuration={delayDuration}
      disableHoverableContent={disableHoverableContent}
      skipDelayDuration={200}
    >
      <TooltipPrimitive.Root open={open} onOpenChange={setOpen}>
        <TooltipPrimitive.Trigger asChild>
          {enhancedChild}
        </TooltipPrimitive.Trigger>
        <TooltipContent {...props}>{tooltipContent}</TooltipContent>
      </TooltipPrimitive.Root>
    </TooltipPrimitive.Provider>
  );
};
