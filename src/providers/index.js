import { createMockProvider } from "./mock-provider.js";
import { createOpenAIProvider } from "./openai-provider.js";

export function createProviderFromEnv(env = process.env) {
  const resolvedName = (env.AI_PROVIDER || (env.OPENAI_API_KEY ? "openai" : "mock"))
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

  throw new Error(`지원하지 않는 AI_PROVIDER: ${resolvedName}`);
}
