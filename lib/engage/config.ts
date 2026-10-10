/**
 * Settings for the smart engagement engine, read from environment variables
 * on the worker. Everything defaults to a safe, switched-off state.
 */

export type EngageMode = "off" | "dry-run" | "live";
export type LlmProvider = "gemini" | "openai";

export interface EngageConfig {
  mode: EngageMode;
  llm: {
    provider: LlmProvider;
    apiKey: string;
    model: string;
    // Tried once when the main model is rate limited or down. Empty = none.
    fallbackModel: string;
    // Only used by the "openai" provider (OpenRouter and any OpenAI-compatible API).
    baseUrl: string;
    // On OpenRouter, only route to providers that do not keep or train on
    // prompts. Ignored for other services.
    denyDataCollection: boolean;
  };
  maxPerHour: number;
  maxPerDay: number;
  // Public replies are held back by a random delay in this range so the
  // account does not answer every comment instantly.
  minDelaySeconds: number;
  maxDelaySeconds: number;
  // Comments and messages older than this are left alone.
  maxAgeHours: number;
  // Below this model confidence the engine does nothing.
  minConfidence: number;
  // Send a private feedback-request reply to people who complain.
  complaintDm: boolean;
  // Thank people who send an emoji or a short thanks in DMs.
  dmReactions: boolean;
  // Answer common comments from fixed rules without calling the AI model.
  faq: boolean;
  alertEmail: string | null;
  // Local hour (India time) at which the daily digest email goes out.
  digestHourIst: number;
  extraRules: string;
}

function num(value: string | undefined, fallback: number): number {
  if (value === undefined || value.trim() === "") return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function bool(value: string | undefined, fallback: boolean): boolean {
  if (value === undefined || value.trim() === "") return fallback;
  return ["1", "true", "yes", "on"].includes(value.trim().toLowerCase());
}

export function readEngageConfig(
  env: Record<string, string | undefined> = process.env
): EngageConfig {
  const rawMode = (env.ENGAGE_MODE ?? "off").trim().toLowerCase();
  const mode: EngageMode =
    rawMode === "live" || rawMode === "dry-run" ? rawMode : "off";

  const provider: LlmProvider =
    (env.ENGAGE_LLM_PROVIDER ?? "gemini").trim().toLowerCase() === "openai"
      ? "openai"
      : "gemini";

  const minDelay = Math.max(0, num(env.ENGAGE_MIN_DELAY_SECONDS, 45));
  const maxDelay = Math.max(minDelay, num(env.ENGAGE_MAX_DELAY_SECONDS, 600));

  return {
    mode,
    llm: {
      provider,
      apiKey: (env.ENGAGE_LLM_API_KEY ?? "").trim(),
      model:
        (env.ENGAGE_LLM_MODEL ?? "").trim() ||
        (provider === "gemini" ? "gemini-flash-latest" : ""),
      fallbackModel: (env.ENGAGE_LLM_FALLBACK_MODEL ?? "").trim(),
      baseUrl: (env.ENGAGE_LLM_BASE_URL ?? "https://openrouter.ai/api/v1")
        .trim()
        .replace(/\/+$/, ""),
      denyDataCollection: bool(env.ENGAGE_LLM_DENY_DATA_COLLECTION, true),
    },
    maxPerHour: Math.max(1, num(env.ENGAGE_MAX_PER_HOUR, 60)),
    maxPerDay: Math.max(1, num(env.ENGAGE_MAX_PER_DAY, 500)),
    minDelaySeconds: minDelay,
    maxDelaySeconds: maxDelay,
    maxAgeHours: Math.max(1, num(env.ENGAGE_MAX_AGE_HOURS, 24)),
    minConfidence: Math.min(1, Math.max(0, num(env.ENGAGE_MIN_CONFIDENCE, 0.7))),
    complaintDm: bool(env.ENGAGE_COMPLAINT_DM, true),
    dmReactions: bool(env.ENGAGE_DM_REACTIONS, true),
    faq: bool(env.ENGAGE_FAQ, true),
    alertEmail: (env.ENGAGE_ALERT_EMAIL ?? "").trim() || null,
    digestHourIst: Math.min(23, Math.max(0, Math.floor(num(env.ENGAGE_DIGEST_HOUR_IST, 21)))),
    extraRules: (env.ENGAGE_EXTRA_RULES ?? "").trim().slice(0, 600),
  };
}

/** Why the engine cannot run, or null when it is ready. */
export function engageProblem(config: EngageConfig): string | null {
  if (config.mode === "off") return null;
  if (!config.llm.apiKey) return "ENGAGE_LLM_API_KEY is not set";
  if (!config.llm.model) return "ENGAGE_LLM_MODEL is not set";
  return null;
}
