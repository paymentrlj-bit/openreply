import type { Language } from "./types";

/**
 * Safety checks every reply must pass before it is sent. A model reply that
 * fails any check is replaced by a fixed template, never posted.
 */

export const PUBLIC_MAX_LENGTH = 220;
export const PRIVATE_MAX_LENGTH = 450;
const MAX_EMOJI = 3;

const DIGITS = /[0-9०-९]/;
const LINK = /https?:\/\/|www\.|\b[a-z0-9-]+\.(?:com|in|co|org|net|app|io|me)\b/i;
const MENTION = /@\S/;
const MONEY_OR_PROMISE =
  /[₹$€%]|\b(?:rs|inr|rupees?|rupaye|discount|offers?|sale|free|guarantee[ds]?|assured|cashback)\b|रुपय|रुपये|सूट|ऑफर|डिस्काउंट|मोफत|मुफ्त|गॅरंटी|गारंटी/iu;
const DEVANAGARI = /[ऀ-ॿ]/;
const EMOJI = /\p{Extended_Pictographic}/gu;

export type GuardResult =
  | { ok: true; text: string }
  | { ok: false; reason: string };

export function checkReply(
  raw: string,
  options: { language: Language; maxLength: number }
): GuardResult {
  let text = raw.replace(/\s+/g, " ").trim();
  // Models sometimes wrap the answer in quotes.
  text = text.replace(/^["'“”‘’]+|["'“”‘’]+$/g, "").trim();

  if (!text) return { ok: false, reason: "empty" };
  if (!/\p{L}/u.test(text)) return { ok: false, reason: "no words" };
  if ([...text].length > options.maxLength) return { ok: false, reason: "too long" };
  if (DIGITS.test(text)) return { ok: false, reason: "contains a number" };
  if (LINK.test(text)) return { ok: false, reason: "contains a link" };
  if (MENTION.test(text)) return { ok: false, reason: "contains a mention or email" };
  if (MONEY_OR_PROMISE.test(text)) {
    return { ok: false, reason: "mentions money, an offer or a promise" };
  }
  if ((text.match(EMOJI) ?? []).length > MAX_EMOJI) {
    return { ok: false, reason: "too many emoji" };
  }

  const hasDevanagari = DEVANAGARI.test(text);
  if ((options.language === "mr" || options.language === "hi") && !hasDevanagari) {
    return { ok: false, reason: "wrong script for the language" };
  }
  if (
    (options.language === "en" ||
      options.language === "mr_latn" ||
      options.language === "hi_latn") &&
    hasDevanagari
  ) {
    return { ok: false, reason: "wrong script for the language" };
  }

  return { ok: true, text };
}
