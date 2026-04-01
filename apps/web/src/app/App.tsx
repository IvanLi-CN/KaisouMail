import { RouterProvider } from "react-router-dom";

import { AppProviders } from "@/app/providers";
import { router } from "@/app/router";

export const App = () => (
  <AppProviders>
    <RouterProvider router={router} />
  </AppProviders>
);
