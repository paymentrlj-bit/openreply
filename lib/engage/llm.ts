import type { EngageConfig } from "./config";

export class LlmError extends Error {
  constructor(
    message: string,
    public status: number | null,
    // True for rate limits, timeouts and server errors: worth retrying later.
    public retryable: boolean
  ) {
    super(message);
    this.name = "LlmError";
  }
}

const TIMEOUT_MS = 25_000;
const MAX_OUTPUT_TOKENS = 1024;

type FetchLike = (url: string, init: RequestInit) => Promise<Response>;

/** Pulls a JSON value out of a model reply, tolerating code fences. */
export function parseJsonLoose(text: string): unknown {
  // Some models print their reasoning first, wrapped in think tags.
  let body = text.replace(/<think>[\s\S]*?<\/think>/gi, "").trim();
  const fenced = body.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  if (fenced) body = fenced[1];
  try {
    return JSON.parse(body);
  } catch {
    const start = body.indexOf("{");
    const end = body.lastIndexOf("}");
    if (start >= 0 && end > start) {
      return JSON.parse(body.slice(start, end + 1));
    }
    throw new LlmError("The model did not return JSON", null, false);
  }
}

async function post(
  fetchImpl: FetchLike,
  url: string,
  headers: Record<string, string>,
  body: unknown
): Promise<unknown> {
  let response: Response;
  try {
    response = await fetchImpl(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...headers },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch (error) {
    const reason = error instanceof Error ? error.message : "network error";
    throw new LlmError(`LLM request failed: ${reason}`, null, true);
  }
  if (!response.ok) {
    const retryable = response.status === 429 || response.status >= 500;
    // Never include the response body: it can echo the request.
    throw new LlmError(`LLM returned HTTP ${response.status}`, response.status, retryable);
  }
  return response.json();
}

/**
 * Asks the configured model for a JSON answer. When the main model is rate
 * limited or down, the optional fallback model is tried once.
 */
export async function generateJson(
  config: EngageConfig,
  system: string,
  user: string,
  fetchImpl: FetchLike = fetch
): Promise<unknown> {
  try {
    return await generateWith(config, system, user, fetchImpl);
  } catch (error) {
    const fallback = config.llm.fallbackModel;
    if (!(error instanceof LlmError) || !error.retryable || !fallback || fallback === config.llm.model) {
      throw error;
    }
    return generateWith(
      {
        ...config,
        llm: {
          ...config.llm,
          model: fallback,
          // Free models only run on providers that may keep prompts, so the
          // "deny" setting would make every request fail.
          denyDataCollection: config.llm.denyDataCollection && !fallback.endsWith(":free"),
        },
      },
      system,
      user,
      fetchImpl
    );
  }
}

/**
 * One request to the configured model. Only `system` and `user` text
 * leave the server: never account tokens, usernames or ids.
 */
async function generateWith(
  config: EngageConfig,
  system: string,
  user: string,
  fetchImpl: FetchLike
): Promise<unknown> {
  const { provider, apiKey, model, baseUrl } = config.llm;

  if (provider === "gemini") {
    const data = (await post(
      fetchImpl,
      `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`,
      { "x-goog-api-key": apiKey },
      {
        systemInstruction: { parts: [{ text: system }] },
        contents: [{ role: "user", parts: [{ text: user }] }],
        generationConfig: {
          temperature: 0.5,
          responseMimeType: "application/json",
          maxOutputTokens: MAX_OUTPUT_TOKENS,
        },
      }
    )) as {
      candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
    };
    const text = data.candidates?.[0]?.content?.parts
      ?.map((part) => part.text ?? "")
      .join("");
    if (!text) throw new LlmError("The model returned no text", null, true);
    return parseJsonLoose(text);
  }

  const data = (await post(
    fetchImpl,
    `${baseUrl}/chat/completions`,
    { Authorization: `Bearer ${apiKey}` },
    {
      model,
      temperature: 0.5,
      max_tokens: MAX_OUTPUT_TOKENS,
      response_format: { type: "json_object" },
      // OpenRouter only: answer straight away instead of "thinking" first.
      ...(baseUrl.includes("openrouter.ai") ? { reasoning: { enabled: false } } : {}),
      // OpenRouter only: skip providers that retain or train on prompts.
      ...(config.llm.denyDataCollection && baseUrl.includes("openrouter.ai")
        ? { provider: { data_collection: "deny" } }
        : {}),
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
    }
  )) as { choices?: Array<{ message?: { content?: string } }> };
  const text = data.choices?.[0]?.message?.content;
  if (!text) throw new LlmError("The model returned no text", null, true);
  return parseJsonLoose(text);
}
