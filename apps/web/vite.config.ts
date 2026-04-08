import path from "node:path";

import react from "@vitejs/plugin-react";
import { defineConfig, loadEnv, type UserConfig } from "vite";

import { createApiProxy, resolveApiProxyTarget } from "./src/lib/vite-proxy";

export const createWebViteConfig = ({
  port = Number(process.env.PORT ?? 4173),
  apiProxyTarget,
}: {
  port?: number;
  apiProxyTarget: string;
}): UserConfig => {
  const proxy = createApiProxy(apiProxyTarget);

  return {
    plugins: [react()],
    resolve: {
      alias: {
        "@": path.resolve(__dirname, "./src"),
      },
    },
    server: {
      port,
      proxy,
    },
    preview: {
      port,
      proxy,
    },
  };
};

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, __dirname, "");
  return createWebViteConfig({
    apiProxyTarget: resolveApiProxyTarget(
      env.VITE_API_BASE_URL ?? process.env.VITE_API_BASE_URL,
    ),
  });
});
