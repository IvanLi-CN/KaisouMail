import { Slot } from "@radix-ui/react-slot";
import type * as React from "react";

import { cn } from "@/lib/utils";

export type ButtonGroupProps = React.ComponentProps<"div"> & {
  orientation?: "horizontal" | "vertical";
};

export const ButtonGroup = ({
  className,
  orientation = "horizontal",
  ...props
}: ButtonGroupProps) => (
  // biome-ignore lint/a11y/useSemanticElements: Matches the shadcn/ui ButtonGroup pattern, which uses a div with role="group".
  <div
    className={cn(
      "inline-flex w-fit isolate items-stretch rounded-lg shadow-xs",
      orientation === "horizontal"
        ? "flex-row [&>*:not(:first-child)]:-ml-px [&>*:not(:first-child)]:rounded-l-none [&>*:not(:last-child)]:rounded-r-none"
        : "flex-col [&>*:not(:first-child)]:-mt-px [&>*:not(:first-child)]:rounded-t-none [&>*:not(:last-child)]:rounded-b-none",
      className,
    )}
    data-orientation={orientation}
    data-slot="button-group"
    role="group"
    {...props}
  />
);

export type ButtonGroupSeparatorProps = React.ComponentProps<"hr"> & {
  orientation?: "horizontal" | "vertical";
};

export const ButtonGroupSeparator = ({
  className,
  orientation = "vertical",
  ...props
}: ButtonGroupSeparatorProps) => (
  <hr
    className={cn(
      "self-stretch bg-border",
      orientation === "vertical" ? "w-px" : "h-px",
      className,
    )}
    data-orientation={orientation}
    data-slot="button-group-separator"
    {...props}
  />
);

export type ButtonGroupTextProps = React.ComponentProps<"span"> & {
  asChild?: boolean;
};

export const ButtonGroupText = ({
  asChild = false,
  className,
  ...props
}: ButtonGroupTextProps) => {
  const Comp = asChild ? Slot : "span";

  return (
    <Comp
      className={cn(
        "inline-flex h-9 items-center justify-center whitespace-nowrap border border-border bg-muted/30 px-3 text-sm font-medium text-muted-foreground",
        className,
      )}
      data-slot="button-group-text"
      {...props}
    />
  );
};
