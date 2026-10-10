import { describe, expect, it, vi } from "vitest";
import { readEngageConfig, engageProblem } from "@/lib/engage/config";
import { generateJson, LlmError, parseJsonLoose } from "@/lib/engage/llm";

describe("readEngageConfig", () => {
  it("defaults to off with safe limits", () => {
    const c = readEngageConfig({});
    expect(c.mode).toBe("off");
    expect(c.llm.provider).toBe("gemini");
    expect(c.maxPerHour).toBe(20);
    expect(c.complaintDm).toBe(true);
    expect(c.alertEmail).toBeNull();
  });

  it("reads and sanitises settings", () => {
    const c = readEngageConfig({
      ENGAGE_MODE: "LIVE",
      ENGAGE_LLM_PROVIDER: "openai",
      ENGAGE_LLM_API_KEY: " key ",
      ENGAGE_LLM_MODEL: "some/model",
      ENGAGE_LLM_BASE_URL: "https://example.test/v1/",
      ENGAGE_MIN_DELAY_SECONDS: "100",
      ENGAGE_MAX_DELAY_SECONDS: "50",
      ENGAGE_COMPLAINT_DM: "false",
      ENGAGE_ALERT_EMAIL: "owner@example.com",
      ENGAGE_MIN_CONFIDENCE: "5",
    });
    expect(c.mode).toBe("live");
    expect(c.llm).toEqual({
      provider: "openai",
      apiKey: "key",
      model: "some/model",
      baseUrl: "https://example.test/v1",
      denyDataCollection: true,
    });
    // The maximum delay can never be below the minimum.
    expect(c.maxDelaySeconds).toBe(100);
    expect(c.complaintDm).toBe(false);
    expect(c.minConfidence).toBe(1);
    expect(c.alertEmail).toBe("owner@example.com");
  });

  it("treats an unknown mode as off", () => {
    expect(readEngageConfig({ ENGAGE_MODE: "yes please" }).mode).toBe("off");
  });

  it("reports what is missing when switched on", () => {
    expect(engageProblem(readEngageConfig({}))).toBeNull();
    expect(engageProblem(readEngageConfig({ ENGAGE_MODE: "dry-run" }))).toMatch(/API_KEY/);
    expect(
      engageProblem(readEngageConfig({ ENGAGE_MODE: "live", ENGAGE_LLM_API_KEY: "k" }))
    ).toBeNull();
    expect(
      engageProblem(
        readEngageConfig({
          ENGAGE_MODE: "live",
          ENGAGE_LLM_API_KEY: "k",
          ENGAGE_LLM_PROVIDER: "openai",
        })
      )
    ).toMatch(/MODEL/);
  });
});

describe("parseJsonLoose", () => {
  it("parses plain, fenced and surrounded JSON", () => {
    expect(parseJsonLoose('{"a":1}')).toEqual({ a: 1 });
    expect(parseJsonLoose('<think>hmm {"x":0}</think>{"a":1}')).toEqual({ a: 1 });
    expect(parseJsonLoose('```json\n{"a":1}\n```')).toEqual({ a: 1 });
    expect(parseJsonLoose('Sure! {"a":1} Hope that helps')).toEqual({ a: 1 });
  });
  it("throws on text without JSON", () => {
    expect(() => parseJsonLoose("no json here")).toThrow(LlmError);
  });
});

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status });
}

describe("generateJson", () => {
  it("calls Gemini with the key in a header, never in the URL", async () => {
    const config = readEngageConfig({ ENGAGE_MODE: "live", ENGAGE_LLM_API_KEY: "secret-key" });
    const fetchMock = vi.fn(async () =>
      jsonResponse({ candidates: [{ content: { parts: [{ text: '{"category":"praise"}' }] } }] })
    );
    const result = await generateJson(config, "SYSTEM", "USER", fetchMock);
    expect(result).toEqual({ category: "praise" });

    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toContain("generativelanguage.googleapis.com");
    expect(url).not.toContain("secret-key");
    expect((init.headers as Record<string, string>)["x-goog-api-key"]).toBe("secret-key");
    const body = JSON.parse(String(init.body));
    expect(body.systemInstruction.parts[0].text).toBe("SYSTEM");
    expect(body.contents[0].parts[0].text).toBe("USER");
  });

  it("calls an OpenAI-compatible API such as OpenRouter", async () => {
    const config = readEngageConfig({
      ENGAGE_LLM_PROVIDER: "openai",
      ENGAGE_LLM_API_KEY: "k",
      ENGAGE_LLM_MODEL: "m",
    });
    const fetchMock = vi.fn(async () =>
      jsonResponse({ choices: [{ message: { content: '{"ok":true}' } }] })
    );
    expect(await generateJson(config, "S", "U", fetchMock)).toEqual({ ok: true });
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://openrouter.ai/api/v1/chat/completions");
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer k");
  });

  it("asks OpenRouter to avoid providers that keep or train on prompts", async () => {
    const make = (extra: Record<string, string> = {}) =>
      readEngageConfig({
        ENGAGE_LLM_PROVIDER: "openai",
        ENGAGE_LLM_API_KEY: "k",
        ENGAGE_LLM_MODEL: "m",
        ...extra,
      });
    const bodyFor = async (config: ReturnType<typeof make>) => {
      const fetchMock = vi.fn(async () =>
        jsonResponse({ choices: [{ message: { content: "{}" } }] })
      );
      await generateJson(config, "S", "U", fetchMock);
      return JSON.parse(String((fetchMock.mock.calls[0] as unknown as [string, RequestInit])[1].body));
    };

    expect((await bodyFor(make())).provider).toEqual({ data_collection: "deny" });
    // Asks OpenRouter models to answer without a long "thinking" phase.
    expect((await bodyFor(make())).reasoning).toEqual({ enabled: false });
    expect(
      (await bodyFor(make({ ENGAGE_LLM_BASE_URL: "https://api.example.test/v1" }))).reasoning
    ).toBeUndefined();
    // Can be switched off, and is never sent to other services.
    expect((await bodyFor(make({ ENGAGE_LLM_DENY_DATA_COLLECTION: "false" }))).provider).toBeUndefined();
    expect(
      (await bodyFor(make({ ENGAGE_LLM_BASE_URL: "https://api.example.test/v1" }))).provider
    ).toBeUndefined();
  });

  it("marks rate limits and server errors as retryable, other errors as not", async () => {
    const config = readEngageConfig({ ENGAGE_LLM_API_KEY: "k" });
    const failWith = (status: number) =>
      generateJson(config, "S", "U", async () => jsonResponse({ error: "x" }, status));
    await expect(failWith(429)).rejects.toMatchObject({ retryable: true, status: 429 });
    await expect(failWith(503)).rejects.toMatchObject({ retryable: true });
    await expect(failWith(400)).rejects.toMatchObject({ retryable: false });
  });

  it("never puts the response body in the error", async () => {
    const config = readEngageConfig({ ENGAGE_LLM_API_KEY: "k" });
    const error = (await generateJson(config, "S", "U", async () =>
      jsonResponse({ echo: "customer text" }, 400)
    ).catch((e: unknown) => e)) as Error;
    expect(String(error.message)).not.toContain("customer text");
  });

  it("treats a network failure as retryable", async () => {
    const config = readEngageConfig({ ENGAGE_LLM_API_KEY: "k" });
    await expect(
      generateJson(config, "S", "U", async () => {
        throw new Error("boom");
      })
    ).rejects.toMatchObject({ retryable: true });
  });
});
