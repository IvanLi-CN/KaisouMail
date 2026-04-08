interface ApiServiceBinding {
  fetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response>;
}

interface PagesFunctionContext {
  request: Request;
  env: {
    API: ApiServiceBinding;
  };
}

export const onRequest = ({ request, env }: PagesFunctionContext) =>
  env.API.fetch(request);
