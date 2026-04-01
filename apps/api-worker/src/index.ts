import { createApp } from "./app";
import type { WorkerEnv } from "./env";
import { runMailboxCleanup } from "./services/cleanup";
import { storeIncomingMessage } from "./services/messages";

const app = createApp();

export default {
  fetch(request: Request, env: WorkerEnv, ctx: ExecutionContext) {
    return app.fetch(request, env, ctx);
  },
  async email(
    message: ForwardableEmailMessage,
    env: WorkerEnv,
    _ctx: ExecutionContext,
  ) {
    await storeIncomingMessage(env, message);
  },
  async scheduled(
    _controller: ScheduledController,
    env: WorkerEnv,
    _ctx: ExecutionContext,
  ) {
    await runMailboxCleanup(env);
  },
} satisfies ExportedHandler<WorkerEnv>;
