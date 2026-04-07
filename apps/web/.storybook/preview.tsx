import type { Preview } from "@storybook/react-vite";
import { MemoryRouter } from "react-router-dom";
import { themes } from "storybook/theming";
import { TooltipProvider } from "../src/components/ui/tooltip";
import {
  projectViewportGlobals,
  projectViewportOptions,
} from "../src/storybook/viewports";
import "../src/index.css";

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
      options: projectViewportOptions,
    },
  },
  initialGlobals: projectViewportGlobals.desktop,
};

export default preview;
