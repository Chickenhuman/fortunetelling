function safePreview(text, maxLength = 180) {
  if (!text) {
    return "";
  }

  if (text.length <= maxLength) {
    return text;
  }

  return `${text.slice(0, maxLength)}...`;
}

function toGeminiSchema(rawSchema) {
  const source = rawSchema?.schema ?? rawSchema;

  if (!source || typeof source !== "object" || Array.isArray(source)) {
    return undefined;
  }

  if (source.type === "object") {
    const properties = source.properties ?? {};

    return {
      type: "OBJECT",
      properties: Object.fromEntries(
        Object.entries(properties).map(([key, value]) => [key, toGeminiSchema(value)])
      ),
      required: Array.isArray(source.required) ? source.required : undefined
    };
  }

  if (source.type === "array") {
    return {
      type: "ARRAY",
      items: toGeminiSchema(source.items),
      minItems: typeof source.minItems === "number" ? source.minItems : undefined
    };
  }

  if (typeof source.type === "string") {
    return {
      type: source.type.toUpperCase(),
      enum: Array.isArray(source.enum) ? source.enum : undefined
    };
  }

  return undefined;
}

function extractText(payload) {
  const parts = payload?.candidates?.[0]?.content?.parts;

  if (!Array.isArray(parts)) {
    throw new Error("Gemini 응답 형식을 해석할 수 없습니다.");
  }

  const text = parts
    .map((part) => part?.text)
    .filter((part) => typeof part === "string" && part.trim().length > 0)
    .join("");

  if (!text) {
    throw new Error("Gemini 응답 본문이 비어 있습니다.");
  }

  return text;
}

export function createGeminiProvider({ apiKey, model }) {
  if (!apiKey) {
    throw new Error("GEMINI_API_KEY가 설정되지 않았습니다.");
  }

  return {
    name: "gemini",
    async generate({ systemPrompt, userPrompt, schema }) {
      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            system_instruction: {
              parts: [{ text: systemPrompt }]
            },
            contents: [
              {
                role: "user",
                parts: [{ text: userPrompt }]
              }
            ],
            generationConfig: {
              response_mime_type: "application/json",
              response_schema: toGeminiSchema(schema)
            }
          })
        }
      );

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Gemini API 오류(${response.status}): ${safePreview(errorText)}`);
      }

      return JSON.parse(extractText(await response.json()));
    }
  };
}
