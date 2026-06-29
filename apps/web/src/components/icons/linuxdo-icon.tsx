import { type SVGProps, useId } from "react";

export const LinuxDoIcon = (props: SVGProps<SVGSVGElement>) => {
  const clipPathId = useId();

  return (
    <svg viewBox="0 0 120 120" fill="none" aria-hidden="true" {...props}>
      <defs>
        <clipPath id={clipPathId}>
          <circle cx="60" cy="60" r="47" />
        </clipPath>
      </defs>
      <circle
        cx="60"
        cy="60"
        r="46"
        fill="none"
        stroke="currentColor"
        strokeWidth="8"
      />
      <rect
        x="10"
        y="40"
        width="100"
        height="40"
        fill="currentColor"
        clipPath={`url(#${clipPathId})`}
      />
    </svg>
  );
};
