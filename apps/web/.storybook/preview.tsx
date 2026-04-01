import type { Preview } from "@storybook/react-vite";
import { MemoryRouter } from "react-router-dom";

import "../src/index.css";

const preview: Preview = {
  decorators: [
    (Story) => (
      <MemoryRouter>
        <div className="min-h-screen bg-background px-6 py-8 text-foreground">
          <Story />
        </div>
      </MemoryRouter>
    ),
  ],
  parameters: {
    layout: "fullscreen",
    controls: {
      expanded: true,
    },
    backgrounds: {
      default: "dark",
    },
  },
};

export default preview;
