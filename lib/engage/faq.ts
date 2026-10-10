import type { Language } from "./types";
import { pickTemplate } from "./templates";
import { CUSTOM_FAQ, type FaqEntry } from "./faq-entries";

/**
 * Answers the most common comments and messages without calling the AI model,
 * which saves tokens and gives the same trusted wording every time. Anything
 * that is not clearly one of these goes on to the model as before.
 */

export type FaqLanguage = Exclude<Language, "other">;

export interface FaqHit {
  category: "praise" | "question_price" | "question_location" | "question_other";
  language: FaqLanguage;
  reply: string;
}

const DEVANAGARI = /[ऀ-ॿ]/;
const HINDI_DEVANAGARI =
  /(?<![\p{L}\p{M}])(?:है|हैं|क्या|कितना|कितने|कहाँ|कहां|आपका|आपकी|आपके|बहुत|नहीं|कीजिए|करें)(?![\p{L}\p{M}])/u;
const MARATHI_LATIN =
  /\b(?:aahe|ahe|aahet|kay|kuthe|kutha|kiti|tumhi|tumche|tumchya|mala|amhala|kasa|kashi|khup|khoop|pahije)\b/i;
const HINDI_LATIN =
  /\b(?:kya|hai|hain|kahan|kaha|kitna|kitne|aapka|aapki|bahut|bohot|chahiye|batao|bataiye)\b/i;

// Anything that sounds unhappy is never answered from here: it goes to the
// model, which handles complaints carefully.
const UNHAPPY =
  /\b(?:late|delay|delayed|bad|worst|fraud|fake|cheat|cheated|scam|angry|refund|complaint|problem|poor|waste|bakwas|dhoka|kharab|nahi mila|not received)\b|खराब|फसवणूक|फसवले|धोका|तक्रार|बकवास|नाराज|उशीर/iu;

const MAX_WORDS = 8;
const MAX_LENGTH = 90;

export function detectLanguage(text: string): FaqLanguage {
  if (DEVANAGARI.test(text)) return HINDI_DEVANAGARI.test(text) ? "hi" : "mr";
  if (MARATHI_LATIN.test(text)) return "mr_latn";
  if (HINDI_LATIN.test(text)) return "hi_latn";
  return "en";
}

function normalise(text: string): string {
  return text
    .toLowerCase()
    .replace(/\p{Extended_Pictographic}|️|‍/gu, " ")
    .replace(/[^\p{L}\p{M}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const PRICE =
  /(?<![\p{L}\p{M}])(?:rate|rates|price|prices|bhav|bhaav|bhaw|kimat|kimmat|cost|dar|रेट|भाव|किंमत|कीमत|दर)(?![\p{L}\p{M}])/u;
const LOCATION =
  /(?<![\p{L}\p{M}])(?:where|address|location|kuthe|kutha|kahan|kaha|pata|patta|कुठे|पत्ता|पता|कहाँ|कहां|लोकेशन)(?![\p{L}\p{M}])/u;

const PRAISE_WORDS = new Set(
  (
    "nice beautiful gorgeous lovely superb stunning awesome amazing wow love loved pretty elegant classy great " +
    "perfect wonderful so very too really it this design designs collection jewellery jewelry gold set necklace " +
    "ring rings chain bangle bangles earrings and so much super " +
    "खूप सुंदर छान मस्त भारी अप्रतिम आवडले आहे एकदम खुपच दागिने " +
    "khup khoop sundar sunder chan chhan mast bhari aprateem aahe ahe ekdam ekdum zakas jhakas awadla avadla " +
    "bahut bohot badhiya shandar kamaal"
  ).split(" ")
);

function isPlainPraise(normalised: string): boolean {
  const words = normalised.split(" ");
  return words.length > 0 && words.every((word) => PRAISE_WORDS.has(word));
}

/** Devanagari keywords match anywhere; Latin ones only as whole words or phrases. */
function hasKeyword(normalised: string, keyword: string): boolean {
  const wanted = normalise(keyword);
  if (!wanted) return false;
  if (DEVANAGARI.test(wanted)) return normalised.includes(wanted);
  return ` ${normalised} `.includes(` ${wanted} `);
}

function customHit(normalised: string, language: FaqLanguage, entries: FaqEntry[]): FaqHit | null {
  const askingPrice = PRICE.test(normalised);
  for (const entry of entries) {
    if (entry.yieldsToRate && askingPrice) continue;
    if (!entry.keywords.some((keyword) => hasKeyword(normalised, keyword))) continue;
    const reply = entry.replies[language] ?? entry.replies.en;
    if (reply) return { category: "question_other", language, reply };
  }
  return null;
}

/**
 * `scope` "comment" also answers rate, location and plain-praise comments.
 * `scope` "message" only uses the owner's own entries, since people who write
 * to the shop directly deserve an answer from a person unless the owner has
 * written one.
 */
export function matchFaq(
  text: string,
  scope: "comment" | "message",
  seed: string,
  entries: FaqEntry[] = CUSTOM_FAQ
): FaqHit | null {
  const normalised = normalise(text);
  if (!normalised || text.length > MAX_LENGTH * 3) return null;
  if (UNHAPPY.test(normalised)) return null;

  const language = detectLanguage(text);

  const custom = customHit(normalised, language, entries);
  if (custom) return custom;

  if (scope !== "comment") return null;
  if (normalised.length > MAX_LENGTH || normalised.split(" ").length > MAX_WORDS) return null;

  if (PRICE.test(normalised)) {
    return { category: "question_price", language, reply: pickTemplate("question_price", language, seed) };
  }
  if (LOCATION.test(normalised)) {
    return {
      category: "question_location",
      language,
      reply: pickTemplate("question_location", language, seed),
    };
  }
  if (isPlainPraise(normalised)) {
    return { category: "praise", language, reply: pickTemplate("thanks", language, seed) };
  }
  return null;
}
