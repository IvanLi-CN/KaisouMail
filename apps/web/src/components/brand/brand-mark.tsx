import brandSymbolOnDark from "@/assets/brand-symbol-on-dark.png";
import { cn } from "@/lib/utils";

export const BrandMark = ({
  className,
  imageClassName,
}: {
  className?: string;
  imageClassName?: string;
}) => {
  return (
    <span
      aria-hidden="true"
      className={cn(
        "flex items-center justify-center overflow-hidden rounded-xl border border-border bg-secondary",
        className,
      )}
    >
      <img
        src={brandSymbolOnDark}
        alt=""
        className={cn("h-full w-full object-contain", imageClassName)}
        draggable={false}
      />
    </span>
  );
};
