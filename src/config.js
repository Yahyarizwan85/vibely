import "dotenv/config";

export const config = {
  port: Number(process.env.PORT || 5000),
  // One or more allowed frontend URLs, separated by commas. Trailing slashes are removed.
  // Example: https://vibely.onrender.com,http://localhost:5173
  origin: (process.env.FRONTEND_ORIGIN || "http://localhost:5173")
    .split(",")
    .map((url) => url.trim().replace(/\/$/, ""))
    .filter(Boolean),
  // How long a user waits for a real person before an AI companion steps in.
  waitMs: Math.max(3000, Number(process.env.MATCH_WAIT_MS || 8000)),
  durationSeconds: Math.max(60, Number(process.env.CHAT_DURATION_SECONDS || 300)),
  // Minimum gap between messages from one user (basic spam protection).
  messageIntervalMs: Number(process.env.MESSAGE_INTERVAL_MS || 600),

  ai: {
    // Providers are tried in this order. Only ones with an API key are used.
    providerOrder: (process.env.AI_PROVIDER_ORDER || "gemini,groq,openrouter,mistral,cerebras,custom")
      .split(",")
      .map((name) => name.trim().toLowerCase())
      .filter(Boolean),
    // Thinking models count their "thinking" against this limit, so keep it generous.
    maxOutputTokens: Number(process.env.AI_MAX_OUTPUT_TOKENS || process.env.GEMINI_MAX_OUTPUT_TOKENS || 1024),
    // Gemini only. 0 turns thinking off on models that allow it. Leave blank if unsure.
    thinkingBudget: process.env.GEMINI_THINKING_BUDGET,
    // Per attempt. Keep it short so failover to the next provider feels quick.
    timeoutMs: Number(process.env.AI_TIMEOUT_MS || 20000)
  }
};