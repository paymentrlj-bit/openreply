/**
 * Answers written by the shop owner. Each entry is used when a comment or
 * message contains any of the keywords (case does not matter). The reply is
 * sent exactly as written, so numbers and timings are allowed here, unlike
 * replies written by the AI model.
 *
 * Add the reply for each language you want. English is used when a language
 * is missing. Keep replies short (under about 200 characters).
 *
 * Example:
 *   {
 *     id: "timings",
 *     keywords: ["timing", "open", "close", "वेळ", "kitne baje"],
 *     replies: {
 *       en: "We are open every day from 10 am to 8 pm 🙏",
 *       mr: "आम्ही रोज सकाळी १० ते रात्री ८ पर्यंत उघडे असतो 🙏",
 *     },
 *   },
 */

export interface FaqEntry {
  id: string;
  keywords: string[];
  replies: Partial<Record<"en" | "mr" | "mr_latn" | "hi" | "hi_latn", string>>;
}

export const CUSTOM_FAQ: FaqEntry[] = [];
