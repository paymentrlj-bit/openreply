import { Queue } from "bullmq";
import { getRedisConnection } from "@/lib/queue/client";

export const ENGAGE_QUEUE = "engagement";
export const ENGAGE_COMMENT_JOB = "engage-comment";
export const ENGAGE_MESSAGE_JOB = "engage-message";

export interface EngageCommentJob {
  accountConnectionId: string;
  instagramAccountId: string;
  commentId: string;
  commentText: string;
  commenterId: string;
  mediaId: string;
  originalMediaId?: string;
  // Set for a comment that is itself a reply inside a thread.
  parentId?: string;
  // The worker holds each comment back by a random delay by re-adding it with
  // this flag set.
  scheduled?: boolean;
}

export interface EngageMessageJob {
  accountConnectionId: string;
  instagramAccountId: string;
  messageId: string;
  messageText: string;
  senderId: string;
  // Set once the worker has added its random delay.
  scheduled?: boolean;
}

export type EngageJob = EngageCommentJob | EngageMessageJob;

let queue: Queue<EngageJob> | null = null;

export function getEngageQueue(): Queue<EngageJob> {
  if (!queue) {
    queue = new Queue<EngageJob>(ENGAGE_QUEUE, {
      connection: getRedisConnection(),
      defaultJobOptions: {
        removeOnComplete: { count: 200 },
        removeOnFail: { age: 24 * 60 * 60, count: 500 },
        attempts: 3,
        backoff: { type: "exponential", delay: 60_000 },
      },
    });
  }
  return queue;
}

/**
 * Hands a comment to the engagement worker. It must never break webhook
 * processing, so any failure is logged and swallowed.
 */
export async function enqueueEngageComment(job: EngageCommentJob): Promise<void> {
  try {
    await getEngageQueue().add(ENGAGE_COMMENT_JOB, job, {
      jobId: `engage_comment_${job.instagramAccountId}_${job.commentId}`,
    });
  } catch (error) {
    console.error(
      "[Engage] Could not queue comment:",
      error instanceof Error ? error.message : "unknown error"
    );
  }
}

export async function enqueueEngageMessage(job: EngageMessageJob): Promise<void> {
  try {
    await getEngageQueue().add(ENGAGE_MESSAGE_JOB, job, {
      jobId: `engage_message_${job.instagramAccountId}_${Buffer.from(
        job.messageId
      ).toString("base64url")}`,
    });
  } catch (error) {
    console.error(
      "[Engage] Could not queue message:",
      error instanceof Error ? error.message : "unknown error"
    );
  }
}
