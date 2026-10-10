import { prisma } from "@/lib/db/client";
import type { EngageConfig } from "./config";
import { notifyOwner } from "./notify";

const MAX_LISTED = 12;

/** Date (YYYY-MM-DD) and hour in India time. */
export function istParts(now: Date): { date: string; hour: number } {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-GB", {
      timeZone: "Asia/Kolkata",
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
    })
      .formatToParts(now)
      .map((part) => [part.type, part.value])
  );
  return {
    date: `${parts.year}-${parts.month}-${parts.day}`,
    hour: Number(parts.hour),
  };
}

function clip(text: string | null | undefined, max: number): string {
  const flat = (text ?? "").replace(/\s+/g, " ").trim();
  return flat.length > max ? `${flat.slice(0, max)}…` : flat;
}

interface DigestRow {
  targetType: "COMMENT" | "MESSAGE";
  category: string | null;
  language: string | null;
  action: string;
  text: string;
  replyText: string | null;
  reason: string | null;
  usedFallback: boolean;
}

export function formatDigest(rows: DigestRow[], mode: string, date: string): string | null {
  if (rows.length === 0) return null;

  const counts = new Map<string, number>();
  for (const row of rows) counts.set(row.action, (counts.get(row.action) ?? 0) + 1);

  const lines: string[] = [
    `RL Jewels smart replies, ${date}`,
    `Mode: ${mode}`,
    "",
    `Looked at ${rows.length} comments and messages in the last 24 hours:`,
    ...[...counts.entries()].map(([action, n]) => `  ${action}: ${n}`),
  ];

  const section = (title: string, items: DigestRow[], showReply: boolean) => {
    if (items.length === 0) return;
    lines.push("", title);
    for (const row of items.slice(0, MAX_LISTED)) {
      const kind = row.targetType === "COMMENT" ? "comment" : "message";
      lines.push(`- (${kind}, ${row.category ?? "?"}, ${row.language ?? "?"}) "${clip(row.text, 90)}"`);
      if (showReply && row.replyText) lines.push(`    reply: ${clip(row.replyText, 140)}`);
    }
    if (items.length > MAX_LISTED) lines.push(`  …and ${items.length - MAX_LISTED} more`);
  };

  section("Needs your attention", rows.filter((r) => r.action === "FLAGGED"), false);
  section("Replies sent", rows.filter((r) => r.action === "REPLIED" || r.action === "DM_SENT"), true);
  section("Would have been sent (test mode)", rows.filter((r) => r.action === "DRY_RUN"), true);

  const problems = rows.filter((r) => r.action === "ERROR" || r.action === "UNCONFIRMED");
  if (problems.length > 0) {
    lines.push("", `Problems: ${problems.length} (see the worker log for details)`);
  }
  return lines.join("\n");
}

/** Sends today's digest once, after the configured hour. Safe to call often. */
export async function maybeSendDigest(
  config: EngageConfig,
  now: Date = new Date()
): Promise<void> {
  if (config.mode === "off" || !config.alertEmail) return;
  const { date, hour } = istParts(now);
  if (hour < config.digestHourIst) return;

  const marker = `Engagement digest ${date}`;
  const done = await prisma.operationalEvent.findFirst({
    where: { message: marker },
    select: { id: true },
  });
  if (done) return;

  const rows = await prisma.engagementLog.findMany({
    where: { createdAt: { gte: new Date(now.getTime() - 24 * 60 * 60 * 1000) } },
    orderBy: { createdAt: "asc" },
    select: {
      targetType: true,
      category: true,
      language: true,
      action: true,
      text: true,
      replyText: true,
      reason: true,
      usedFallback: true,
    },
  });

  const body = formatDigest(rows, config.mode, date);
  if (body && !(await notifyOwner(config, `Smart replies digest, ${date}`, body))) {
    // Email failed: try again at the next check.
    return;
  }
  await prisma.operationalEvent.create({
    data: { source: "SYSTEM", level: "INFO", message: marker, payload: { rows: rows.length } },
  });
}
