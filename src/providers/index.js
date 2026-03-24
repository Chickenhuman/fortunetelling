import { createMockProvider } from "./mock-provider.js";
import { createOpenAIProvider } from "./openai-provider.js";
import { createGeminiProvider } from "./gemini-provider.js";

export function createProviderFromEnv(env = process.env) {
  const resolvedName = (
    env.AI_PROVIDER ||
    (env.OPENAI_API_KEY ? "openai" : env.GEMINI_API_KEY ? "gemini" : "mock")
  )
    .toLowerCase()
    .trim();

  if (resolvedName === "mock") {
    return createMockProvider();
  }

  if (resolvedName === "openai") {
    return createOpenAIProvider({
      apiKey: env.OPENAI_API_KEY,
      model: env.OPENAI_MODEL || "gpt-4.1-mini"
    });
  }

  if (resolvedName === "gemini") {
    return createGeminiProvider({
      apiKey: env.GEMINI_API_KEY,
      model: env.GEMINI_MODEL || "gemini-2.0-flash"
    });
  }

  throw new Error(`지원하지 않는 AI_PROVIDER: ${resolvedName}`);
}
