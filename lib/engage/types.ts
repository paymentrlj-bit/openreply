export const LANGUAGES = ["en", "mr", "mr_latn", "hi", "hi_latn", "other"] as const;
export type Language = (typeof LANGUAGES)[number];

export const COMMENT_CATEGORIES = [
  "praise",
  "question_price",
  "question_location",
  "question_other",
  "complaint",
  "emoji_only",
  "spam",
  "other",
] as const;
export type CommentCategory = (typeof COMMENT_CATEGORIES)[number];

export const DM_CATEGORIES = [
  "reaction",
  "thanks",
  "question",
  "complaint",
  "other",
] as const;
export type DmCategory = (typeof DM_CATEGORIES)[number];

export interface Classification<C extends string> {
  category: C;
  language: Language;
  // 0 to 1. Anything the model was unsure about is left alone.
  confidence: number;
  // Public reply, private feedback message, or "" depending on the category.
  reply: string;
  // Answered from the fixed FAQ rules without the AI model, so the reply is
  // trusted as written and is not run through the AI safety checks.
  trusted?: boolean;
}
