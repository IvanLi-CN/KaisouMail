import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { PropsWithChildren } from "react";

import { TooltipProvider } from "@/components/ui/tooltip";

const queryClient = new QueryClient();

export const AppProviders = ({ children }: PropsWithChildren) => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider
      delayDuration={400}
      disableHoverableContent
      skipDelayDuration={200}
    >
      {children}
    </TooltipProvider>
  </QueryClientProvider>
);
