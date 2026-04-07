import type { Preview } from "@storybook/react-vite";
import { MemoryRouter } from "react-router-dom";
import { themes } from "storybook/theming";

import { TooltipProvider } from "../src/components/ui/tooltip";
import "../src/index.css";

const viewportOptions = {
  kaisouMobile: {
    name: "Kaisou Mobile",
    styles: {
      width: "390px",
      height: "844px",
    },
    type: "mobile",
  },
  kaisouTablet: {
    name: "Kaisou Tablet",
    styles: {
      width: "1024px",
      height: "1366px",
    },
    type: "tablet",
  },
  kaisouDesktop: {
    name: "Kaisou Desktop",
    styles: {
      width: "1440px",
      height: "1200px",
    },
    type: "desktop",
  },
} as const;

const preview: Preview = {
  decorators: [
    (Story, context) => (
      <TooltipProvider
        delayDuration={400}
        disableHoverableContent
        skipDelayDuration={200}
      >
        {context.parameters.disableMemoryRouter ? (
          context.parameters.disableStoryPadding ? (
            <Story />
          ) : (
            <div className="min-h-screen bg-background px-6 py-8 text-foreground">
              <Story />
            </div>
          )
        ) : (
          <MemoryRouter>
            {context.parameters.disableStoryPadding ? (
              <Story />
            ) : (
              <div className="min-h-screen bg-background px-6 py-8 text-foreground">
                <Story />
              </div>
            )}
          </MemoryRouter>
        )}
      </TooltipProvider>
    ),
  ],
  parameters: {
    layout: "fullscreen",
    controls: {
      expanded: true,
    },
    docs: {
      theme: themes.dark,
    },
    backgrounds: {
      default: "dark",
    },
    viewport: {
      options: viewportOptions,
    },
  },
  initialGlobals: {
    viewport: {
      value: "kaisouDesktop",
      isRotated: false,
    },
  },
};

export default preview;
