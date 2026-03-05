import { derivePillars } from "./saju-engine.js";
import {
  buildSystemPrompt,
  buildUserPrompt,
  RESPONSE_JSON_SCHEMA,
  getTypeLabel
} from "./prompt.js";
import { createProviderFromEnv } from "./providers/index.js";
import { AppError } from "./errors.js";

const provider = createProviderFromEnv();

function normalizeReport(report, type) {
  const fallbackTitle = `AI ${getTypeLabel(type)}`;

  return {
    title: report?.title || fallbackTitle,
    headline: report?.headline || "분석 결과를 요약합니다.",
    summary: report?.summary || "해설을 생성하지 못했습니다.",
    sections: Array.isArray(report?.sections) ? report.sections : [],
    cautions: Array.isArray(report?.cautions) ? report.cautions : [],
    actionTips: Array.isArray(report?.actionTips) ? report.actionTips : [],
    lucky: {
      color: report?.lucky?.color || "-",
      number: report?.lucky?.number || "-",
      direction: report?.lucky?.direction || "-"
    }
  };
}

export async function analyzeFortune({ profile, type }) {
  let pillars = null;
  try {
    pillars = derivePillars(profile);
  } catch (error) {
    throw new AppError({
      code: "SAJU_CALCULATION_FAILED",
      message: "사주 계산에 실패했습니다. 입력값을 확인해주세요.",
      statusCode: 422,
      retryable: false,
      cause: error
    });
  }

  const systemPrompt = buildSystemPrompt(type);
  const userPrompt = buildUserPrompt({ profile, type, pillars });

  let rawReport = null;
  try {
    rawReport = await provider.generate({
      profile,
      type,
      systemPrompt,
      userPrompt,
      schema: RESPONSE_JSON_SCHEMA
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    const matched = /OpenAI API 오류\((\d+)\)/.exec(message);
    const providerStatus = matched ? Number(matched[1]) : 0;
    const isNetworkError =
      message.toLowerCase().includes("fetch failed") ||
      message.toLowerCase().includes("network") ||
      message.toLowerCase().includes("timed out");
    const retryable = providerStatus === 429 || providerStatus >= 500 || isNetworkError;

    throw new AppError({
      code: "AI_PROVIDER_ERROR",
      message: retryable
        ? "AI 분석 요청이 일시적으로 혼잡합니다. 잠시 후 다시 시도해주세요."
        : "AI 분석 요청에 실패했습니다.",
      statusCode: retryable ? 503 : 500,
      retryable,
      cause: error
    });
  }

  return {
    meta: {
      provider: provider.name,
      type
    },
    pillars,
    report: normalizeReport(rawReport, type)
  };
}
