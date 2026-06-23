import type { Context } from "hono";

import type { RuntimeConfig, WorkerEnv } from "./env";

export type AuthUser = {
  id: string;
  role: "admin" | "member";
  username?: string;
  nickname?: string;
  email?: string;
  name?: string;
};

export type AuthContext =
  | {
      method: "api_key";
      apiKey: {
        id: string;
        name: string;
        prefix: string;
      };
    }
  | {
      method: "web";
      apiKey: null;
    };

export interface AppVariables {
  authUser: AuthUser;
  authContext: AuthContext;
  runtimeConfig: RuntimeConfig;
  requestId: string;
}

export interface AppBindings {
  Bindings: WorkerEnv;
  Variables: AppVariables;
}

export type AppContext = Context<AppBindings>;
