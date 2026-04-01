import { drizzle } from "drizzle-orm/d1";
import type { WorkerEnv } from "../env";
import * as schema from "./schema";

export const getDb = (env: Pick<WorkerEnv, "DB">) =>
  drizzle(env.DB, { schema });
export type Database = ReturnType<typeof getDb>;
