import { useVirtualizer } from "@tanstack/react-virtual";
import { type ReactNode, useEffect, useMemo, useRef } from "react";

import { PaneScrollbar } from "./pane-scrollbar";

type VirtualizedPaneListProps<T> = {
  items: T[];
  estimateSize: (index: number) => number;
  getItemKey: (item: T, index: number) => string;
  renderItem: (item: T, index: number) => ReactNode;
  activeIndex?: number | null;
  enabled?: boolean;
  overscan?: number;
  scrollAlign?: "auto" | "center" | "end" | "start";
  scrollContainerClassName?: string;
  scrollContentClassName?: string;
  scrollTestId?: string;
};

export const VirtualizedPaneList = <T,>({
  items,
  estimateSize,
  getItemKey,
  renderItem,
  activeIndex = null,
  enabled = true,
  overscan = 6,
  scrollAlign = "auto",
  scrollContainerClassName,
  scrollContentClassName,
  scrollTestId,
}: VirtualizedPaneListProps<T>) => {
  const scrollElementRef = useRef<HTMLDivElement | null>(null);
  const virtualizer = useVirtualizer({
    count: enabled ? items.length : 0,
    estimateSize,
    getItemKey: (index) => {
      const item = items[index];
      return item ? getItemKey(item, index) : index;
    },
    getScrollElement: () => scrollElementRef.current,
    overscan,
  });

  const virtualItems = virtualizer.getVirtualItems();
  const targetKey = useMemo(() => {
    if (
      activeIndex === null ||
      activeIndex < 0 ||
      activeIndex >= items.length
    ) {
      return null;
    }

    return getItemKey(items[activeIndex] as T, activeIndex);
  }, [activeIndex, getItemKey, items]);

  useEffect(() => {
    if (!enabled || activeIndex === null || targetKey === null) return;

    const frameId = window.requestAnimationFrame(() => {
      virtualizer.scrollToIndex(activeIndex, { align: scrollAlign });
    });

    return () => {
      window.cancelAnimationFrame(frameId);
    };
  }, [activeIndex, enabled, scrollAlign, targetKey, virtualizer]);

  if (!enabled) {
    return (
      <div className={scrollContainerClassName} data-testid={scrollTestId}>
        <div className="space-y-2">
          {items.map((item, index) => (
            <div key={getItemKey(item, index)}>{renderItem(item, index)}</div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <PaneScrollbar
      className={scrollContainerClassName}
      contentClassName={scrollContentClassName}
      scrollTestId={scrollTestId}
      viewportRef={(element) => {
        scrollElementRef.current = element;
      }}
    >
      <div
        className="relative w-full"
        style={{ height: `${virtualizer.getTotalSize()}px` }}
      >
        {virtualItems.map((virtualItem) => {
          const item = items[virtualItem.index];
          if (!item) return null;

          return (
            <div
              key={getItemKey(item, virtualItem.index)}
              data-index={virtualItem.index}
              ref={virtualizer.measureElement}
              className="absolute top-0 left-0 w-full pb-2"
              style={{
                transform: `translateY(${virtualItem.start}px)`,
              }}
            >
              {renderItem(item, virtualItem.index)}
            </div>
          );
        })}
      </div>
    </PaneScrollbar>
  );
};
