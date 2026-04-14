import { apiErrorSchema } from "@kaisoumail/shared";

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
    public readonly details?: unknown,
    public readonly headers?: HeadersInit,
  ) {
    super(message);
  }
}

export const buildApiErrorPayload = (error: string, details: unknown = null) =>
  apiErrorSchema.parse({
    error,
    details,
  });

export const jsonError = (
  status: number,
  error: string,
  details: unknown = null,
) =>
  new Response(JSON.stringify(buildApiErrorPayload(error, details)), {
    status,
    headers: {
      "content-type": "application/json",
    },
  });
