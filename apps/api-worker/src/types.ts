import type { sessionUserSchema } from "@kaisoumail/shared";
import type { Context } from "hono";
import type { z } from "zod";

import type { RuntimeConfig, WorkerEnv } from "./env";

export type AuthUser = z.infer<typeof sessionUserSchema>;

export interface AppVariables {
  authUser: AuthUser;
  runtimeConfig: RuntimeConfig;
  requestId: string;
}

export interface AppBindings {
  Bindings: WorkerEnv;
  Variables: AppVariables;
}

export type AppContext = Context<AppBindings>;
