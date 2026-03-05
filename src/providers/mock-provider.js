import { getTypeLabel } from "../prompt.js";

function lineByType(type) {
  switch (type) {
    case "daily":
      return "오늘은 속도를 높이기보다 우선순위를 정리하면 성과가 커지는 흐름입니다.";
    case "monthly":
      return "이번 달은 관계 정리와 실무 완성도를 끌어올릴수록 운이 따라옵니다.";
    case "yearly":
      return "올해는 확장보다 구조 재정비가 장기 성과를 만드는 해입니다.";
    default:
      return "전체 운세는 기회가 올 때 즉시 실행할 준비를 갖추는 쪽으로 열려 있습니다.";
  }
}

export function createMockProvider() {
  return {
    name: "mock",
    async generate({ profile, type }) {
      const typeLabel = getTypeLabel(type);
      const rootLine = lineByType(type);

      return {
        title: `AI ${typeLabel}`,
        headline: `${profile.name}님은 분석형 직관과 실행력이 동시에 강한 흐름입니다.`,
        summary: `${rootLine} 감정 소비를 줄이고 핵심 목표를 단순화하면 운의 체감이 더 빨라집니다.`,
        sections: [
          {
            heading: "성향 해석",
            body: "판단 속도가 빠르고 상황 적응력이 좋아, 변화가 큰 환경에서도 중심을 유지하는 편입니다."
          },
          {
            heading: "관계와 커뮤니케이션",
            body: "조언자 역할을 자주 맡게 되는 흐름이 있어, 말의 톤을 부드럽게 조정하면 신뢰가 더 크게 쌓입니다."
          },
          {
            heading: "일과 재물 흐름",
            body: "단기 이익보다 반복 가능한 루틴을 만들 때 수익 안정성이 올라갑니다. 작은 자동화를 먼저 붙이세요."
          },
          {
            heading: "실행 포인트",
            body: rootLine
          }
        ],
        cautions: [
          "결정을 한 번에 많이 내리면 체력과 집중력이 동시에 떨어질 수 있습니다.",
          "관계 피로가 쌓이면 중요한 기회를 미루게 될 수 있습니다.",
          "정보 수집만 길어지고 실행이 늦어지는 패턴을 경계하세요."
        ],
        actionTips: [
          "이번 주 핵심 목표를 1개로 정하고 매일 30분씩 고정 실행하세요.",
          "대화에서 결론 먼저 말하고 근거를 짧게 덧붙이면 신뢰도가 올라갑니다.",
          "소비/투자 의사결정은 24시간 보류 규칙을 적용해 충동을 줄이세요."
        ],
        lucky: {
          color: "딥 블루",
          number: "3, 8",
          direction: "동북"
        }
      };
    }
  };
}
