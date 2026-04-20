import { createApp } from "./app";
import type { WorkerEnv } from "./env";
import { parseRuntimeConfig } from "./env";
import { runMailboxCleanup } from "./services/cleanup";
import { storeIncomingMessage } from "./services/messages";
import {
  consumeSubdomainCleanupQueue,
  runSubdomainCleanupDispatcher,
  SUBDOMAIN_CLEANUP_DISPATCH_CRON,
  type SubdomainCleanupQueueMessage,
} from "./services/subdomain-cleanup";

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
  async queue(batch: MessageBatch, env: WorkerEnv, _ctx: ExecutionContext) {
    await consumeSubdomainCleanupQueue(
      batch as MessageBatch<SubdomainCleanupQueueMessage>,
      env,
      parseRuntimeConfig(env),
    );
  },
  async scheduled(
    controller: ScheduledController,
    env: WorkerEnv,
    _ctx: ExecutionContext,
  ) {
    if (controller.cron === SUBDOMAIN_CLEANUP_DISPATCH_CRON) {
      await runSubdomainCleanupDispatcher(env, parseRuntimeConfig(env));
      return;
    }

    await runMailboxCleanup(env);
  },
} satisfies ExportedHandler<WorkerEnv>;
