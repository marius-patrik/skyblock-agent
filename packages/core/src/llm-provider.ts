import { readConfig, writeConfig } from "./store.ts";

export type LlmProviderKind = "litellm";

export type LlmProviderConfig = {
  provider: LlmProviderKind;
  baseUrl: string;
  model: string;
  apiKey?: string;
  timeoutMs?: number;
  maxRetries?: number;
  rateLimit?: {
    requestsPerMinute?: number;
    tokensPerMinute?: number;
  };
  budget?: {
    maxUsd?: number;
    window?: string;
  };
};

export type ResolvedLlmProviderConfig = {
  provider: LlmProviderKind | null;
  configured: boolean;
  baseUrl: string | null;
  model: string | null;
  timeoutMs: number;
  maxRetries: number;
  auth: {
    apiKeyConfigured: boolean;
    apiKeySource: "env" | "config" | null;
  };
  configuredRateLimit: {
    requestsPerMinute: number | null;
    tokensPerMinute: number | null;
  };
  configuredBudget: {
    maxUsd: number | null;
    window: string | null;
  };
  warnings: Array<{ code: string; message: string; source: string }>;
};

export type PublicLlmProviderConfig = Omit<ResolvedLlmProviderConfig, "baseUrl"> & {
  baseUrl: string | null;
};

export type LlmMessage = {
  role: "system" | "user" | "assistant" | "tool";
  content: string;
  name?: string;
  tool_call_id?: string;
};

export type LlmTool = {
  type: "function";
  function: {
    name: string;
    description?: string;
    parameters?: Record<string, unknown>;
  };
};

export type LlmStreamEvent =
  | { type: "start"; provider: LlmProviderKind; model: string }
  | { type: "text_delta"; text: string }
  | { type: "tool_call_delta"; toolCalls: unknown[] }
  | { type: "done"; finishReason: string | null; usage?: unknown }
  | { type: "raw"; payload: unknown };

export type LlmStreamApi = "chat_completions" | "responses";

export type LlmChatInput = {
  messages: LlmMessage[];
  tools?: LlmTool[];
  toolChoice?: "auto" | "none" | Record<string, unknown>;
  temperature?: number;
  maxTokens?: number;
};

export type LlmProviderStatus = {
  kind: "skyagent.llmProviderStatus";
  schemaVersion: 1;
  generatedAt: string;
  provider: LlmProviderKind | null;
  configured: boolean;
  model: string | null;
  baseUrl: string | null;
  auth: ResolvedLlmProviderConfig["auth"];
  timeoutMs: number;
  maxRetries: number;
  health: {
    checked: boolean;
    ok: boolean | null;
    status: number | null;
    url: string | null;
    error: string | null;
  };
  rateLimit: Record<string, string>;
  budget: Record<string, string>;
  configuredRateLimit: ResolvedLlmProviderConfig["configuredRateLimit"];
  configuredBudget: ResolvedLlmProviderConfig["configuredBudget"];
  warnings: ResolvedLlmProviderConfig["warnings"];
};

export class LlmProviderError extends Error {
  code: string;
  status: number | null;
  retryable: boolean;

  constructor(code: string, message: string, options: { status?: number | null; retryable?: boolean } = {}) {
    super(message);
    this.name = "LlmProviderError";
    this.code = code;
    this.status = options.status ?? null;
    this.retryable = options.retryable ?? false;
  }
}

type EnvLike = Record<string, string | undefined>;
type FetchLike = (input: string | URL | Request, init?: RequestInit) => Promise<Response>;

const DEFAULT_TIMEOUT_MS = 30_000;
const DEFAULT_MAX_RETRIES = 1;
const LITELLM_ENV_KEYS = {
  provider: "SKYAGENT_LLM_PROVIDER",
  baseUrl: "SKYAGENT_LITELLM_BASE_URL",
  apiKey: "SKYAGENT_LITELLM_API_KEY",
  model: "SKYAGENT_LLM_MODEL",
  timeoutMs: "SKYAGENT_LLM_TIMEOUT_MS",
  maxRetries: "SKYAGENT_LLM_MAX_RETRIES",
} as const;

function nowIso() {
  return new Date().toISOString();
}

function coercePositiveInt(value: unknown, fallback: number) {
  const number = Number(value);
  return Number.isInteger(number) && number > 0 ? number : fallback;
}

function coerceNonNegativeInt(value: unknown, fallback: number) {
  const number = Number(value);
  return Number.isInteger(number) && number >= 0 ? number : fallback;
}

function coerceNonNegativeNumber(value: unknown) {
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? number : null;
}

function normalizeBaseUrl(value: string | null) {
  if (!value) return null;
  return value.replace(/\/+$/, "");
}

function validateBaseUrl(value: string | null) {
  if (!value) return { valid: false, warning: null as ResolvedLlmProviderConfig["warnings"][number] | null };
  try {
    const url = new URL(value);
    if (url.protocol !== "http:" && url.protocol !== "https:") {
      return {
        valid: false,
        warning: {
          code: "llm_provider_base_url_invalid",
          message: "LiteLLM base URL must use http or https.",
          source: "litellm",
        },
      };
    }
    return { valid: true, warning: null };
  } catch {
    return {
      valid: false,
      warning: {
        code: "llm_provider_base_url_invalid",
        message: "LiteLLM base URL is not a valid URL.",
        source: "litellm",
      },
    };
  }
}

export function redactUrl(value: string | null | undefined) {
  if (!value) return null;
  try {
    const url = new URL(value);
    if (url.username || url.password) {
      url.username = url.username ? "redacted" : "";
      url.password = url.password ? "redacted" : "";
    }
    for (const key of [...url.searchParams.keys()]) {
      if (/key|token|secret|auth|password/i.test(key)) {
        url.searchParams.set(key, "redacted");
      }
    }
    return url.toString().replace(/\/$/, "");
  } catch {
    return value.replace(/(key|token|secret|auth|password)=([^&\s]+)/gi, "$1=redacted");
  }
}

function storedProviderConfig(config = readConfig()): Partial<LlmProviderConfig> {
  return config.llmProvider ?? {};
}

export function resolveLlmProviderConfig(config = readConfig(), env: EnvLike = process.env): ResolvedLlmProviderConfig {
  const stored = storedProviderConfig(config);
  const rawProvider = env[LITELLM_ENV_KEYS.provider] ?? stored.provider ?? null;
  const provider = rawProvider === "litellm" ? "litellm" : null;
  const baseUrl = normalizeBaseUrl(env[LITELLM_ENV_KEYS.baseUrl] ?? stored.baseUrl ?? null);
  const model = env[LITELLM_ENV_KEYS.model] ?? stored.model ?? null;
  const envApiKey = env[LITELLM_ENV_KEYS.apiKey];
  const apiKey = envApiKey ?? stored.apiKey ?? "";
  const timeoutMs = coercePositiveInt(env[LITELLM_ENV_KEYS.timeoutMs] ?? stored.timeoutMs, DEFAULT_TIMEOUT_MS);
  const maxRetries = coerceNonNegativeInt(env[LITELLM_ENV_KEYS.maxRetries] ?? stored.maxRetries, DEFAULT_MAX_RETRIES);
  const baseUrlValidation = validateBaseUrl(baseUrl);
  const configuredRateLimit = {
    requestsPerMinute: coerceNonNegativeNumber(stored.rateLimit?.requestsPerMinute),
    tokensPerMinute: coerceNonNegativeNumber(stored.rateLimit?.tokensPerMinute),
  };
  const configuredBudget = {
    maxUsd: coerceNonNegativeNumber(stored.budget?.maxUsd),
    window: stored.budget?.window ? String(stored.budget.window) : null,
  };
  const warnings = [
    ...(!provider ? [{
      code: "llm_provider_missing",
      message: "Configure SkyAgent with provider=litellm before starting the persistent agent runtime.",
      source: "llm-provider",
    }] : []),
    ...(rawProvider && rawProvider !== "litellm" ? [{
      code: "llm_provider_unsupported",
      message: `Unsupported LLM provider '${rawProvider}'. Supported provider: litellm.`,
      source: "llm-provider",
    }] : []),
    ...(provider && !baseUrl ? [{
      code: "llm_provider_base_url_missing",
      message: "LiteLLM base URL is required.",
      source: "litellm",
    }] : []),
    ...(provider && baseUrlValidation.warning ? [baseUrlValidation.warning] : []),
    ...(provider && !model ? [{
      code: "llm_provider_model_missing",
      message: "LiteLLM model alias is required.",
      source: "litellm",
    }] : []),
  ];

  return {
    provider,
    configured: Boolean(provider && baseUrl && baseUrlValidation.valid && model),
    baseUrl,
    model,
    timeoutMs,
    maxRetries,
    auth: {
      apiKeyConfigured: Boolean(apiKey),
      apiKeySource: envApiKey ? "env" : stored.apiKey ? "config" : null,
    },
    configuredRateLimit,
    configuredBudget,
    warnings,
  };
}

export function publicLlmProviderConfig(config = readConfig(), env: EnvLike = process.env): PublicLlmProviderConfig {
  const resolved = resolveLlmProviderConfig(config, env);
  return {
    ...resolved,
    baseUrl: redactUrl(resolved.baseUrl),
  };
}

export function setLlmProviderConfigValue(key: string, value: unknown) {
  const config = readConfig();
  const current = { ...(config.llmProvider ?? {}) };
  const keyMap: Record<string, keyof LlmProviderConfig> = {
    provider: "provider",
    "base-url": "baseUrl",
    baseUrl: "baseUrl",
    model: "model",
    "api-key": "apiKey",
    apiKey: "apiKey",
    "timeout-ms": "timeoutMs",
    timeoutMs: "timeoutMs",
    "max-retries": "maxRetries",
    maxRetries: "maxRetries",
    "rate-limit-rpm": "rateLimit",
    "rate-limit-tpm": "rateLimit",
    "budget-usd": "budget",
    "budget-window": "budget",
  };
  if (!keyMap[key]) {
    throw new Error("Supported provider config keys: provider, base-url, model, api-key, timeout-ms, max-retries, rate-limit-rpm, rate-limit-tpm, budget-usd, budget-window");
  }
  if (key === "rate-limit-rpm" || key === "rate-limit-tpm") {
    const rateLimit = { ...(current.rateLimit ?? {}) };
    const field = key === "rate-limit-rpm" ? "requestsPerMinute" : "tokensPerMinute";
    if (value === null || value === undefined || value === "") {
      delete rateLimit[field];
    } else {
      rateLimit[field] = coercePositiveInt(value, 0);
    }
    current.rateLimit = rateLimit;
  } else if (key === "budget-usd" || key === "budget-window") {
    const budget = { ...(current.budget ?? {}) };
    if (key === "budget-usd") {
      if (value === null || value === undefined || value === "") {
        delete budget.maxUsd;
      } else {
        budget.maxUsd = coerceNonNegativeNumber(value) ?? 0;
      }
    } else if (value === null || value === undefined || value === "") {
      delete budget.window;
    } else {
      budget.window = String(value);
    }
    current.budget = budget;
  } else {
    const mapped = keyMap[key];
    if (value === null || value === undefined || value === "") {
      delete current[mapped];
    } else if (mapped === "timeoutMs" || mapped === "maxRetries") {
      current[mapped] = (
        mapped === "timeoutMs"
          ? coercePositiveInt(value, DEFAULT_TIMEOUT_MS)
          : coerceNonNegativeInt(value, DEFAULT_MAX_RETRIES)
      ) as never;
    } else {
      current[mapped] = String(value) as never;
    }
  }
  config.llmProvider = current;
  writeConfig(config);
  return publicLlmProviderConfig(config);
}

function configWithSecret(config = readConfig(), env: EnvLike = process.env) {
  const resolved = resolveLlmProviderConfig(config, env);
  const stored = storedProviderConfig(config);
  return {
    ...resolved,
    apiKey: env[LITELLM_ENV_KEYS.apiKey] ?? stored.apiKey ?? "",
  };
}

function litellmUrl(config: ResolvedLlmProviderConfig, path: string) {
  if (!config.baseUrl) {
    throw new LlmProviderError("provider_not_configured", "LiteLLM base URL is not configured.");
  }
  let url: URL;
  try {
    url = new URL(config.baseUrl);
  } catch {
    throw new LlmProviderError("provider_base_url_invalid", "LiteLLM base URL is not a valid URL.");
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new LlmProviderError("provider_base_url_invalid", "LiteLLM base URL must use http or https.");
  }
  url.search = "";
  url.hash = "";
  url.pathname = `${url.pathname.replace(/\/+$/, "")}/${path.replace(/^\/+/, "")}`;
  return url.toString();
}

function providerHeaders(apiKey: string | undefined, extra: HeadersInit = {}) {
  return {
    ...(apiKey ? { authorization: `Bearer ${apiKey}` } : {}),
    ...extra,
  };
}

function collectHeaders(headers: Headers, prefix: RegExp) {
  const values: Record<string, string> = {};
  headers.forEach((value, key) => {
    if (prefix.test(key)) {
      values[key] = value;
    }
  });
  return values;
}

function redactProviderErrorMessage(value: string) {
  return redactUrl(value)
    ?.replace(/bearer\s+[A-Za-z0-9._~+/-]+=*/gi, "Bearer redacted")
    .replace(/(authorization\s*[:=]\s*)[^\s,}]+/gi, "$1redacted")
    .replace(/(["']?(?:api[_-]?key|token|secret|password|auth)["']?\s*[:=]\s*["']?)[^"',}\s]+/gi, "$1redacted")
    .replace(/\bsk-[A-Za-z0-9_-]{8,}\b/g, "sk-redacted")
    .slice(0, 500) ?? "Provider request failed.";
}

function mapProviderResponseError(status: number, text: string) {
  const retryable = status === 408 || status === 409 || status === 429 || status >= 500;
  const code = status === 401 || status === 403
    ? "provider_auth_failed"
    : status === 429
      ? "provider_rate_limited"
      : status >= 500
        ? "provider_unavailable"
        : "provider_request_failed";
  const message = code === "provider_auth_failed"
    ? `Provider authentication failed with HTTP ${status}.`
    : code === "provider_rate_limited"
      ? `Provider rate limited the request with HTTP ${status}.`
      : code === "provider_unavailable"
        ? `Provider is unavailable with HTTP ${status}.`
        : `Provider request failed with HTTP ${status}.`;
  return new LlmProviderError(code, message, { status, retryable });
}

async function fetchWithTimeout(fetchImpl: FetchLike, url: string, init: RequestInit, timeoutMs: number) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetchImpl(url, { ...init, signal: controller.signal });
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new LlmProviderError("provider_timeout", `Provider request timed out after ${timeoutMs}ms.`, { retryable: true });
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

async function requestWithRetry(fetchImpl: FetchLike, url: string, init: RequestInit, timeoutMs: number, maxRetries: number) {
  let lastError: unknown = null;
  for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
    try {
      const response = await fetchWithTimeout(fetchImpl, url, init, timeoutMs);
      if (response.ok) {
        return response;
      }
      const text = await response.text();
      const error = mapProviderResponseError(response.status, text);
      if (!error.retryable || attempt === maxRetries) {
        throw error;
      }
      lastError = error;
    } catch (error) {
      if (!(error instanceof LlmProviderError) || !error.retryable || attempt === maxRetries) {
        if (error instanceof LlmProviderError) {
          throw error;
        }
        throw new LlmProviderError(
          "provider_request_failed",
          error instanceof Error ? redactProviderErrorMessage(error.message) : redactProviderErrorMessage(String(error)),
        );
      }
      lastError = error;
    }
  }
  throw lastError instanceof Error ? lastError : new LlmProviderError("provider_request_failed", String(lastError));
}

export async function llmProviderStatus(options: {
  config?: Record<string, any>;
  env?: EnvLike;
  fetchImpl?: FetchLike;
  checkHealth?: boolean;
} = {}): Promise<LlmProviderStatus> {
  const resolved = configWithSecret(options.config ?? readConfig(), options.env ?? process.env);
  const healthUrl = resolved.configured
    ? redactUrl(litellmUrl(resolved, "/health"))
    : resolved.baseUrl
      ? redactUrl(resolved.baseUrl)
      : null;
  const health = {
    checked: false,
    ok: null as boolean | null,
    status: null as number | null,
    url: healthUrl,
    error: null as string | null,
  };
  const rateLimit: Record<string, string> = {};
  const budget: Record<string, string> = {};

  if (options.checkHealth !== false && resolved.configured) {
    health.checked = true;
    try {
      const response = await requestWithRetry(
        options.fetchImpl ?? fetch,
        litellmUrl(resolved, "/health"),
        { headers: providerHeaders(resolved.apiKey) },
        Math.min(resolved.timeoutMs, 3_000),
        resolved.maxRetries,
      );
      health.ok = true;
      health.status = response.status;
      Object.assign(rateLimit, collectHeaders(response.headers, /^x-ratelimit-/i));
      Object.assign(budget, collectHeaders(response.headers, /^x-litellm-(key-spend|key-max-budget|response-cost|model-id)/i));
    } catch (error) {
      health.ok = false;
      health.status = error instanceof LlmProviderError ? error.status : null;
      health.error = error instanceof Error ? redactProviderErrorMessage(error.message) : redactProviderErrorMessage(String(error));
    }
  }

  return {
    kind: "skyagent.llmProviderStatus",
    schemaVersion: 1,
    generatedAt: nowIso(),
    provider: resolved.provider,
    configured: resolved.configured,
    model: resolved.model,
    baseUrl: redactUrl(resolved.baseUrl),
    auth: resolved.auth,
    timeoutMs: resolved.timeoutMs,
    maxRetries: resolved.maxRetries,
    health,
    rateLimit,
    budget,
    configuredRateLimit: resolved.configuredRateLimit,
    configuredBudget: resolved.configuredBudget,
    warnings: resolved.warnings,
  };
}

function parseSseBlocks(buffer: string) {
  const blocks: string[] = [];
  let cursor = buffer.search(/\r?\n\r?\n/);
  while (cursor !== -1) {
    blocks.push(buffer.slice(0, cursor));
    const match = buffer.slice(cursor).match(/^\r?\n\r?\n/);
    buffer = buffer.slice(cursor + (match?.[0].length ?? 2));
    cursor = buffer.search(/\r?\n\r?\n/);
  }
  return { blocks, rest: buffer };
}

function parseOpenAiCompatibleSseBlock(block: string): LlmStreamEvent[] {
  const dataLines = block.split(/\r?\n/)
    .filter((line) => line.startsWith("data:"))
    .map((line) => line.slice("data:".length).trim());
  const events: LlmStreamEvent[] = [];
  for (const line of dataLines) {
    if (!line || line === "[DONE]") {
      events.push({ type: "done", finishReason: null });
      continue;
    }
    const payload = JSON.parse(line);
    const choice = payload.choices?.[0];
    const delta = choice?.delta ?? {};
    if (typeof delta.content === "string" && delta.content) {
      events.push({ type: "text_delta", text: delta.content });
    }
    if (Array.isArray(delta.tool_calls) && delta.tool_calls.length) {
      events.push({ type: "tool_call_delta", toolCalls: delta.tool_calls });
    }
    if (choice?.finish_reason) {
      events.push({ type: "done", finishReason: choice.finish_reason, usage: payload.usage });
    }
    if (payload.type === "response.output_text.delta" && typeof payload.delta === "string" && payload.delta) {
      events.push({ type: "text_delta", text: payload.delta });
    }
    if (payload.type === "response.function_call_arguments.delta" && typeof payload.delta === "string") {
      events.push({ type: "tool_call_delta", toolCalls: [payload] });
    }
    if (payload.type === "response.output_item.added" && payload.item?.type === "function_call") {
      events.push({ type: "tool_call_delta", toolCalls: [payload.item] });
    }
    if (payload.type === "response.completed") {
      events.push({ type: "done", finishReason: null, usage: payload.response?.usage });
    }
    if (!choice && payload.type) {
      events.push({ type: "raw", payload });
    }
  }
  return events;
}

function requestForStreamApi(input: LlmChatInput, streamApi: LlmStreamApi, model: string) {
  if (streamApi === "responses") {
    return {
      path: "/v1/responses",
      body: {
        model,
        input: input.messages,
        tools: input.tools,
        tool_choice: input.toolChoice,
        temperature: input.temperature,
        max_output_tokens: input.maxTokens,
        stream: true,
      },
    };
  }
  return {
    path: "/v1/chat/completions",
    body: {
      model,
      messages: input.messages,
      tools: input.tools,
      tool_choice: input.toolChoice,
      temperature: input.temperature,
      max_tokens: input.maxTokens,
      stream: true,
    },
  };
}

export async function* streamLlmChat(input: LlmChatInput, options: {
  config?: Record<string, any>;
  env?: EnvLike;
  fetchImpl?: FetchLike;
  streamApi?: LlmStreamApi;
} = {}): AsyncGenerator<LlmStreamEvent> {
  const resolved = configWithSecret(options.config ?? readConfig(), options.env ?? process.env);
  if (!resolved.configured || !resolved.provider || !resolved.model) {
    throw new LlmProviderError("provider_not_configured", "LLM provider is not fully configured.");
  }
  const request = requestForStreamApi(input, options.streamApi ?? "chat_completions", resolved.model);

  const response = await requestWithRetry(
    options.fetchImpl ?? fetch,
    litellmUrl(resolved, request.path),
    {
      method: "POST",
      headers: providerHeaders(resolved.apiKey, { "content-type": "application/json" }),
      body: JSON.stringify(request.body),
    },
    resolved.timeoutMs,
    resolved.maxRetries,
  );

  yield { type: "start", provider: resolved.provider, model: resolved.model };

  if (!response.body) {
    throw new LlmProviderError("provider_stream_missing", "Provider response did not include a stream body.", { status: response.status });
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  while (true) {
    const chunk = await reader.read();
    if (chunk.done) break;
    buffer += decoder.decode(chunk.value, { stream: true });
    const parsed = parseSseBlocks(buffer);
    buffer = parsed.rest;
    for (const block of parsed.blocks) {
      for (const event of parseOpenAiCompatibleSseBlock(block)) {
        yield event;
      }
    }
  }
  buffer += decoder.decode();
  if (buffer.trim()) {
    for (const event of parseOpenAiCompatibleSseBlock(buffer)) {
      yield event;
    }
  }
}
