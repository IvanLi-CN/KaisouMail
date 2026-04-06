import path from "node:path";

import react from "@vitejs/plugin-react";
import { defineConfig, loadEnv, type UserConfig } from "vite";

const trimTrailingSlash = (value: string) => value.replace(/\/+$/, "");

export const DEFAULT_LOCAL_API_PROXY_TARGET = "http://127.0.0.1:8787";

export const resolveApiProxyTarget = (value: string | undefined) => {
  const configuredValue = value?.trim();
  return configuredValue
    ? trimTrailingSlash(configuredValue)
    : DEFAULT_LOCAL_API_PROXY_TARGET;
};

export const createWebViteConfig = ({
  port = Number(process.env.PORT ?? 4173),
  apiProxyTarget = DEFAULT_LOCAL_API_PROXY_TARGET,
}: {
  port?: number;
  apiProxyTarget?: string;
} = {}): UserConfig => {
  const proxy = {
    "/api": {
      target: apiProxyTarget,
      changeOrigin: true,
    },
  };

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
