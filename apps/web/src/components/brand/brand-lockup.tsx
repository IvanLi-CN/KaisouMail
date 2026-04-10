import brandLockupOnDark from "@/assets/brand-lockup-on-dark.png";
import { cn } from "@/lib/utils";

export const BrandLockup = ({
  className,
  imageClassName,
}: {
  className?: string;
  imageClassName?: string;
}) => {
  return (
    <img
      src={brandLockupOnDark}
      alt="KaisouMail"
      className={cn("block h-auto w-full", className, imageClassName)}
      draggable={false}
    />
  );
};
