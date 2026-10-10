import { Prisma } from "@/app/generated/prisma/client";
import { prisma } from "@/lib/db/client";
import {
  createInstagramContext,
  sendCommentReply,
  sendDirectMessage,
  sendPrivateReply,
} from "@/lib/instagram/provider";
import { classifyComment, classifyDm } from "./classify";
import type { EngageConfig } from "./config";
import { notifyOwner } from "./notify";
import type {
  EngageAccount,
  EngageAction,
  EngageDeps,
  EngageSender,
  EngageStore,
} from "./process";
import { getEngageQueue, type EngageJob } from "./queue";

const MAX_STORED_TEXT = 500;

function isUniqueViolation(error: unknown): boolean {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002"
  );
}

export const prismaStore: EngageStore = {
  async getAccount(id) {
    const account = await prisma.instagramAccount.findUnique({
      where: { id },
      select: { id: true, workspaceId: true, instagramId: true, username: true, provider: true },
    });
    return account as EngageAccount | null;
  },

  async claim({ account, targetType, targetId, authorId, text }) {
    const where = {
      instagramAccountId_targetType_targetId: {
        instagramAccountId: account.id,
        targetType,
        targetId,
      },
    };
    const existing = await prisma.engagementLog.findUnique({
      where,
      select: { id: true, action: true },
    });
    if (existing) {
      // Only an unfinished attempt is picked up again.
      return existing.action === "PENDING" || existing.action === "SENDING"
        ? { id: existing.id, action: existing.action }
        : null;
    }
    try {
      const created = await prisma.engagementLog.create({
        data: {
          workspaceId: account.workspaceId,
          instagramAccountId: account.id,
          targetType,
          targetId,
          authorId,
          text: text.slice(0, MAX_STORED_TEXT),
        },
        select: { id: true, action: true },
      });
      return { id: created.id, action: created.action };
    } catch (error) {
      // Another worker claimed it between the read and the write.
      if (isUniqueViolation(error)) return null;
      throw error;
    }
  },

  async update(id, data) {
    await prisma.engagementLog.update({ where: { id }, data });
  },

  countSince(accountId, actions: EngageAction[], since) {
    return prisma.engagementLog.count({
      where: { instagramAccountId: accountId, action: { in: actions }, createdAt: { gte: since } },
    });
  },

  async senderAnsweredSince(accountId, authorId, since) {
    const count = await prisma.engagementLog.count({
      where: {
        instagramAccountId: accountId,
        authorId,
        targetType: "MESSAGE",
        action: "REPLIED",
        createdAt: { gte: since },
      },
    });
    return count > 0;
  },

  commentCampaigns(accountId, mediaIds) {
    return prisma.automation.findMany({
      where: {
        instagramAccountId: accountId,
        isActive: true,
        OR: [{ postId: { in: mediaIds } }, { matchAnyPost: true }],
      },
      select: { keywords: true, wholeWordMatch: true, matchAnyWord: true },
    });
  },

  dmCampaigns(accountId) {
    return prisma.automation.findMany({
      where: { instagramAccountId: accountId, isActive: true, dmTriggerEnabled: true },
      select: { keywords: true, wholeWordMatch: true, matchAnyWord: true },
    });
  },
};

async function contextFor(account: EngageAccount) {
  const record = await prisma.instagramAccount.findUniqueOrThrow({
    where: { id: account.id },
    select: {
      provider: true,
      workspaceId: true,
      zernioAccountId: true,
      instagramId: true,
      accessToken: true,
    },
  });
  return createInstagramContext(record);
}

export const instagramSender: EngageSender = {
  async publicReply(account, commentId, text) {
    await sendCommentReply({ context: await contextFor(account), commentId, message: text });
  },
  async privateReply(account, commentId, text) {
    await sendPrivateReply({
      context: await contextFor(account),
      instagramAccountId: account.instagramId,
      commentId,
      message: text,
    });
  },
  async directMessage(account, userId, text) {
    await sendDirectMessage({
      context: await contextFor(account),
      instagramAccountId: account.instagramId,
      userId,
      message: text,
    });
  },
};

export function createEngageDeps(config: EngageConfig): EngageDeps {
  return {
    config,
    store: prismaStore,
    sender: instagramSender,
    notify: (subject, body) => notifyOwner(config, subject, body),
    classifyComment: (text) => classifyComment(config, text),
    classifyDm: (text) => classifyDm(config, text),
    async scheduleLater(name, data: EngageJob, delayMs, jobId) {
      await getEngageQueue().add(name, data, { delay: delayMs, jobId });
    },
    now: () => Date.now(),
    random: () => Math.random(),
  };
}
