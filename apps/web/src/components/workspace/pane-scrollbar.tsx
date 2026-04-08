import {
  type ReactNode,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import { Scrollbar, type ScrollbarProps } from "react-scrollbars-custom";

import { cn } from "@/lib/utils";

type PaneScrollbarProps = {
  children: ReactNode;
  className?: string;
  contentClassName?: string;
  viewportClassName?: string;
  viewportRef?: (element: HTMLDivElement | null) => void;
  scrollTestId?: string;
} & Pick<ScrollbarProps, "noScrollX" | "noScrollY">;

export const PaneScrollbar = ({
  children,
  className,
  contentClassName,
  noScrollX = true,
  noScrollY = false,
  scrollTestId,
  viewportClassName,
  viewportRef,
}: PaneScrollbarProps) => {
  const activeTimerRef = useRef<number | null>(null);
  const [isActive, setIsActive] = useState(false);

  const clearActiveTimer = useCallback(() => {
    if (activeTimerRef.current === null) return;

    window.clearTimeout(activeTimerRef.current);
    activeTimerRef.current = null;
  }, []);

  const scheduleActiveReset = useCallback(() => {
    clearActiveTimer();
    activeTimerRef.current = window.setTimeout(() => {
      setIsActive(false);
      activeTimerRef.current = null;
    }, 720);
  }, [clearActiveTimer]);

  useEffect(
    () => () => {
      clearActiveTimer();
    },
    [clearActiveTimer],
  );

  return (
    <Scrollbar
      className={cn(
        "workspace-scrollbar",
        isActive && "workspace-scrollbar--active",
        className,
      )}
      contentProps={{
        className: cn("workspace-scrollbar__content", contentClassName),
      }}
      minimalThumbYSize={36}
      noScrollX={noScrollX}
      noScrollY={noScrollY}
      removeTrackXWhenNotUsed
      removeTrackYWhenNotUsed
      scrollerProps={{
        className: cn("workspace-scrollbar__scroller", viewportClassName),
        elementRef: (element) => {
          if (scrollTestId) {
            if (element) {
              element.setAttribute("data-testid", scrollTestId);
            }
          }
          viewportRef?.(element);
        },
      }}
      style={{ height: "100%", width: "100%" }}
      onScroll={() => {
        setIsActive(true);
        scheduleActiveReset();
      }}
      thumbXProps={{
        className: "workspace-scrollbar__thumb workspace-scrollbar__thumb--x",
        style: {
          background: "var(--workspace-scrollbar-thumb-bg)",
          border: "1px solid var(--workspace-scrollbar-thumb-border)",
          borderRadius: 999,
          boxShadow: "var(--workspace-scrollbar-thumb-shadow)",
        },
      }}
      thumbYProps={{
        className: "workspace-scrollbar__thumb workspace-scrollbar__thumb--y",
        style: {
          background: "var(--workspace-scrollbar-thumb-bg)",
          border: "1px solid var(--workspace-scrollbar-thumb-border)",
          borderRadius: 999,
          boxShadow: "var(--workspace-scrollbar-thumb-shadow)",
        },
      }}
      trackXProps={{
        className: "workspace-scrollbar__track workspace-scrollbar__track--x",
      }}
      trackYProps={{
        className: "workspace-scrollbar__track workspace-scrollbar__track--y",
      }}
    >
      {children}
    </Scrollbar>
  );
};
