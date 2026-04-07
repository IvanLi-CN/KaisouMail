import {
  INITIAL_VIEWPORTS,
  type Viewport,
  type ViewportMap,
} from "storybook/viewport";

type ProjectViewportKey = "kaisouMobile" | "kaisouTablet" | "kaisouDesktop";

export const projectViewportOptions = {
  kaisouMobile: {
    ...INITIAL_VIEWPORTS.iphone14,
    name: "Phone · 390 × 844",
  },
  kaisouTablet: {
    ...INITIAL_VIEWPORTS.ipad12p,
    name: "Tablet · 1024 × 1366",
  },
  kaisouDesktop: {
    name: "Desktop · 1440 × 1200",
    styles: {
      width: "1440px",
      height: "1200px",
    },
    type: "desktop",
  } satisfies Viewport,
} satisfies ViewportMap;

export const projectViewportGlobals = {
  mobile: {
    viewport: { value: "kaisouMobile", isRotated: false },
  },
  tablet: {
    viewport: { value: "kaisouTablet", isRotated: false },
  },
  desktop: {
    viewport: { value: "kaisouDesktop", isRotated: false },
  },
} as const;

export const projectViewportDimensions: Record<
  ProjectViewportKey,
  { width: number; height: number }
> = {
  kaisouMobile: { width: 390, height: 844 },
  kaisouTablet: { width: 1024, height: 1366 },
  kaisouDesktop: { width: 1440, height: 1200 },
};
