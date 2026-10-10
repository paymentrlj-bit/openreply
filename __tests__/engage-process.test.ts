import { describe, expect, it, vi } from "vitest";
import { MetaApiError, RateLimitError, TokenExpiredError } from "@/lib/meta/client";
import { readEngageConfig, type EngageConfig } from "@/lib/engage/config";
import { LlmError } from "@/lib/engage/llm";
import {
  classifyFailure,
  processComment,
  processMessage,
  type CampaignRule,
  type EngageAccount,
  type EngageAction,
  type EngageDeps,
  type LogUpdate,
} from "@/lib/engage/process";
import type { Classification, CommentCategory, DmCategory } from "@/lib/engage/types";

const NOW = 1_800_000_000_000;

const account: EngageAccount = {
  id: "acc1",
  workspaceId: "ws1",
  instagramId: "ig1",
  username: "rljewels_official",
  provider: "META",
};

function config(overrides: Record<string, string> = {}): EngageConfig {
  return readEngageConfig({ ENGAGE_MODE: "live", ENGAGE_LLM_API_KEY: "k", ...overrides });
}

interface Row {
  id: string;
  action: EngageAction;
  update: LogUpdate;
}

function harness(opts: {
  config?: EngageConfig;
  comment?: Classification<CommentCategory>;
  dm?: Classification<DmCategory>;
  commentRules?: CampaignRule[];
  dmRules?: CampaignRule[];
  counts?: Record<string, number>;
  answeredToday?: boolean;
  claim?: "fresh" | "done" | "sending";
  account?: EngageAccount | null;
} = {}) {
  const rows: Row[] = [];
  const calls = {
    publicReply: vi.fn(async () => {}),
    privateReply: vi.fn(async () => {}),
    directMessage: vi.fn(async () => {}),
    notify: vi.fn<(subject: string, body: string) => Promise<boolean>>(async () => true),
    scheduleLater: vi.fn(async () => {}),
    classifyComment: vi.fn(async () => opts.comment ?? praise()),
    classifyDm: vi.fn(async () => opts.dm ?? thanks()),
  };

  const deps: EngageDeps = {
    config: opts.config ?? config(),
    store: {
      getAccount: async () => (opts.account === undefined ? account : opts.account),
      claim: async () => {
        if (opts.claim === "done") return null;
        const row: Row = {
          id: `row${rows.length + 1}`,
          action: opts.claim === "sending" ? "SENDING" : "PENDING",
          update: {},
        };
        rows.push(row);
        return { id: row.id, action: row.action };
      },
      update: async (id, data) => {
        const row = rows.find((r) => r.id === id)!;
        Object.assign(row.update, data);
        if (data.action) row.action = data.action;
      },
      countSince: async (_a, actions) =>
        actions.includes("REPLIED") ? (opts.counts?.sent ?? 0) : (opts.counts?.alerts ?? 0),
      senderAnsweredSince: async () => opts.answeredToday ?? false,
      commentCampaigns: async () => opts.commentRules ?? [],
      dmCampaigns: async () => opts.dmRules ?? [],
    },
    sender: {
      publicReply: calls.publicReply,
      privateReply: calls.privateReply,
      directMessage: calls.directMessage,
    },
    notify: calls.notify,
    classifyComment: calls.classifyComment,
    classifyDm: calls.classifyDm,
    scheduleLater: calls.scheduleLater,
    now: () => NOW,
    random: () => 0.5,
  };
  return { deps, rows, calls };
}

function praise(overrides: Partial<Classification<CommentCategory>> = {}): Classification<CommentCategory> {
  return { category: "praise", language: "en", confidence: 0.95, reply: "Thank you so much! 🙏💛", ...overrides };
}
function thanks(overrides: Partial<Classification<DmCategory>> = {}): Classification<DmCategory> {
  return { category: "thanks", language: "en", confidence: 0.95, reply: "You're most welcome! 🙏", ...overrides };
}

const commentJob = (data: Record<string, unknown> = {}, timestamp = NOW - 1000) => ({
  id: "engage_comment_ig1_c1",
  name: "engage-comment",
  timestamp,
  data: {
    accountConnectionId: "acc1",
    instagramAccountId: "ig1",
    commentId: "c1",
    commentText: "Beautiful necklace!",
    commenterId: "u1",
    mediaId: "m1",
    scheduled: true,
    ...data,
  },
});

const messageJob = (data: Record<string, unknown> = {}, timestamp = NOW - 1000) => ({
  id: "engage_message_ig1_x",
  name: "engage-message",
  timestamp,
  data: {
    accountConnectionId: "acc1",
    instagramAccountId: "ig1",
    messageId: "mid1",
    messageText: "thank you",
    senderId: "u1",
    scheduled: true,
    ...data,
  },
});

describe("processComment", () => {
  it("does nothing when switched off", async () => {
    const h = harness({ config: config({ ENGAGE_MODE: "off" }) });
    await processComment(h.deps, commentJob());
    expect(h.rows).toHaveLength(0);
    expect(h.calls.classifyComment).not.toHaveBeenCalled();
  });

  it("holds a live comment back by a random delay before doing anything", async () => {
    const h = harness();
    await processComment(h.deps, commentJob({ scheduled: false }));
    expect(h.calls.scheduleLater).toHaveBeenCalledTimes(1);
    const [name, data, delay, jobId] = h.calls.scheduleLater.mock.calls[0] as unknown as [
      string,
      { scheduled: boolean },
      number,
      string,
    ];
    expect(name).toBe("engage-comment");
    expect(data.scheduled).toBe(true);
    expect(delay).toBe(Math.round((45 + 0.5 * (600 - 45)) * 1000));
    expect(jobId).toBe("engage_comment_ig1_c1_later");
    expect(h.rows).toHaveLength(0);
    expect(h.calls.publicReply).not.toHaveBeenCalled();
  });

  it("replies publicly to praise and records it", async () => {
    const h = harness();
    await processComment(h.deps, commentJob());
    expect(h.calls.publicReply).toHaveBeenCalledWith(account, "c1", "Thank you so much! 🙏💛");
    expect(h.rows[0].action).toBe("REPLIED");
    expect(h.rows[0].update).toMatchObject({ category: "praise", language: "en", replyText: "Thank you so much! 🙏💛" });
  });

  it("in test mode records what it would do and sends nothing, with no delay", async () => {
    const h = harness({ config: config({ ENGAGE_MODE: "dry-run" }) });
    await processComment(h.deps, commentJob({ scheduled: false }));
    expect(h.calls.scheduleLater).not.toHaveBeenCalled();
    expect(h.calls.publicReply).not.toHaveBeenCalled();
    expect(h.rows[0].action).toBe("DRY_RUN");
    expect(h.rows[0].update.replyText).toBe("Thank you so much! 🙏💛");
  });

  it("leaves comments a campaign handles to the campaign", async () => {
    const h = harness({ commentRules: [{ keywords: ["RATE"], wholeWordMatch: true, matchAnyWord: false }] });
    await processComment(h.deps, commentJob({ commentText: "what is the rate today" }));
    expect(h.rows[0].action).toBe("SKIPPED");
    expect(h.rows[0].update.reason).toBe("handled by a campaign");
    expect(h.calls.classifyComment).not.toHaveBeenCalled();
    expect(h.calls.publicReply).not.toHaveBeenCalled();
  });

  it("leaves everything to an any-word campaign", async () => {
    const h = harness({ commentRules: [{ keywords: [], wholeWordMatch: false, matchAnyWord: true }] });
    await processComment(h.deps, commentJob());
    expect(h.rows[0].action).toBe("SKIPPED");
  });

  it.each([
    ["is a reply in a thread", { parentId: "p1" }, NOW - 1000, "reply inside a thread"],
    ["has no text", { commentText: "   " }, NOW - 1000, "no text"],
    ["is too old", {}, NOW - 30 * 60 * 60 * 1000, "too old"],
  ])("skips a comment that %s", async (_n, data, timestamp, reason) => {
    const h = harness();
    await processComment(h.deps, commentJob(data, timestamp));
    expect(h.rows[0].action).toBe("SKIPPED");
    expect(h.rows[0].update.reason).toBe(reason);
    expect(h.calls.classifyComment).not.toHaveBeenCalled();
  });

  it("stops at the hourly and daily limits", async () => {
    const h = harness({ counts: { sent: 60 } });
    await processComment(h.deps, commentJob());
    expect(h.rows[0].action).toBe("SKIPPED");
    expect(h.rows[0].update.reason).toBe("hourly limit reached");
    expect(h.calls.publicReply).not.toHaveBeenCalled();
  });

  it("never acts twice on the same comment", async () => {
    const h = harness({ claim: "done" });
    await processComment(h.deps, commentJob());
    expect(h.calls.classifyComment).not.toHaveBeenCalled();
    expect(h.calls.publicReply).not.toHaveBeenCalled();
  });

  it("will not resend something that was interrupted mid-send", async () => {
    const h = harness({ claim: "sending" });
    await processComment(h.deps, commentJob());
    expect(h.rows[0].action).toBe("UNCONFIRMED");
    expect(h.calls.publicReply).not.toHaveBeenCalled();
  });

  it("ignores spam", async () => {
    const h = harness({ comment: { category: "spam", language: "en", confidence: 0.99, reply: "" } });
    await processComment(h.deps, commentJob());
    expect(h.rows[0].action).toBe("IGNORED");
    expect(h.calls.publicReply).not.toHaveBeenCalled();
  });

  it("sends a private message and emails the owner for a complaint", async () => {
    const h = harness({ comment: { category: "complaint", language: "mr_latn", confidence: 0.93, reply: "" } });
    await processComment(h.deps, commentJob({ commentText: "delivery late aali" }));
    expect(h.calls.publicReply).not.toHaveBeenCalled();
    expect(h.calls.privateReply).toHaveBeenCalledTimes(1);
    expect(h.rows[0].action).toBe("DM_SENT");
    expect(h.calls.notify).toHaveBeenCalledTimes(1);
    expect(h.calls.notify.mock.calls[0]?.[1]).toContain("delivery late aali");
  });

  it("only emails when private replies are switched off", async () => {
    const h = harness({
      config: config({ ENGAGE_COMPLAINT_DM: "false" }),
      comment: { category: "complaint", language: "en", confidence: 0.93, reply: "" },
    });
    await processComment(h.deps, commentJob());
    expect(h.calls.privateReply).not.toHaveBeenCalled();
    expect(h.rows[0].action).toBe("FLAGGED");
    expect(h.calls.notify).toHaveBeenCalledTimes(1);
  });

  it("retries after a confirmed rate limit without losing its place", async () => {
    const h = harness();
    h.calls.publicReply.mockRejectedValueOnce(new RateLimitError("slow down"));
    await expect(processComment(h.deps, commentJob())).rejects.toBeInstanceOf(RateLimitError);
    expect(h.rows[0].action).toBe("PENDING");
  });

  it("never retries a send whose outcome is unknown", async () => {
    const h = harness();
    h.calls.publicReply.mockRejectedValueOnce(new MetaApiError(1, undefined, undefined, "unknown"));
    await processComment(h.deps, commentJob());
    expect(h.rows[0].action).toBe("UNCONFIRMED");
  });

  it("records an expired token as an error without retrying", async () => {
    const h = harness();
    h.calls.publicReply.mockRejectedValueOnce(new TokenExpiredError("expired"));
    await processComment(h.deps, commentJob());
    expect(h.rows[0].action).toBe("ERROR");
  });

  it("retries when the language model is temporarily unavailable", async () => {
    const h = harness();
    h.calls.classifyComment.mockRejectedValueOnce(new LlmError("busy", 429, true));
    await expect(processComment(h.deps, commentJob())).rejects.toBeInstanceOf(LlmError);
    expect(h.rows[0].action).toBe("PENDING");
    expect(h.calls.publicReply).not.toHaveBeenCalled();
  });

  it("records a permanent model error and moves on", async () => {
    const h = harness();
    h.calls.classifyComment.mockRejectedValueOnce(new LlmError("bad request", 400, false));
    await processComment(h.deps, commentJob());
    expect(h.rows[0].action).toBe("ERROR");
  });

  it("only works with accounts connected directly to Meta", async () => {
    const h = harness({ account: { ...account, provider: "ZERNIO" } });
    await processComment(h.deps, commentJob());
    expect(h.rows).toHaveLength(0);
  });
});

describe("processMessage", () => {
  it("thanks someone who sends an emoji", async () => {
    const h = harness({ dm: { category: "reaction", language: "other", confidence: 1, reply: "" } });
    await processMessage(h.deps, messageJob({ messageText: "🔥" }));
    expect(h.calls.directMessage).toHaveBeenCalledTimes(1);
    expect(h.rows[0].action).toBe("REPLIED");
  });

  it("thanks someone who shares a reel, without calling the model or a campaign", async () => {
    const h = harness({
      dmRules: [{ keywords: [], wholeWordMatch: false, matchAnyWord: true }],
    });
    await processMessage(
      h.deps,
      messageJob({ messageText: "[shared a post or reel]", attachmentKind: "share" })
    );
    expect(h.calls.classifyDm).not.toHaveBeenCalled();
    expect(h.calls.directMessage).toHaveBeenCalledTimes(1);
    expect(h.rows[0].action).toBe("REPLIED");
  });

  it("tells the owner about a photo, video or voice message instead of replying", async () => {
    const h = harness();
    await processMessage(
      h.deps,
      messageJob({ messageText: "[sent a photo, video or voice message]", attachmentKind: "media" })
    );
    expect(h.calls.classifyDm).not.toHaveBeenCalled();
    expect(h.calls.directMessage).not.toHaveBeenCalled();
    expect(h.rows[0].action).toBe("FLAGGED");
    expect(h.calls.notify.mock.calls[0]?.[1]).toContain("photo, video or voice message");
  });

  it("emails the owner about a real message instead of replying", async () => {
    const h = harness({ dm: { category: "other", language: "en", confidence: 0.9, reply: "" } });
    await processMessage(h.deps, messageJob({ messageText: "I ordered a gift for my sister" }));
    expect(h.calls.directMessage).not.toHaveBeenCalled();
    expect(h.rows[0].action).toBe("FLAGGED");
    expect(h.calls.notify.mock.calls[0]?.[1]).toContain("I ordered a gift for my sister");
  });

  it("marks a complaint urgent in the email subject", async () => {
    const h = harness({ dm: { category: "complaint", language: "en", confidence: 0.9, reply: "" } });
    await processMessage(h.deps, messageJob());
    expect(String(h.calls.notify.mock.calls[0]?.[0])).toMatch(/URGENT/);
  });

  it("leaves messages a keyword campaign handles alone", async () => {
    const h = harness({ dmRules: [{ keywords: ["RATE"], wholeWordMatch: true, matchAnyWord: false }] });
    await processMessage(h.deps, messageJob({ messageText: "rate" }));
    expect(h.rows[0].action).toBe("SKIPPED");
    expect(h.calls.classifyDm).not.toHaveBeenCalled();
  });

  it("answers each person at most once a day", async () => {
    const h = harness({ answeredToday: true });
    await processMessage(h.deps, messageJob());
    expect(h.rows[0].action).toBe("SKIPPED");
    expect(h.calls.directMessage).not.toHaveBeenCalled();
  });

  it("does not answer direct messages older than the 24 hour window allows", async () => {
    const h = harness();
    await processMessage(h.deps, messageJob({}, NOW - 22 * 60 * 60 * 1000));
    expect(h.rows[0].action).toBe("SKIPPED");
  });

  it("in test mode sends nothing", async () => {
    const h = harness({ config: config({ ENGAGE_MODE: "dry-run" }) });
    await processMessage(h.deps, messageJob());
    expect(h.calls.directMessage).not.toHaveBeenCalled();
    expect(h.rows[0].action).toBe("DRY_RUN");
  });
});

describe("classifyFailure", () => {
  it("retries only explicit rate limits", () => {
    expect(classifyFailure(new RateLimitError("x"))).toBe("retry");
    expect(classifyFailure(new TokenExpiredError("x"))).toBe("fatal");
    expect(classifyFailure(new MetaApiError(100, undefined, undefined, "x"))).toBe("fatal");
    expect(classifyFailure(new MetaApiError(1, undefined, undefined, "x"))).toBe("unconfirmed");
    expect(classifyFailure(new Error("network"))).toBe("unconfirmed");
  });
});
