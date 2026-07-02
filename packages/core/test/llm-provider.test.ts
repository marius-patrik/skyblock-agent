import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, test } from "bun:test";
import {
  llmProviderStatus,
  publicLlmProviderConfig,
  setLlmProviderConfigValue,
  streamLlmChat,
} from "../src/llm-provider.ts";
import { readConfig } from "../src/store.ts";

let tempHome: string | null = null;

afterEach(() => {
  if (tempHome) {
    fs.rmSync(tempHome, { recursive: true, force: true });
    tempHome = null;
  }
  delete process.env.SKYAGENT_HOME;
});

function isolatedSkyAgentHome() {
  tempHome = fs.mkdtempSync(path.join(os.tmpdir(), "skyagent-provider-test-"));
  process.env.SKYAGENT_HOME = tempHome;
}

function providerConfig(overrides: Record<string, unknown> = {}) {
  return {
    llmProvider: {
      provider: "litellm",
      baseUrl: "http://user:secret@127.0.0.1:4000?api_key=hidden",
      model: "skyagent-codex",
      apiKey: "stored-secret",
      timeoutMs: 500,
      maxRetries: 1,
      rateLimit: { requestsPerMinute: 60, tokensPerMinute: 12_000 },
      budget: { maxUsd: 5, window: "daily" },
      ...overrides,
    },
  };
}

describe("LLM provider abstraction", () => {
  test("stores and redacts LiteLLM config through SkyAgent config", () => {
    isolatedSkyAgentHome();

    setLlmProviderConfigValue("provider", "litellm");
    setLlmProviderConfigValue("base-url", "http://user:secret@localhost:4000?token=abc");
    setLlmProviderConfigValue("model", "skyagent-codex");
    const redacted = setLlmProviderConfigValue("api-key", "sk-secret");

    expect(redacted).toMatchObject({
      provider: "litellm",
      configured: true,
      model: "skyagent-codex",
      auth: { apiKeyConfigured: true, apiKeySource: "config" },
    });
    expect(JSON.stringify(redacted)).not.toContain("sk-secret");
    expect(redacted.baseUrl).toContain("redacted");
    expect(publicLlmProviderConfig().baseUrl).not.toContain("secret");
    expect(readConfig().llmProvider).toMatchObject({
      provider: "litellm",
      baseUrl: "http://user:secret@localhost:4000?token=abc",
      model: "skyagent-codex",
      apiKey: "sk-secret",
    });
  });

  test("reports health, budget, rate limit, and redacted endpoint state", async () => {
    const fetchImpl = async () => new Response("ok", {
      status: 200,
      headers: {
        "x-ratelimit-remaining-requests": "59",
        "x-litellm-key-spend": "0.12",
        "x-litellm-key-max-budget": "3",
      },
    });

    const status = await llmProviderStatus({ config: providerConfig(), fetchImpl });

    expect(status).toMatchObject({
      kind: "skyagent.llmProviderStatus",
      provider: "litellm",
      configured: true,
      model: "skyagent-codex",
      auth: { apiKeyConfigured: true, apiKeySource: "config" },
      health: { checked: true, ok: true, status: 200 },
      rateLimit: { "x-ratelimit-remaining-requests": "59" },
      budget: { "x-litellm-key-spend": "0.12", "x-litellm-key-max-budget": "3" },
      configuredRateLimit: { requestsPerMinute: 60, tokensPerMinute: 12_000 },
      configuredBudget: { maxUsd: 5, window: "daily" },
    });
    expect(JSON.stringify(status)).not.toContain("stored-secret");
    expect(status.baseUrl).toContain("redacted");
    expect(status.health.url).toContain("/health");
  });

  test("reports invalid stored base URL as status warnings instead of throwing", async () => {
    const fetchImpl = async () => {
      throw new Error("health should not be checked for invalid config");
    };

    const status = await llmProviderStatus({
      config: providerConfig({ baseUrl: "not a url" }),
      fetchImpl,
    });

    expect(status).toMatchObject({
      provider: "litellm",
      configured: false,
      model: "skyagent-codex",
      health: { checked: false, ok: null, status: null, url: "not a url", error: null },
    });
    expect(status.warnings).toContainEqual({
      code: "llm_provider_base_url_invalid",
      message: "LiteLLM base URL is not a valid URL.",
      source: "litellm",
    });
  });

  test("redacts provider error bodies before exposing status errors", async () => {
    const fetchImpl = async () => new Response("Authorization: Bearer sk-secret http://host?token=hidden", { status: 502 });

    const status = await llmProviderStatus({ config: providerConfig(), fetchImpl });

    expect(status.health).toMatchObject({
      checked: true,
      ok: false,
      status: 502,
      error: "Provider is unavailable with HTTP 502.",
    });
    expect(JSON.stringify(status)).not.toContain("sk-secret");
    expect(JSON.stringify(status)).not.toContain("hidden");
  });

  test("streams OpenAI-compatible LiteLLM chat completions and tool deltas from a mocked server", async () => {
    const requests: any[] = [];
    const stream = [
      `data: ${JSON.stringify({ choices: [{ delta: { content: "hello " } }] })}\n\n`,
      `data: ${JSON.stringify({ choices: [{ delta: { tool_calls: [{ index: 0, function: { name: "skyagent_context" } }] } }] })}\n\n`,
      `data: ${JSON.stringify({ choices: [{ delta: { content: "world" }, finish_reason: "stop" }], usage: { total_tokens: 7 } })}\n\n`,
      "data: [DONE]\n\n",
    ];
    const server = Bun.serve({
      port: 0,
      fetch: async (request) => {
        const url = new URL(request.url);
        expect(url.pathname).toBe("/v1/chat/completions");
        requests.push(await request.json());
        return new Response(stream.join(""), {
          status: 200,
          headers: { "content-type": "text/event-stream" },
        });
      },
    });

    try {
      const events = [];
      for await (const event of streamLlmChat({
        messages: [{ role: "user", content: "plan museum" }],
        tools: [{ type: "function", function: { name: "skyagent_context" } }],
      }, { config: providerConfig({ baseUrl: `http://127.0.0.1:${server.port}` }) })) {
        events.push(event);
      }

      expect(requests[0]).toMatchObject({
        model: "skyagent-codex",
        stream: true,
        messages: [{ role: "user", content: "plan museum" }],
      });
      expect(events).toContainEqual({ type: "start", provider: "litellm", model: "skyagent-codex" });
      expect(events).toContainEqual({ type: "text_delta", text: "hello " });
      expect(events).toContainEqual({ type: "text_delta", text: "world" });
      expect(events.some((event) => event.type === "tool_call_delta")).toBe(true);
      expect(events).toContainEqual({ type: "done", finishReason: "stop", usage: { total_tokens: 7 } });
    } finally {
      server.stop(true);
    }
  });

  test("streams OpenAI-compatible Responses events from the same abstraction", async () => {
    const requests: any[] = [];
    const stream = [
      `data: ${JSON.stringify({ type: "response.output_text.delta", delta: "museum " })}\n\n`,
      `data: ${JSON.stringify({ type: "response.function_call_arguments.delta", item_id: "call_1", delta: "{\"profile\"" })}\n\n`,
      `data: ${JSON.stringify({ type: "response.output_text.delta", delta: "plan" })}\n\n`,
      `data: ${JSON.stringify({ type: "response.completed", response: { usage: { total_tokens: 9 } } })}\n\n`,
    ];
    const server = Bun.serve({
      port: 0,
      fetch: async (request) => {
        const url = new URL(request.url);
        expect(url.pathname).toBe("/v1/responses");
        requests.push(await request.json());
        return new Response(stream.join(""), {
          status: 200,
          headers: { "content-type": "text/event-stream" },
        });
      },
    });

    try {
      const events = [];
      for await (const event of streamLlmChat({
        messages: [{ role: "user", content: "plan museum" }],
        tools: [{ type: "function", function: { name: "skyagent_context" } }],
        maxTokens: 200,
      }, {
        config: providerConfig({ baseUrl: `http://127.0.0.1:${server.port}` }),
        streamApi: "responses",
      })) {
        events.push(event);
      }

      expect(requests[0]).toMatchObject({
        model: "skyagent-codex",
        stream: true,
        input: [{ role: "user", content: "plan museum" }],
        max_output_tokens: 200,
      });
      expect(events).toContainEqual({ type: "start", provider: "litellm", model: "skyagent-codex" });
      expect(events).toContainEqual({ type: "text_delta", text: "museum " });
      expect(events).toContainEqual({ type: "text_delta", text: "plan" });
      expect(events.some((event) => event.type === "tool_call_delta")).toBe(true);
      expect(events).toContainEqual({ type: "done", finishReason: null, usage: { total_tokens: 9 } });
    } finally {
      server.stop(true);
    }
  });

  test("maps retryable provider errors and retries configured attempts", async () => {
    let calls = 0;
    const fetchImpl = async () => {
      calls += 1;
      return calls === 1
        ? new Response("temporary outage", { status: 502 })
        : new Response("data: [DONE]\n\n", { status: 200 });
    };

    const events = [];
    for await (const event of streamLlmChat({ messages: [{ role: "user", content: "hello" }] }, {
      config: providerConfig({ baseUrl: "http://127.0.0.1:4000", maxRetries: 1 }),
      fetchImpl,
    })) {
      events.push(event);
    }

    expect(calls).toBe(2);
    expect(events[0]).toMatchObject({ type: "start" });
  });

  test("allows zero retries for retry policy", async () => {
    let calls = 0;
    const fetchImpl = async () => {
      calls += 1;
      return new Response("temporary outage", { status: 502 });
    };

    await expect(async () => {
      for await (const _event of streamLlmChat({ messages: [{ role: "user", content: "hello" }] }, {
        config: providerConfig({ baseUrl: "http://127.0.0.1:4000", maxRetries: 0 }),
        fetchImpl,
      })) {
        // consume stream
      }
    }).toThrow("Provider is unavailable with HTTP 502.");
    expect(calls).toBe(1);
  });

  test("surfaces timeout as a retryable provider error", async () => {
    const fetchImpl = async (_url: string, init: RequestInit) => await new Promise<Response>((_resolve, reject) => {
      init.signal?.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")));
    });

    await expect(async () => {
      for await (const _event of streamLlmChat({ messages: [{ role: "user", content: "hello" }] }, {
        config: providerConfig({ baseUrl: "http://127.0.0.1:4000", timeoutMs: 1, maxRetries: 0 }),
        fetchImpl,
      })) {
        // consume stream
      }
    }).toThrow("timed out");
  });

  test("maps auth failures without leaking the configured key", async () => {
    const fetchImpl = async () => new Response("bad key", { status: 401 });

    await expect(async () => {
      for await (const _event of streamLlmChat({ messages: [{ role: "user", content: "hello" }] }, {
        config: providerConfig({ baseUrl: "http://127.0.0.1:4000" }),
        fetchImpl,
      })) {
        // consume stream
      }
    }).toThrow("Provider authentication failed with HTTP 401.");
  });
});
