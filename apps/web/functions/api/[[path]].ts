interface ApiServiceBinding {
  fetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response>;
}

interface PagesFunctionContext {
  request: Request;
  env: {
    API: ApiServiceBinding;
  };
}

const isPagesPreviewHostname = (hostname: string) =>
  hostname.toLowerCase().endsWith(".pages.dev");

const buildPreviewBlockedResponse = () =>
  new Response(
    JSON.stringify({
      error: "Preview Pages same-origin API is disabled",
      details:
        "Preview Pages deployments must not proxy control-plane traffic into the live API service.",
    }),
    {
      status: 503,
      headers: {
        "content-type": "application/json",
        "cache-control": "no-store",
      },
    },
  );

export const onRequest = ({ request, env }: PagesFunctionContext) => {
  const hostname = new URL(request.url).hostname;
  if (isPagesPreviewHostname(hostname)) {
    return buildPreviewBlockedResponse();
  }

  return env.API.fetch(request);
};
