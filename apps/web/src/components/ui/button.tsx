import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import * as React from "react";

import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-lg border text-sm font-medium transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50",
  {
    variants: {
      variant: {
        default:
          "border-primary bg-primary px-4 py-2 text-primary-foreground hover:bg-primary/90",
        secondary:
          "border-secondary bg-secondary px-4 py-2 text-secondary-foreground hover:bg-secondary/85",
        outline:
          "border-border bg-transparent px-4 py-2 text-foreground hover:bg-white/5",
        ghost:
          "border-transparent px-3 py-2 text-muted-foreground hover:bg-white/5 hover:text-foreground",
        destructive:
          "border-destructive bg-destructive px-4 py-2 text-destructive-foreground hover:bg-destructive/90",
      },
      size: {
        default: "h-9",
        sm: "h-8 px-3 text-xs",
        icon: "h-9 w-9 px-0",
        "icon-sm": "h-8 w-8 px-0 text-xs",
        lg: "h-10 px-5 text-sm",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    const resolvedProps = asChild
      ? props
      : { type: props.type ?? "button", ...props };

    return (
      <Comp
        className={cn(buttonVariants({ variant, size }), className)}
        ref={ref}
        {...resolvedProps}
      />
    );
  },
);
Button.displayName = "Button";
