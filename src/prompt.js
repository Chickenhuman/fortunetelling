const TYPE_LABELS = {
  overall: "종합 사주풀이",
  daily: "일일 운세",
  monthly: "월간 운세",
  yearly: "연간 운세"
};

const GENDER_LABELS = {
  male: "남성",
  female: "여성"
};

const CALENDAR_LABELS = {
  solar: "양력",
  lunar: "음력"
};

function pillarLine(label, pillar) {
  if (!pillar) {
    return `${label}: 출생시간 미상`;
  }
  return `${label}: ${pillar.stem}${pillar.branch}`;
}

export function getTypeLabel(type) {
  return TYPE_LABELS[type] ?? "사주풀이";
}

export function buildSystemPrompt(type) {
  const typeLabel = getTypeLabel(type);

  return [
    "너는 일반인을 대상으로 전문 상담가 느낌의 사주 해설을 제공하는 한국어 상담 AI다.",
    "불필요한 미신적 단정은 피하고, 실천 가능한 조언 중심으로 말한다.",
    "문체는 친절하지만 단호하고 구체적이어야 한다.",
    `이번 응답 주제는 ${typeLabel}이다.`,
    "반드시 JSON만 출력한다. 설명문/코드블록/마크다운 금지.",
    "JSON 스키마를 엄격히 지켜라. sections는 최소 3개로 작성한다.",
    "cautions/actionTips는 각각 3개씩 작성한다."
  ].join(" ");
}

export function buildUserPrompt({ profile, type, pillars }) {
  const typeLabel = getTypeLabel(type);

  return [
    `[요청 유형] ${typeLabel}`,
    `[이름] ${profile.name}`,
    `[성별] ${GENDER_LABELS[profile.gender]}`,
    `[생년월일] ${profile.birthDate}`,
    `[달력 기준] ${CALENDAR_LABELS[profile.calendarType]}`,
    `[출생시간] ${profile.birthTimeUnknown ? "모름" : profile.birthTime}`,
    "[명식 참고값 - 임시 계산 결과]",
    pillarLine("년주", pillars.year),
    pillarLine("월주", pillars.month),
    pillarLine("일주", pillars.day),
    pillarLine("시주", pillars.hour),
    "[출력 조건]",
    "- 전문 상담을 받는 느낌의 상세 해설",
    "- 과장/공포 조장 금지",
    "- 구체적인 행동 제안 포함"
  ].join("\n");
}

export const RESPONSE_JSON_SCHEMA = {
  name: "fortune_response",
  schema: {
    type: "object",
    additionalProperties: false,
    required: [
      "title",
      "headline",
      "summary",
      "sections",
      "cautions",
      "actionTips",
      "lucky"
    ],
    properties: {
      title: { type: "string" },
      headline: { type: "string" },
      summary: { type: "string" },
      sections: {
        type: "array",
        minItems: 3,
        items: {
          type: "object",
          additionalProperties: false,
          required: ["heading", "body"],
          properties: {
            heading: { type: "string" },
            body: { type: "string" }
          }
        }
      },
      cautions: {
        type: "array",
        minItems: 3,
        items: { type: "string" }
      },
      actionTips: {
        type: "array",
        minItems: 3,
        items: { type: "string" }
      },
      lucky: {
        type: "object",
        additionalProperties: false,
        required: ["color", "number", "direction"],
        properties: {
          color: { type: "string" },
          number: { type: "string" },
          direction: { type: "string" }
        }
      }
    }
  }
};
