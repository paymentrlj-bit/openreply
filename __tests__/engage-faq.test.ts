import { describe, expect, it, vi } from "vitest";
import { classifyComment, classifyDm } from "@/lib/engage/classify";
import { readEngageConfig } from "@/lib/engage/config";
import { decideComment, decideDm } from "@/lib/engage/decide";
import { detectLanguage, matchFaq } from "@/lib/engage/faq";
import type { FaqEntry } from "@/lib/engage/faq-entries";

const config = readEngageConfig({ ENGAGE_MODE: "live", ENGAGE_LLM_API_KEY: "k" });

const timings: FaqEntry = {
  id: "timings",
  keywords: ["timing", "kitne baje", "वेळ"],
  replies: { en: "We are open 10 am to 8 pm every day 🙏", mr: "आम्ही रोज १० ते ८ उघडे असतो 🙏" },
};

describe("detectLanguage", () => {
  it.each([
    ["Where is your shop?", "en"],
    ["दुकान कुठे आहे", "mr"],
    ["आपका पता क्या है", "hi"],
    ["rate kay aahe", "mr_latn"],
    ["aaj ka rate kya hai", "hi_latn"],
  ])("%s -> %s", (text, expected) => {
    expect(detectLanguage(text)).toBe(expected);
  });
});

describe("matchFaq", () => {
  it("answers rate and location comments in the person's language", () => {
    expect(matchFaq("Rate?", "comment", "s")).toMatchObject({ category: "question_price", language: "en" });
    expect(matchFaq("आजचा भाव काय", "comment", "s")?.reply).toContain("RATE");
    expect(matchFaq("shop kuthe aahe", "comment", "s")).toMatchObject({
      category: "question_location",
      language: "mr_latn",
    });
  });

  it("thanks plain praise only", () => {
    expect(matchFaq("So beautiful ❤️", "comment", "s")?.category).toBe("praise");
    expect(matchFaq("खूप सुंदर आहे", "comment", "s")?.category).toBe("praise");
    expect(matchFaq("beautiful but my order is not here", "comment", "s")).toBeNull();
    expect(matchFaq("beautiful @friend look", "comment", "s")).toBeNull();
  });

  it("never answers unhappy comments, even when they mention the rate", () => {
    expect(matchFaq("worst service, rate is a fraud", "comment", "s")).toBeNull();
    expect(matchFaq("खराब सेवा भाव जास्त", "comment", "s")).toBeNull();
  });

  it("leaves long comments to the model", () => {
    expect(matchFaq("I was wondering what the rate is for the chain you posted last week", "comment", "s")).toBeNull();
  });

  it("uses the owner's entries for comments and messages, in the right language", () => {
    expect(matchFaq("What are your timings?", "message", "s", [timings])?.reply).toContain("10 am");
    expect(matchFaq("दुकानाची वेळ काय", "comment", "s", [timings])?.reply).toContain("उघडे");
    // Missing language falls back to English.
    expect(matchFaq("timing kya hai", "comment", "s", [timings])?.reply).toContain("10 am");
  });

  it("does not answer rate or praise in messages", () => {
    expect(matchFaq("rate?", "message", "s", [])).toBeNull();
    expect(matchFaq("nice", "message", "s", [])).toBeNull();
  });
});

describe("FAQ in the engine", () => {
  it("skips the model for FAQ comments and sends the owner's wording as written", async () => {
    const generate = vi.fn();
    const result = await classifyComment(config, "Rate?", generate);
    expect(generate).not.toHaveBeenCalled();
    expect(result).toMatchObject({ category: "question_price", trusted: true, confidence: 1 });
    expect(decideComment(result, config, "id")).toMatchObject({ kind: "public_reply", usedFallback: false });
  });

  it("sends a trusted reply even with numbers, which the AI checks would block", () => {
    const decision = decideComment(
      { category: "question_other", language: "en", confidence: 1, reply: "Open 10 am to 8 pm 🙏", trusted: true },
      config,
      "id"
    );
    expect(decision).toEqual({ kind: "public_reply", text: "Open 10 am to 8 pm 🙏", usedFallback: false });
    const dm = decideDm(
      { category: "thanks", language: "en", confidence: 1, reply: "Open 10 am to 8 pm 🙏", trusted: true },
      readEngageConfig({ ENGAGE_MODE: "live", ENGAGE_LLM_API_KEY: "k", ENGAGE_DM_REACTIONS: "false" }),
      "id"
    );
    expect(dm).toMatchObject({ kind: "reply" });
  });

  it("can be switched off, and then everything goes to the model", async () => {
    const off = readEngageConfig({ ENGAGE_MODE: "live", ENGAGE_LLM_API_KEY: "k", ENGAGE_FAQ: "false" });
    const generate = vi.fn(async () => ({ category: "question_price", language: "en", confidence: 0.9, reply: "x" }));
    await classifyComment(off, "Rate?", generate);
    expect(generate).toHaveBeenCalledTimes(1);
  });

  it("does not answer ordinary messages from the built-in rules", async () => {
    const generate = vi.fn(async () => ({ category: "question", language: "en", confidence: 0.9, reply: "" }));
    await classifyDm(config, "What is the rate today?", generate);
    expect(generate).toHaveBeenCalledTimes(1);
  });
});
