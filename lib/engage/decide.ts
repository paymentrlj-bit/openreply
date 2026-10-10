import type { EngageConfig } from "./config";
import {
  checkReply,
  PRIVATE_MAX_LENGTH,
  PUBLIC_MAX_LENGTH,
} from "./guard";
import { pickReactionReply, pickTemplate, type TemplateKind } from "./templates";
import type {
  Classification,
  CommentCategory,
  DmCategory,
  Language,
} from "./types";

export type CommentDecision =
  | { kind: "public_reply"; text: string; usedFallback: boolean }
  | { kind: "private_feedback"; text: string; usedFallback: boolean }
  // Needs a person but no automatic message goes out.
  | { kind: "flag"; reason: string }
  | { kind: "ignore"; reason: string };

export type DmDecision =
  | { kind: "reply"; text: string; usedFallback: boolean }
  | { kind: "alert"; urgent: boolean; reason: string }
  | { kind: "ignore"; reason: string };

function safeOrTemplate(
  modelReply: string,
  language: Language,
  maxLength: number,
  kind: TemplateKind,
  seed: string
): { text: string; usedFallback: boolean } {
  const checked = checkReply(modelReply, { language, maxLength });
  if (checked.ok) return { text: checked.text, usedFallback: false };
  // Not sure the Marathi is right (for example Hindi crept in): a plain English
  // reply is better than a wrong Marathi one.
  if (language === "mr" || language === "mr_latn") {
    return { text: pickTemplate(kind, "en", seed), usedFallback: true };
  }
  return { text: pickTemplate(kind, language, seed), usedFallback: true };
}

export function decideComment(
  c: Classification<CommentCategory>,
  config: EngageConfig,
  seed: string
): CommentDecision {
  if (c.confidence < config.minConfidence) {
    return { kind: "ignore", reason: "low confidence" };
  }

  switch (c.category) {
    case "spam":
    case "other":
      return { kind: "ignore", reason: c.category };

    case "complaint": {
      if (!config.complaintDm) {
        return { kind: "flag", reason: "complaint" };
      }
      const r = safeOrTemplate(c.reply, c.language, PRIVATE_MAX_LENGTH, "complaint_dm", seed);
      return { kind: "private_feedback", ...r };
    }

    case "emoji_only":
      return {
        kind: "public_reply",
        text: pickReactionReply(seed),
        usedFallback: true,
      };

    case "praise": {
      const r = safeOrTemplate(c.reply, c.language, PUBLIC_MAX_LENGTH, "thanks", seed);
      return { kind: "public_reply", ...r };
    }

    case "question_price":
    case "question_location":
    case "question_other": {
      const r = safeOrTemplate(c.reply, c.language, PUBLIC_MAX_LENGTH, c.category, seed);
      return { kind: "public_reply", ...r };
    }
  }
}

export function decideDm(
  c: Classification<DmCategory>,
  config: EngageConfig,
  seed: string
): DmDecision {
  if (c.category === "reaction") {
    return config.dmReactions
      ? { kind: "reply", text: pickReactionReply(seed), usedFallback: true }
      : { kind: "ignore", reason: "reaction replies switched off" };
  }

  // Anything uncertain goes to a person rather than getting a canned answer.
  if (c.confidence < config.minConfidence) {
    return { kind: "alert", urgent: false, reason: "low confidence" };
  }

  switch (c.category) {
    case "thanks": {
      if (!config.dmReactions) {
        return { kind: "ignore", reason: "thank-you replies switched off" };
      }
      const r = safeOrTemplate(c.reply, c.language, PUBLIC_MAX_LENGTH, "thanks", seed);
      return { kind: "reply", ...r };
    }
    case "complaint":
      return { kind: "alert", urgent: true, reason: "complaint" };
    case "question":
      return { kind: "alert", urgent: false, reason: "question" };
    case "other":
      return { kind: "alert", urgent: false, reason: "needs a personal reply" };
  }
}
