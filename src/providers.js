import { config } from "./config.js";

/**
 * AI providers.
 *
 * Every API key becomes a "slot". ai.js tries the slots in order and skips any
 * slot that is cooling down (for example after hitting a free-tier limit).
 *
 * Supported: gemini, groq, openrouter, mistral, cerebras, custom
 * (anything that speaks the OpenAI "chat/completions" format).
 */

export class ProviderError extends Error {
  constructor(message, { status = null, retryAfterMs = null } = {}) {
    super(message);
    this.status = status;
    this.retryAfterMs = retryAfterMs;
  }
}

const PLACEHOLDER = /^(your[_-]|xxx|changeme)/i;

const KNOWN = {
  gemini: { type: "gemini", defaultModel: "gemini-3.8-flash" },
  groq: { type: "openai", baseUrl: "https://api.groq.com/openai/v1" },
  openrouter: { type: "openai", baseUrl: "https://openrouter.ai/api/v1" },
  mistral: { type: "openai", baseUrl: "https://api.mistral.ai/v1" },
  cerebras: { type: "openai", baseUrl: "https://api.cerebras.ai/v1" },
  custom: { type: "openai", baseUrl: process.env.CUSTOM_BASE_URL }
};

// Reads GROQ_API_KEYS=a,b,c and/or GROQ_API_KEY=a
function readKeys(prefix) {
  const raw = [process.env[`${prefix}_API_KEYS`], process.env[`${prefix}_API_KEY`]]
    .filter(Boolean)
    .join(",");

  return raw
    .split(",")
    .map((key) => key.trim())
    .filter((key) => key && !PLACEHOLDER.test(key));
}

function buildSlots() {
  const built = [];

  for (const name of config.ai.providerOrder) {
    const def = KNOWN[name];

    if (!def) {
      console.warn(`[AI] Unknown provider "${name}" in AI_PROVIDER_ORDER, skipped.`);
      continue;
    }

    const prefix = name.toUpperCase();
    const keys = readKeys(prefix);
    if (!keys.length) continue;

    const model = process.env[`${prefix}_MODEL`] || def.defaultModel;

    if (!model) {
      console.warn(`[AI] ${prefix}_MODEL is not set, so ${name} was skipped.`);
      continue;
    }

    if (def.type === "openai" && !def.baseUrl) {
      console.warn(`[AI] ${name} needs a base URL (CUSTOM_BASE_URL), skipped.`);
      continue;
    }

    keys.forEach((apiKey, index) => {
      built.push({
        id: `${name}#${index + 1}`,
        provider: name,
        type: def.type,
        baseUrl: def.baseUrl,
        model,
        apiKey,
        cooldownUntil: 0,
        failures: 0
      });
    });
  }

  return built;
}

export const slots = buildSlots();

if (slots.length) {
  const summary = {};
  for (const slot of slots) summary[slot.provider] = (summary[slot.provider] || 0) + 1;
  console.log(
    "[AI] Providers ready:",
    Object.entries(summary)
      .map(([name, count]) => `${name} (${count} key${count > 1 ? "s" : ""})`)
      .join(", ")
  );
} else {
  console.error("[AI] No AI provider is configured. Add at least one API key to backend/.env");
}

async function toError(response, label) {
  const body = (await response.text()).slice(0, 300);
  const retryAfter = Number(response.headers.get("retry-after"));

  return new ProviderError(`${label} HTTP ${response.status}: ${body}`, {
    status: response.status,
    retryAfterMs: Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1000 : null
  });
}

async function callGemini(slot, { systemPrompt, turns }) {
  const generationConfig = {
    temperature: 0.9,
    maxOutputTokens: config.ai.maxOutputTokens
  };

  if (config.ai.thinkingBudget !== undefined && config.ai.thinkingBudget !== "") {
    generationConfig.thinkingConfig = { thinkingBudget: Number(config.ai.thinkingBudget) };
  }

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(slot.model)}:generateContent`;

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-goog-api-key": slot.apiKey // header, not URL, so the key stays out of logs
    },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: systemPrompt }] },
      contents: turns.map((turn) => ({ role: turn.role, parts: [{ text: turn.text }] })),
      generationConfig
    }),
    signal: AbortSignal.timeout(config.ai.timeoutMs)
  });

  if (!response.ok) throw await toError(response, "Gemini");

  const data = await response.json();
  const candidate = data?.candidates?.[0];
  const text = candidate?.content?.parts?.map((part) => part.text || "").join("").trim();

  return { text, truncated: candidate?.finishReason === "MAX_TOKENS" };
}

async function callOpenAICompatible(slot, { systemPrompt, turns }) {
  const response = await fetch(`${slot.baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${slot.apiKey}`
    },
    body: JSON.stringify({
      model: slot.model,
      temperature: 0.9,
      max_tokens: config.ai.maxOutputTokens,
      messages: [
        { role: "system", content: systemPrompt },
        ...turns.map((turn) => ({
          role: turn.role === "model" ? "assistant" : "user",
          content: turn.text
        }))
      ]
    }),
    signal: AbortSignal.timeout(config.ai.timeoutMs)
  });

  if (!response.ok) throw await toError(response, slot.provider);

  const data = await response.json();
  const choice = data?.choices?.[0];

  return {
    text: (choice?.message?.content || "").trim(),
    truncated: choice?.finish_reason === "length"
  };
}

export function callProvider(slot, input) {
  return slot.type === "gemini"
    ? callGemini(slot, input)
    : callOpenAICompatible(slot, input);
}