import test from "node:test";
import assert from "node:assert/strict";
import { createProviderFromEnv } from "../src/providers/index.js";
import { createGeminiProvider } from "../src/providers/gemini-provider.js";

test("createProviderFromEnv defaults to mock without API keys", () => {
  const provider = createProviderFromEnv({});
  assert.equal(provider.name, "mock");
});

test("createProviderFromEnv resolves openai when requested", () => {
  const provider = createProviderFromEnv({
    AI_PROVIDER: "openai",
    OPENAI_API_KEY: "openai-test-key"
  });

  assert.equal(provider.name, "openai");
});

test("createProviderFromEnv resolves gemini when requested", () => {
  const provider = createProviderFromEnv({
    AI_PROVIDER: "gemini",
    GEMINI_API_KEY: "gemini-test-key"
  });

  assert.equal(provider.name, "gemini");
});

test("createProviderFromEnv infers gemini when only GEMINI_API_KEY is set", () => {
  const provider = createProviderFromEnv({
    GEMINI_API_KEY: "gemini-test-key"
  });

  assert.equal(provider.name, "gemini");
});

test("createGeminiProvider requests structured JSON output", async () => {
  const originalFetch = globalThis.fetch;
  let capturedUrl = "";
  let capturedBody = null;

  globalThis.fetch = async (url, options) => {
    capturedUrl = String(url);
    capturedBody = JSON.parse(options.body);

    return {
      ok: true,
      async json() {
        return {
          candidates: [
            {
              content: {
                parts: [
                  {
                    text: JSON.stringify({
                      title: "AI 종합 사주풀이",
                      headline: "테스트 헤드라인",
                      summary: "테스트 요약",
                      sections: [
                        { heading: "성향", body: "설명 1" },
                        { heading: "관계", body: "설명 2" },
                        { heading: "재물", body: "설명 3" }
                      ],
                      cautions: ["주의 1", "주의 2", "주의 3"],
                      actionTips: ["행동 1", "행동 2", "행동 3"],
                      lucky: {
                        color: "블루",
                        number: "1",
                        direction: "동"
                      }
                    })
                  }
                ]
              }
            }
          ]
        };
      }
    };
  };

  try {
    const provider = createGeminiProvider({
      apiKey: "gemini-test-key",
      model: "gemini-2.0-flash"
    });

    const payload = await provider.generate({
      systemPrompt: "시스템 프롬프트",
      userPrompt: "사용자 프롬프트",
      schema: {
        schema: {
          type: "object",
          required: ["title"],
          properties: {
            title: { type: "string" }
          }
        }
      }
    });

    assert.match(capturedUrl, /generativelanguage\.googleapis\.com/);
    assert.match(capturedUrl, /gemini-2\.0-flash:generateContent/);
    assert.equal(capturedBody.system_instruction.parts[0].text, "시스템 프롬프트");
    assert.equal(capturedBody.contents[0].parts[0].text, "사용자 프롬프트");
    assert.equal(capturedBody.generationConfig.response_mime_type, "application/json");
    assert.equal(capturedBody.generationConfig.response_schema.type, "OBJECT");
    assert.equal(capturedBody.generationConfig.response_schema.properties.title.type, "STRING");
    assert.equal(payload.title, "AI 종합 사주풀이");
  } finally {
    globalThis.fetch = originalFetch;
  }
});
