import { z } from "zod";
import type { EngageConfig } from "./config";
import { matchFaq } from "./faq";
import { generateJson } from "./llm";
import {
  commentSystemPrompt,
  dmSystemPrompt,
  neutralize,
} from "./persona";
import {
  COMMENT_CATEGORIES,
  DM_CATEGORIES,
  LANGUAGES,
  type Classification,
  type CommentCategory,
  type DmCategory,
} from "./types";

/** True when the text has no letters or digits, only emoji and punctuation. */
export function isEmojiOnly(text: string): boolean {
  const trimmed = text.trim();
  return trimmed.length > 0 && trimmed.length <= 40 && !/[\p{L}\p{N}]/u.test(trimmed);
}

function schemaFor<const C extends readonly [string, ...string[]]>(categories: C) {
  return z.object({
    category: z.enum(categories),
    language: z.enum(LANGUAGES).catch("other"),
    confidence: z.number().min(0).max(1).catch(0),
    reply: z.string().catch(""),
  });
}

const commentSchema = schemaFor(COMMENT_CATEGORIES);
const dmSchema = schemaFor(DM_CATEGORIES);

type Generate = typeof generateJson;

export async function classifyComment(
  config: EngageConfig,
  text: string,
  generate: Generate = generateJson
): Promise<Classification<CommentCategory>> {
  if (isEmojiOnly(text)) {
    return { category: "emoji_only", language: "other", confidence: 1, reply: "" };
  }
  if (config.faq) {
    const hit = matchFaq(text, "comment", text);
    if (hit) {
      return { ...hit, confidence: 1, trusted: true };
    }
  }
  const raw = await generate(
    config,
    commentSystemPrompt(config.extraRules),
    `<comment>${neutralize(text)}</comment>`
  );
  const parsed = commentSchema.safeParse(raw);
  // An answer we cannot read is treated as "unsure", which does nothing.
  if (!parsed.success) {
    return { category: "other", language: "other", confidence: 0, reply: "" };
  }
  return { ...parsed.data, reply: parsed.data.reply.trim() };
}

export async function classifyDm(
  config: EngageConfig,
  text: string,
  generate: Generate = generateJson
): Promise<Classification<DmCategory>> {
  if (isEmojiOnly(text)) {
    return { category: "reaction", language: "other", confidence: 1, reply: "" };
  }
  if (config.faq) {
    const hit = matchFaq(text, "message", text);
    if (hit) {
      return { category: "thanks", language: hit.language, confidence: 1, reply: hit.reply, trusted: true };
    }
  }
  const raw = await generate(
    config,
    dmSystemPrompt(config.extraRules),
    `<message>${neutralize(text)}</message>`
  );
  const parsed = dmSchema.safeParse(raw);
  if (!parsed.success) {
    return { category: "other", language: "other", confidence: 0, reply: "" };
  }
  return { ...parsed.data, reply: parsed.data.reply.trim() };
}
