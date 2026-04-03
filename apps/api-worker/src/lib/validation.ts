import type { Context } from "hono";

import { buildApiErrorPayload } from "./errors";

type ValidationIssue = {
  message?: string;
  path?: PropertyKey[];
};

const toValidationDetails = (error: unknown) => {
  if (
    !error ||
    typeof error !== "object" ||
    !("issues" in error) ||
    !Array.isArray(error.issues)
  ) {
    return null;
  }

  const fieldErrors: Record<string, string[]> = {};
  const formErrors: string[] = [];

  for (const issue of error.issues as ValidationIssue[]) {
    const message = issue.message ?? "Invalid value";
    const path = issue.path ?? [];
    if (path.length === 0) {
      formErrors.push(message);
      continue;
    }

    const key = path.map(String).join(".");
    fieldErrors[key] = [...(fieldErrors[key] ?? []), message];
  }

  return {
    formErrors,
    fieldErrors,
  };
};

export const apiValidationHook = (
  result: { success: boolean; error?: unknown },
  c: Context,
) => {
  if (!result.success) {
    return c.json(
      buildApiErrorPayload(
        "Invalid request",
        toValidationDetails(result.error),
      ),
      400,
    );
  }
};
