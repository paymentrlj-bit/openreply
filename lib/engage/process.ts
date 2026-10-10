import { matchKeywords } from "@/lib/utils/keyword-matcher";
import { MetaApiError, RateLimitError, TokenExpiredError } from "@/lib/meta/client";
import type { EngageConfig } from "./config";
import { decideComment, decideDm } from "./decide";
import { LlmError } from "./llm";
import type {
  EngageCommentJob,
  EngageJob,
  EngageMessageJob,
} from "./queue";
import type { Classification, CommentCategory, DmCategory } from "./types";

/**
 * The engagement engine's job logic. Everything it touches (database,
 * Instagram, email, the language model, the clock) comes in through `deps`,
 * so it can be tested without any of them.
 */

export type EngageAction =
  | "PENDING"
  | "SENDING"
  | "REPLIED"
  | "DM_SENT"
  | "FLAGGED"
  | "DRY_RUN"
  | "IGNORED"
  | "SKIPPED"
  | "ERROR"
  | "UNCONFIRMED";

export interface EngageAccount {
  id: string;
  workspaceId: string;
  instagramId: string;
  username: string;
  provider: "META" | "ZERNIO";
}

export interface CampaignRule {
  keywords: string[];
  wholeWordMatch: boolean;
  matchAnyWord: boolean;
}

export interface ClaimInput {
  account: EngageAccount;
  targetType: "COMMENT" | "MESSAGE";
  targetId: string;
  authorId: string;
  text: string;
}

export interface LogRow {
  id: string;
  action: EngageAction;
}

export interface LogUpdate {
  action?: EngageAction;
  reason?: string | null;
  category?: string | null;
  language?: string | null;
  confidence?: number | null;
  replyText?: string | null;
  usedFallback?: boolean;
  errorMessage?: string | null;
}

export interface EngageStore {
  getAccount(id: string): Promise<EngageAccount | null>;
  /**
   * Records that this comment or message is being handled. Returns null when it
   * was already finished, so a repeat webhook or a retry never acts twice.
   */
  claim(input: ClaimInput): Promise<LogRow | null>;
  update(id: string, data: LogUpdate): Promise<void>;
  countSince(accountId: string, actions: EngageAction[], since: Date): Promise<number>;
  senderAnsweredSince(accountId: string, authorId: string, since: Date): Promise<boolean>;
  commentCampaigns(accountId: string, mediaIds: string[]): Promise<CampaignRule[]>;
  dmCampaigns(accountId: string): Promise<CampaignRule[]>;
}

export interface EngageSender {
  publicReply(account: EngageAccount, commentId: string, text: string): Promise<void>;
  privateReply(account: EngageAccount, commentId: string, text: string): Promise<void>;
  directMessage(account: EngageAccount, userId: string, text: string): Promise<void>;
}

export interface EngageDeps {
  config: EngageConfig;
  store: EngageStore;
  sender: EngageSender;
  notify(subject: string, body: string): Promise<boolean>;
  classifyComment(text: string): Promise<Classification<CommentCategory>>;
  classifyDm(text: string): Promise<Classification<DmCategory>>;
  scheduleLater(name: string, data: EngageJob, delayMs: number, jobId: string): Promise<void>;
  now(): number;
  random(): number;
}

export interface EngageJobInfo<T> {
  id?: string;
  name: string;
  data: T;
  // When the job was first queued, in milliseconds.
  timestamp: number;
}

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;
const MAX_ALERT_EMAILS_PER_DAY = 25;
const MAX_DM_DELAY_SECONDS = 120;

type SendFailure = "retry" | "fatal" | "unconfirmed";

/**
 * How to treat a failed send. Only an explicit rejection proves nothing was
 * delivered; anything else might have gone out, so it is never retried.
 */
export function classifyFailure(error: unknown): SendFailure {
  if (error instanceof RateLimitError) return "retry";
  if (error instanceof TokenExpiredError) return "fatal";
  if (error instanceof MetaApiError && [10, 100, 200, 551].includes(error.code)) {
    return "fatal";
  }
  return "unconfirmed";
}

function describe(error: unknown): string {
  return error instanceof Error ? error.message.slice(0, 300) : "Unknown error";
}

function snippet(text: string, max: number): string {
  const flat = text.replace(/\s+/g, " ").trim();
  return flat.length > max ? `${flat.slice(0, max)}…` : flat;
}

function delaySeconds(config: EngageConfig, random: number, cap?: number): number {
  const max = cap ? Math.min(config.maxDelaySeconds, cap) : config.maxDelaySeconds;
  const min = Math.min(config.minDelaySeconds, max);
  return min + random * (max - min);
}

function ruleMatches(rule: CampaignRule, text: string): boolean {
  return rule.matchAnyWord || matchKeywords(text, rule.keywords, rule.wholeWordMatch).matched;
}

/** Shared bookkeeping for one comment or message. */
class Run {
  constructor(
    private deps: EngageDeps,
    private row: LogRow
  ) {}

  finish(action: EngageAction, extra: Omit<LogUpdate, "action"> = {}) {
    return this.deps.store.update(this.row.id, { action, ...extra });
  }

  update(data: LogUpdate) {
    return this.deps.store.update(this.row.id, data);
  }

  /** Handles a failed send. Returns normally unless the send should be retried. */
  async failed(error: unknown): Promise<void> {
    const kind = classifyFailure(error);
    if (kind === "retry") {
      await this.update({ action: "PENDING", errorMessage: describe(error) });
      throw error;
    }
    await this.finish(kind === "fatal" ? "ERROR" : "UNCONFIRMED", {
      errorMessage: describe(error),
    });
  }
}

async function underLimits(deps: EngageDeps, accountId: string): Promise<string | null> {
  const { config, store } = deps;
  const sent: EngageAction[] = ["REPLIED", "DM_SENT"];
  const hour = await store.countSince(accountId, sent, new Date(deps.now() - HOUR_MS));
  if (hour >= config.maxPerHour) return "hourly limit reached";
  const day = await store.countSince(accountId, sent, new Date(deps.now() - DAY_MS));
  if (day >= config.maxPerDay) return "daily limit reached";
  return null;
}

async function alertOwner(
  deps: EngageDeps,
  account: EngageAccount,
  subject: string,
  lines: string[]
): Promise<void> {
  const sentToday = await deps.store.countSince(
    account.id,
    ["FLAGGED", "DM_SENT"],
    new Date(deps.now() - DAY_MS)
  );
  // Past the daily limit the item still appears in the digest, just not by email.
  if (sentToday > MAX_ALERT_EMAILS_PER_DAY) return;
  await deps.notify(subject, [...lines, "", `Account: @${account.username}`].join("\n"));
}

export async function processComment(
  deps: EngageDeps,
  job: EngageJobInfo<EngageCommentJob>
): Promise<void> {
  const { config } = deps;
  if (config.mode === "off") return;
  const data = job.data;

  // Live replies wait a random while, so the account does not answer instantly.
  if (!data.scheduled && config.mode === "live") {
    const ms = Math.round(delaySeconds(config, deps.random()) * 1000);
    await deps.scheduleLater(job.name, { ...data, scheduled: true }, ms, `${job.id}_later`);
    return;
  }

  const account = await deps.store.getAccount(data.accountConnectionId);
  if (!account || account.provider !== "META") return;

  const row = await deps.store.claim({
    account,
    targetType: "COMMENT",
    targetId: data.commentId,
    authorId: data.commenterId,
    text: data.commentText,
  });
  if (!row) return;
  const run = new Run(deps, row);

  if (row.action === "SENDING") {
    await run.finish("UNCONFIRMED", { reason: "interrupted while sending" });
    return;
  }
  if (deps.now() - job.timestamp > config.maxAgeHours * HOUR_MS) {
    await run.finish("SKIPPED", { reason: "too old" });
    return;
  }
  if (data.parentId) {
    await run.finish("SKIPPED", { reason: "reply inside a thread" });
    return;
  }
  const text = data.commentText.trim();
  if (!text) {
    await run.finish("SKIPPED", { reason: "no text" });
    return;
  }

  const mediaIds = [data.mediaId, ...(data.originalMediaId ? [data.originalMediaId] : [])];
  const rules = await deps.store.commentCampaigns(account.id, mediaIds);
  if (rules.some((rule) => ruleMatches(rule, text))) {
    await run.finish("SKIPPED", { reason: "handled by a campaign" });
    return;
  }

  if (config.mode === "live") {
    const limit = await underLimits(deps, account.id);
    if (limit) {
      await run.finish("SKIPPED", { reason: limit });
      return;
    }
  }

  let classification: Classification<CommentCategory>;
  try {
    classification = await deps.classifyComment(text);
  } catch (error) {
    // The row stays PENDING so a retry can pick it up.
    if (error instanceof LlmError && error.retryable) throw error;
    await run.finish("ERROR", { errorMessage: describe(error) });
    return;
  }
  await run.update({
    category: classification.category,
    language: classification.language,
    confidence: classification.confidence,
  });

  const decision = decideComment(classification, config, data.commentId);

  if (decision.kind === "ignore") {
    await run.finish("IGNORED", { reason: decision.reason });
    return;
  }

  if (decision.kind === "flag") {
    await run.finish("FLAGGED", { reason: decision.reason });
    await alertOwner(deps, account, "A comment needs your attention", [
      "Someone left a comment that looks like a complaint. No automatic reply was sent.",
      "",
      `Comment: ${snippet(text, 300)}`,
    ]);
    return;
  }

  if (config.mode === "dry-run") {
    await run.finish("DRY_RUN", {
      reason: `would send a ${decision.kind === "public_reply" ? "public reply" : "private message"}`,
      replyText: decision.text,
      usedFallback: decision.usedFallback,
    });
    if (decision.kind === "private_feedback") {
      await alertOwner(deps, account, "A complaint was spotted (test mode)", [
        "Test mode is on, so nothing was sent. This is the message that would go out:",
        "",
        `Comment: ${snippet(text, 300)}`,
        `Private message: ${decision.text}`,
      ]);
    }
    return;
  }

  await run.update({
    action: "SENDING",
    replyText: decision.text,
    usedFallback: decision.usedFallback,
  });

  try {
    if (decision.kind === "public_reply") {
      await deps.sender.publicReply(account, data.commentId, decision.text);
    } else {
      await deps.sender.privateReply(account, data.commentId, decision.text);
    }
  } catch (error) {
    await run.failed(error);
    return;
  }

  if (decision.kind === "public_reply") {
    await run.finish("REPLIED");
    return;
  }
  await run.finish("DM_SENT", { reason: "complaint" });
  await alertOwner(deps, account, "A complaint was spotted", [
    "Someone left a comment that looks like a complaint. A private message asking for feedback was sent.",
    "",
    `Comment: ${snippet(text, 300)}`,
    `We sent: ${decision.text}`,
    "",
    "Please follow up personally if they reply.",
  ]);
}

export async function processMessage(
  deps: EngageDeps,
  job: EngageJobInfo<EngageMessageJob>
): Promise<void> {
  const { config } = deps;
  if (config.mode === "off") return;
  const data = job.data;

  if (!data.scheduled && config.mode === "live") {
    const ms = Math.round(delaySeconds(config, deps.random(), MAX_DM_DELAY_SECONDS) * 1000);
    await deps.scheduleLater(job.name, { ...data, scheduled: true }, ms, `${job.id}_later`);
    return;
  }

  const account = await deps.store.getAccount(data.accountConnectionId);
  if (!account || account.provider !== "META") return;

  const row = await deps.store.claim({
    account,
    targetType: "MESSAGE",
    targetId: data.messageId,
    authorId: data.senderId,
    text: data.messageText,
  });
  if (!row) return;
  const run = new Run(deps, row);

  if (row.action === "SENDING") {
    await run.finish("UNCONFIRMED", { reason: "interrupted while sending" });
    return;
  }
  // Direct messages can only be answered inside Instagram's 24 hour window.
  if (deps.now() - job.timestamp > Math.min(config.maxAgeHours, 20) * HOUR_MS) {
    await run.finish("SKIPPED", { reason: "too old" });
    return;
  }
  const text = data.messageText.trim();
  if (!text) {
    await run.finish("SKIPPED", { reason: "no text" });
    return;
  }

  const rules = await deps.store.dmCampaigns(account.id);
  if (rules.some((rule) => ruleMatches(rule, text))) {
    await run.finish("SKIPPED", { reason: "handled by a campaign" });
    return;
  }

  if (await deps.store.senderAnsweredSince(account.id, data.senderId, new Date(deps.now() - DAY_MS))) {
    await run.finish("SKIPPED", { reason: "already answered this person today" });
    return;
  }

  let classification: Classification<DmCategory>;
  try {
    classification = await deps.classifyDm(text);
  } catch (error) {
    if (error instanceof LlmError && error.retryable) throw error;
    await run.finish("ERROR", { errorMessage: describe(error) });
    return;
  }
  await run.update({
    category: classification.category,
    language: classification.language,
    confidence: classification.confidence,
  });

  const decision = decideDm(classification, config, data.messageId);

  if (decision.kind === "ignore") {
    await run.finish("IGNORED", { reason: decision.reason });
    return;
  }

  if (decision.kind === "alert") {
    await run.finish("FLAGGED", { reason: decision.reason });
    await alertOwner(
      deps,
      account,
      decision.urgent ? "URGENT: a customer message needs a reply" : "A customer message needs a reply",
      [
        `Reason: ${decision.reason}`,
        "",
        `Message: ${snippet(text, 300)}`,
        "",
        "Open your Instagram inbox to reply personally. No automatic reply was sent.",
      ]
    );
    return;
  }

  if (config.mode === "dry-run") {
    await run.finish("DRY_RUN", {
      reason: "would send a direct message",
      replyText: decision.text,
      usedFallback: decision.usedFallback,
    });
    return;
  }

  const limit = await underLimits(deps, account.id);
  if (limit) {
    await run.finish("SKIPPED", { reason: limit });
    return;
  }

  await run.update({
    action: "SENDING",
    replyText: decision.text,
    usedFallback: decision.usedFallback,
  });
  try {
    await deps.sender.directMessage(account, data.senderId, decision.text);
  } catch (error) {
    await run.failed(error);
    return;
  }
  await run.finish("REPLIED");
}
