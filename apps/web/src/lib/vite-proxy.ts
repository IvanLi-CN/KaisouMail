const trimTrailingSlash = (value: string) => value.replace(/\/+$/, "");

export const DEFAULT_LOCAL_API_PROXY_TARGET = "http://127.0.0.1:8787";

export const resolveApiProxyTarget = (value: string | undefined) => {
  const configuredValue = value?.trim();
  return configuredValue
    ? trimTrailingSlash(configuredValue)
    : DEFAULT_LOCAL_API_PROXY_TARGET;
};

export const createApiProxy = (apiProxyTarget: string) => ({
  "/api": {
    target: apiProxyTarget,
    changeOrigin: true,
  },
});
