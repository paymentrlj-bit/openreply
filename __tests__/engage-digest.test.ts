import { describe, expect, it } from "vitest";
import { formatDigest, formatDigestCsv, istParts } from "@/lib/engage/digest";
import { parseCommentEvents } from "@/lib/meta/webhook";

describe("istParts", () => {
  it("gives India time, including across midnight UTC", () => {
    // 20:00 UTC is 01:30 the next day in India.
    expect(istParts(new Date("2026-10-10T20:00:00Z"))).toEqual({ date: "2026-10-11", hour: 1 });
    expect(istParts(new Date("2026-10-10T15:30:00Z"))).toEqual({ date: "2026-10-10", hour: 21 });
  });
});

describe("formatDigest", () => {
  const row = (over = {}) => ({
    targetType: "COMMENT" as const,
    category: "praise",
    language: "en",
    action: "REPLIED",
    text: "Beautiful necklace!",
    replyText: "Thank you so much! 🙏💛",
    reason: null,
    usedFallback: false,
    ...over,
  });

  it("returns nothing on a quiet day", () => {
    expect(formatDigest([], "live", "2026-10-10")).toBeNull();
  });

  it("lists counts, replies and anything needing attention", () => {
    const body = formatDigest(
      [
        row(),
        row({ action: "FLAGGED", category: "complaint", text: "Late delivery", replyText: null }),
        row({ action: "ERROR" }),
      ],
      "live",
      "2026-10-10"
    )!;
    expect(body).toContain("Mode: live");
    expect(body).toContain("REPLIED: 1");
    expect(body).toContain("Needs your attention");
    expect(body).toContain("Late delivery");
    expect(body).toContain("Replies sent");
    expect(body).toContain("Thank you so much");
    expect(body).toContain("Problems: 1");
  });

  it("labels test-mode rows clearly", () => {
    const body = formatDigest([row({ action: "DRY_RUN" })], "dry-run", "2026-10-10")!;
    expect(body).toContain("Would have been sent (test mode)");
  });
});

describe("parseCommentEvents parent id", () => {
  it("passes the parent id through for replies in a thread", () => {
    const events = parseCommentEvents({
      object: "instagram",
      entry: [
        {
          id: "ig1",
          time: 1,
          changes: [
            {
              field: "comments",
              value: {
                id: "c2",
                text: "thanks",
                from: { id: "u1", username: "someone" },
                media: { id: "m1" },
                parent_id: "c1",
              },
            },
          ],
        },
      ],
    });
    expect(events).toHaveLength(1);
    expect(events[0].parentId).toBe("c1");
  });
});

describe("formatDigestCsv", () => {
  it("lists every row, keeps Marathi and quotes, and defuses formulas", () => {
    const csv = formatDigestCsv([
      {
        createdAt: new Date("2026-10-10T10:00:00Z"),
        confidence: 0.93,
        targetType: "COMMENT",
        category: "praise",
        language: "mr",
        action: "REPLIED",
        text: "=HYPERLINK(\"x\") खूप सुंदर",
        replyText: 'Thank you, "friend" 🙏',
        reason: null,
        usedFallback: false,
      },
    ]);
    expect(csv.startsWith("\uFEFF")).toBe(true);
    const [header, line] = csv.slice(1).split("\r\n");
    expect(header).toContain("Our reply");
    expect(line).toContain("15:30");
    expect(line).toContain("'=HYPERLINK");
    expect(line).toContain("खूप सुंदर");
    expect(line).toContain('"Thank you, ""friend"" 🙏"');
  });
});
