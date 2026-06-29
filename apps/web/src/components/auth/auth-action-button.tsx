import type { ComponentType, SVGProps } from "react";
import { Button, type ButtonProps } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type AuthActionButtonProps = Omit<ButtonProps, "children"> & {
  icon: ComponentType<SVGProps<SVGSVGElement>>;
  label: string;
};

export const AuthActionButton = ({
  className,
  icon: Icon,
  label,
  ...props
}: AuthActionButtonProps) => (
  <Button
    className={cn("min-h-11 w-full justify-start px-4", className)}
    {...props}
  >
    <span className="grid w-full grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center">
      <span className="inline-flex items-center justify-end gap-2 pr-1">
        <span aria-hidden="true" className="h-4 w-4" />
      </span>
      <span className="inline-flex items-center justify-center gap-2">
        <Icon aria-hidden="true" className="h-4 w-4 shrink-0" />
        <span>{label}</span>
      </span>
      <span
        aria-hidden="true"
        className="h-4 w-4 justify-self-start opacity-0"
      />
    </span>
  </Button>
);
