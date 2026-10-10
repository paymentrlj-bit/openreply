import { Worker } from "bullmq";
import { getRedisConnection } from "@/lib/queue/client";
import { readEngageConfig, engageProblem } from "./config";
import { createEngageDeps } from "./deps";
import { maybeSendDigest } from "./digest";
import { processComment, processMessage } from "./process";
import {
  ENGAGE_COMMENT_JOB,
  ENGAGE_MESSAGE_JOB,
  ENGAGE_QUEUE,
  type EngageCommentJob,
  type EngageJob,
  type EngageMessageJob,
} from "./queue";

const DIGEST_CHECK_MS = 15 * 60 * 1000;

export interface EngageRuntime {
  stop(): Promise<void>;
}

/**
 * Starts the engagement worker next to the DM worker. It always runs, even
 * when switched off, so queued items are drained instead of piling up in Redis.
 */
export function startEngagement(): EngageRuntime {
  let config = readEngageConfig();
  const problem = engageProblem(config);
  if (problem) {
    console.error(`[Engage] ${problem}, so smart replies are switched off`);
    config = { ...config, mode: "off" };
  }
  console.log(`[Engage] Mode: ${config.mode}`);

  const deps = createEngageDeps(config);

  const worker = new Worker<EngageJob>(
    ENGAGE_QUEUE,
    async (job) => {
      const info = { id: job.id, name: job.name, timestamp: job.timestamp };
      if (job.name === ENGAGE_COMMENT_JOB) {
        await processComment(deps, { ...info, data: job.data as EngageCommentJob });
      } else if (job.name === ENGAGE_MESSAGE_JOB) {
        await processMessage(deps, { ...info, data: job.data as EngageMessageJob });
      }
    },
    { connection: getRedisConnection(), concurrency: 2 }
  );

  worker.on("failed", (job, error) => {
    console.error(`[Engage] Job ${job?.id} failed (attempt ${job?.attemptsMade}):`, error.message);
  });
  worker.on("error", (error) => {
    console.error("[Engage] Worker error:", error.message);
  });

  const check = () =>
    void maybeSendDigest(config).catch((error) => {
      console.error(
        "[Engage] Digest failed:",
        error instanceof Error ? error.message : "unknown error"
      );
    });
  const timer = setInterval(check, DIGEST_CHECK_MS);
  const first = setTimeout(check, 60_000);

  return {
    async stop() {
      clearInterval(timer);
      clearTimeout(first);
      await worker.close();
    },
  };
}
