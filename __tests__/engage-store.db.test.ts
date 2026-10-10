/**
 * The engagement engine's database queries, tested against a real Postgres.
 * Skipped without a database:
 *
 *   docker run --rm -d -p 55432:5432 -e POSTGRES_PASSWORD=postgres postgres:16
 *   TEST_DATABASE_URL=postgresql://postgres:postgres@localhost:55432/postgres \
 *     npx vitest run __tests__/engage-store.db.test.ts
 *
 * Each run builds the schema from prisma/migrations inside its own throwaway
 * Postgres schema and drops it at the end.
 */
import { randomBytes } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { PrismaPg } from "@prisma/adapter-pg";
import { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { PrismaClient } from "../app/generated/prisma/client";

const DATABASE_URL = process.env.TEST_DATABASE_URL;
const MIGRATIONS_DIR = path.join(__dirname, "..", "prisma", "migrations");

const state = vi.hoisted(() => ({
  db: undefined as unknown as import("../app/generated/prisma/client").PrismaClient,
}));

vi.mock("@/lib/db/client", () => ({
  get prisma() {
    return state.db;
  },
}));

import { prismaStore } from "../lib/engage/deps";
import { readEngageConfig } from "../lib/engage/config";
import { processComment, type EngageDeps } from "../lib/engage/process";

const schema = `engage_store_${randomBytes(4).toString("hex")}`;
let sql: Client;

const account = {
  id: "account_test",
  workspaceId: "workspace_test",
  instagramId: "ig_test",
  username: "rljewels_official",
  provider: "META" as const,
};

function claimInput(targetId: string, targetType: "COMMENT" | "MESSAGE" = "COMMENT", authorId = "user_1") {
  return { account, targetType, targetId, authorId, text: "hello" };
}

describe.skipIf(!DATABASE_URL)("engagement store", () => {
  beforeAll(async () => {
    sql = new Client({ connectionString: DATABASE_URL });
    await sql.connect();
    await sql.query(`CREATE SCHEMA "${schema}"`);
    await sql.query(`SET search_path TO "${schema}"`);

    const dirs = readdirSync(MIGRATIONS_DIR, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
      .sort();
    for (const dir of dirs) {
      await sql.query(readFileSync(path.join(MIGRATIONS_DIR, dir, "migration.sql"), "utf8"));
    }

    await sql.query(`
      INSERT INTO "User" ("id", "email", "updatedAt") VALUES ('user_test', 'engage@test.dev', now());
      INSERT INTO "Workspace" ("id", "name", "ownerId", "updatedAt")
        VALUES ('workspace_test', 'Engage', 'user_test', now());
      INSERT INTO "InstagramAccount" ("id", "workspaceId", "instagramId", "username", "accessToken", "updatedAt")
        VALUES ('account_test', 'workspace_test', 'ig_test', 'rljewels_official', 'token', now());
      INSERT INTO "Automation" ("id", "workspaceId", "instagramAccountId", "name", "keywords", "dmMessage", "matchAnyPost", "postId", "isActive", "dmTriggerEnabled", "updatedAt")
      VALUES
        ('auto_any', 'workspace_test', 'account_test', 'Any post', '{RATE}', 'hi', true, null, true, false, now()),
        ('auto_post', 'workspace_test', 'account_test', 'One post', '{LOCATION}', 'hi', false, 'media_1', true, false, now()),
        ('auto_other', 'workspace_test', 'account_test', 'Other post', '{OTHER}', 'hi', false, 'media_2', true, false, now()),
        ('auto_off', 'workspace_test', 'account_test', 'Inactive', '{OFF}', 'hi', true, null, false, true, now()),
        ('auto_dm', 'workspace_test', 'account_test', 'DM trigger', '{HELLO}', 'hi', false, 'media_3', true, true, now());
    `);

    state.db = new PrismaClient({
      adapter: new PrismaPg({ connectionString: DATABASE_URL }, { schema }),
    });
  }, 60_000);

  afterAll(async () => {
    await state.db?.$disconnect();
    if (sql) {
      await sql.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
      await sql.end();
    }
  });

  it("finds the account", async () => {
    expect(await prismaStore.getAccount("account_test")).toEqual(account);
    expect(await prismaStore.getAccount("missing")).toBeNull();
  });

  it("claims a target once, and lets only an unfinished claim be picked up again", async () => {
    const first = await prismaStore.claim(claimInput("c_claim"));
    expect(first).toMatchObject({ action: "PENDING" });

    // Still unfinished: a retry may continue.
    expect(await prismaStore.claim(claimInput("c_claim"))).toEqual(first);

    await prismaStore.update(first!.id, { action: "REPLIED", replyText: "Thanks" });
    expect(await prismaStore.claim(claimInput("c_claim"))).toBeNull();
  });

  it("returns a claim that was interrupted while sending so it is not resent", async () => {
    const row = await prismaStore.claim(claimInput("c_sending"));
    await prismaStore.update(row!.id, { action: "SENDING" });
    expect(await prismaStore.claim(claimInput("c_sending"))).toMatchObject({ id: row!.id, action: "SENDING" });
  });

  it("lets only one of two simultaneous claims win", async () => {
    const results = await Promise.all([
      prismaStore.claim(claimInput("c_race")),
      prismaStore.claim(claimInput("c_race")),
    ]);
    // Both may see a fresh row, but the database allows only one insert.
    const created = await state.db.engagementLog.count({ where: { targetId: "c_race" } });
    expect(created).toBe(1);
    expect(results.filter(Boolean).length).toBeGreaterThanOrEqual(1);
  });

  it("keeps comments and messages with the same id apart", async () => {
    const a = await prismaStore.claim(claimInput("same_id", "COMMENT"));
    const b = await prismaStore.claim(claimInput("same_id", "MESSAGE"));
    expect(a!.id).not.toBe(b!.id);
  });

  it("truncates long text and stores classification details", async () => {
    const row = await prismaStore.claim({ ...claimInput("c_long"), text: "x".repeat(900) });
    await prismaStore.update(row!.id, {
      category: "praise",
      language: "mr_latn",
      confidence: 0.91,
      usedFallback: true,
    });
    const saved = await state.db.engagementLog.findUniqueOrThrow({ where: { id: row!.id } });
    expect(saved.text).toHaveLength(500);
    expect(saved).toMatchObject({ category: "praise", language: "mr_latn", confidence: 0.91, usedFallback: true });
  });

  it("counts only the requested actions inside the time window", async () => {
    const mk = async (id: string, action: "REPLIED" | "DM_SENT" | "IGNORED") => {
      const row = await prismaStore.claim(claimInput(id));
      await prismaStore.update(row!.id, { action });
      return row!.id;
    };
    await mk("cnt_1", "REPLIED");
    await mk("cnt_2", "DM_SENT");
    await mk("cnt_3", "IGNORED");
    const old = await mk("cnt_old", "REPLIED");
    await sql.query(`UPDATE "EngagementLog" SET "createdAt" = now() - interval '3 hours' WHERE "id" = $1`, [old]);

    const hourAgo = new Date(Date.now() - 60 * 60 * 1000);
    const recent = await prismaStore.countSince("account_test", ["REPLIED", "DM_SENT"], hourAgo);
    const dayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const all = await prismaStore.countSince("account_test", ["REPLIED", "DM_SENT"], dayAgo);
    expect(all - recent).toBe(1);
    expect(await prismaStore.countSince("account_test", ["ERROR"], dayAgo)).toBe(0);
  });

  it("knows when a person was already answered", async () => {
    const day = new Date(Date.now() - 24 * 60 * 60 * 1000);
    expect(await prismaStore.senderAnsweredSince("account_test", "dm_user", day)).toBe(false);

    const row = await prismaStore.claim(claimInput("m_1", "MESSAGE", "dm_user"));
    await prismaStore.update(row!.id, { action: "FLAGGED" });
    expect(await prismaStore.senderAnsweredSince("account_test", "dm_user", day)).toBe(false);

    await prismaStore.update(row!.id, { action: "REPLIED" });
    expect(await prismaStore.senderAnsweredSince("account_test", "dm_user", day)).toBe(true);
    expect(await prismaStore.senderAnsweredSince("account_test", "someone_else", day)).toBe(false);
  });

  it("finds the active campaigns that can match a comment", async () => {
    const rules = await prismaStore.commentCampaigns("account_test", ["media_1"]);
    const keywords = rules.flatMap((r) => r.keywords).sort();
    // The any-post campaign and the one bound to media_1, not media_2 or the inactive one.
    expect(keywords).toEqual(["LOCATION", "RATE"]);
  });

  it("finds only active direct-message campaigns", async () => {
    const rules = await prismaStore.dmCampaigns("account_test");
    expect(rules.flatMap((r) => r.keywords)).toEqual(["HELLO"]);
  });

  it("runs a comment through the whole pipeline against the real database, once", async () => {
    const sent: string[] = [];
    const deps: EngageDeps = {
      config: readEngageConfig({ ENGAGE_MODE: "live", ENGAGE_LLM_API_KEY: "k" }),
      store: prismaStore,
      sender: {
        publicReply: async (_account, _commentId, text) => {
          sent.push(text);
        },
        privateReply: async () => {},
        directMessage: async () => {},
      },
      notify: async () => true,
      classifyComment: async () => ({
        category: "praise",
        language: "mr",
        confidence: 0.96,
        reply: "मनापासून धन्यवाद! 🙏💛",
      }),
      classifyDm: async () => ({ category: "other", language: "en", confidence: 1, reply: "" }),
      scheduleLater: async () => {},
      now: () => Date.now(),
      random: () => 0.5,
    };
    const job = {
      id: "j1",
      name: "engage-comment",
      timestamp: Date.now(),
      data: {
        accountConnectionId: "account_test",
        instagramAccountId: "ig_test",
        commentId: "c_e2e",
        commentText: "खूप सुंदर आहे",
        commenterId: "user_e2e",
        // No campaign covers this post, so the engine handles the comment.
        mediaId: "media_none",
        scheduled: true,
      },
    };

    // The any-post campaign only matches its own keyword, so this comment is the engine's.
    await processComment(deps, job);
    await processComment(deps, job);

    expect(sent).toEqual(["मनापासून धन्यवाद! 🙏💛"]);
    const row = await state.db.engagementLog.findFirstOrThrow({ where: { targetId: "c_e2e" } });
    expect(row).toMatchObject({
      action: "REPLIED",
      category: "praise",
      language: "mr",
      usedFallback: false,
    });
  });
});
