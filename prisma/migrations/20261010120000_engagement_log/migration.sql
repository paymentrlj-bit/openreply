-- CreateEnum
CREATE TYPE "EngagementTarget" AS ENUM ('COMMENT', 'MESSAGE');

-- CreateEnum
CREATE TYPE "EngagementAction" AS ENUM ('PENDING', 'SENDING', 'REPLIED', 'DM_SENT', 'FLAGGED', 'DRY_RUN', 'IGNORED', 'SKIPPED', 'ERROR', 'UNCONFIRMED');

-- CreateTable
CREATE TABLE "EngagementLog" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "instagramAccountId" TEXT NOT NULL,
    "targetType" "EngagementTarget" NOT NULL,
    "targetId" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "category" TEXT,
    "language" TEXT,
    "confidence" DOUBLE PRECISION,
    "action" "EngagementAction" NOT NULL DEFAULT 'PENDING',
    "reason" TEXT,
    "replyText" TEXT,
    "usedFallback" BOOLEAN NOT NULL DEFAULT false,
    "errorMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EngagementLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "EngagementLog_workspaceId_createdAt_idx" ON "EngagementLog"("workspaceId", "createdAt");

-- CreateIndex
CREATE INDEX "EngagementLog_instagramAccountId_action_createdAt_idx" ON "EngagementLog"("instagramAccountId", "action", "createdAt");

-- CreateIndex
CREATE INDEX "EngagementLog_authorId_createdAt_idx" ON "EngagementLog"("authorId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "EngagementLog_instagramAccountId_targetType_targetId_key" ON "EngagementLog"("instagramAccountId", "targetType", "targetId");

-- AddForeignKey
ALTER TABLE "EngagementLog" ADD CONSTRAINT "EngagementLog_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EngagementLog" ADD CONSTRAINT "EngagementLog_instagramAccountId_fkey" FOREIGN KEY ("instagramAccountId") REFERENCES "InstagramAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;

