import { describe, expect, it } from "vitest";
import { checkReply } from "@/lib/engage/guard";
import { isEmojiOnly } from "@/lib/engage/classify";
import { pickReactionReply, pickTemplate, type TemplateKind } from "@/lib/engage/templates";
import type { Language } from "@/lib/engage/types";

const opts = (language: Language, maxLength = 220) => ({ language, maxLength });

describe("checkReply", () => {
  it("accepts a short warm reply and trims quotes", () => {
    expect(checkReply('"Thank you so much! 🙏💛"', opts("en"))).toEqual({
      ok: true,
      text: "Thank you so much! 🙏💛",
    });
  });

  it.each([
    ["a number", "Rates start at 50000"],
    ["a Devanagari number", "भाव ५० आहे"],
    ["a link", "Visit www.rljewels.com today"],
    ["a domain", "See rljewels.com"],
    ["a mention", "Thanks @someone"],
    ["a currency symbol", "Only ₹ for you"],
    ["a discount", "We have a big discount for you"],
    ["a promise", "We guarantee the best quality"],
    ["too many emoji", "Thanks 🙏💛✨💍"],
  ])("rejects %s", (_name, text) => {
    expect(checkReply(text, opts("en")).ok).toBe(false);
  });

  it("rejects empty, wordless and overlong replies", () => {
    expect(checkReply("   ", opts("en")).ok).toBe(false);
    expect(checkReply("🙏🙏", opts("en")).ok).toBe(false);
    expect(checkReply("a".repeat(300), opts("en")).ok).toBe(false);
  });

  it("requires the script to match the language", () => {
    expect(checkReply("धन्यवाद! 🙏", opts("mr")).ok).toBe(true);
    expect(checkReply("Thank you!", opts("mr")).ok).toBe(false);
    expect(checkReply("Dhanyawad! 🙏", opts("mr_latn")).ok).toBe(true);
    expect(checkReply("धन्यवाद", opts("mr_latn")).ok).toBe(false);
    expect(checkReply("धन्यवाद", opts("en")).ok).toBe(false);
    // An unknown language accepts either script.
    expect(checkReply("धन्यवाद", opts("other")).ok).toBe(true);
  });
});

describe("Marathi checks", () => {
  it("rejects Hindi words in Devanagari Marathi but accepts real Marathi", () => {
    expect(checkReply("आपका बहुत धन्यवाद!", opts("mr")).ok).toBe(false);
    expect(checkReply("तुमचा अनुभव कसा होता? हे आमचे भाग्य आहे", opts("mr")).ok).toBe(true);
    expect(checkReply("मनापासून धन्यवाद! 🙏💛", opts("mr")).ok).toBe(true);
  });

  it("rejects Hindi words in Marathi written in English letters", () => {
    expect(checkReply("Aapka bahut shukriya", opts("mr_latn")).ok).toBe(false);
    expect(checkReply("Khup khup dhanyawad, tumche swagat aahe", opts("mr_latn")).ok).toBe(true);
  });

  it("does not apply the Marathi checks to Hindi", () => {
    expect(checkReply("आपका बहुत धन्यवाद", opts("hi")).ok).toBe(true);
  });
});

describe("fixed templates", () => {
  const kinds: TemplateKind[] = [
    "thanks",
    "question_price",
    "question_location",
    "question_other",
    "complaint_dm",
  ];
  const languages: Language[] = ["en", "mr", "mr_latn", "hi", "hi_latn", "other"];

  it.each(kinds.flatMap((kind) => languages.map((language) => [kind, language] as const)))(
    "%s in %s passes every safety check",
    (kind, language) => {
      // Try several seeds so every variant is covered.
      for (const seed of ["a", "b", "c", "d", "e", "f", "g"]) {
        const text = pickTemplate(kind, language, seed);
        const max = kind === "complaint_dm" ? 450 : 220;
        expect(checkReply(text, opts(language, max)), `${kind}/${language}: ${text}`).toMatchObject({
          ok: true,
        });
      }
    }
  );

  it("reaction replies pass the checks too", () => {
    for (const seed of ["a", "b", "c", "d", "e"]) {
      expect(checkReply(pickReactionReply(seed), opts("other")).ok).toBe(true);
    }
  });

  it("picks the same variant for the same seed", () => {
    expect(pickTemplate("thanks", "en", "123")).toBe(pickTemplate("thanks", "en", "123"));
  });
});

describe("isEmojiOnly", () => {
  it("detects emoji and punctuation without words", () => {
    expect(isEmojiOnly("🔥")).toBe(true);
    expect(isEmojiOnly("👏👏 !!")).toBe(true);
    expect(isEmojiOnly(".")).toBe(true);
  });
  it("is false for anything with letters or digits", () => {
    expect(isEmojiOnly("nice 🔥")).toBe(false);
    expect(isEmojiOnly("सुंदर")).toBe(false);
    expect(isEmojiOnly("10")).toBe(false);
    expect(isEmojiOnly("   ")).toBe(false);
  });
});
