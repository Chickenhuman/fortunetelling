function safePreview(text, maxLength = 180) {
  if (!text) {
    return "";
  }
  if (text.length <= maxLength) {
    return text;
  }
  return `${text.slice(0, maxLength)}...`;
}

function parseContent(rawContent) {
  if (!rawContent) {
    throw new Error("AI 응답 본문이 비어 있습니다.");
  }

  if (typeof rawContent === "string") {
    return JSON.parse(rawContent);
  }

  // Some chat completion variants may return a content array.
  if (Array.isArray(rawContent)) {
    const textBlock = rawContent.find((block) => block?.type === "text");
    if (!textBlock || typeof textBlock.text !== "string") {
      throw new Error("AI 응답 형식을 해석할 수 없습니다.");
    }
    return JSON.parse(textBlock.text);
  }

  throw new Error("AI 응답 형식을 해석할 수 없습니다.");
}

export function createOpenAIProvider({ apiKey, model }) {
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY가 설정되지 않았습니다.");
  }

  return {
    name: "openai",
    async generate({ systemPrompt, userPrompt, schema }) {
      const response = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          model,
          temperature: 0.7,
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: userPrompt }
          ],
          response_format: {
            type: "json_schema",
            json_schema: schema
          }
        })
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(
          `OpenAI API 오류(${response.status}): ${safePreview(errorText)}`
        );
      }

      const payload = await response.json();
      const content = payload?.choices?.[0]?.message?.content;
      return parseContent(content);
    }
  };
}
