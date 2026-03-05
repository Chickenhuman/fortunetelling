import { AppError } from "./errors.js";
import { hasPaidBillingHistory } from "./billing-service.js";

const DEFAULT_SURFACE = "result";
const ALLOWED_SURFACES = new Set(["input", "result", "history", "billing"]);

const SURFACE_DEFAULTS = {
  input: {
    slotId: "input_top_banner",
    headline: "무료 사용자 혜택 안내",
    body: "회원가입 후 첫 결제 시 크레딧 추가 지급 이벤트를 확인해보세요.",
    ctaLabel: "크레딧 안내 보기"
  },
  result: {
    slotId: "result_inline_banner",
    headline: "정밀 리포트는 크레딧으로 확장",
    body: "종합 리포트 외에도 일/월/연 흐름을 더 자주 확인해보세요.",
    ctaLabel: "크레딧 충전하러 가기"
  },
  history: {
    slotId: "history_bottom_banner",
    headline: "사주 해석 활용 팁",
    body: "기록된 리포트를 바탕으로 주간/월간 계획을 세워보세요.",
    ctaLabel: "활용 가이드 보기"
  },
  billing: {
    slotId: "billing_inline_banner",
    headline: "요금제 활용 가이드",
    body: "크레딧을 아껴 쓰는 분석 유형 조합을 확인해보세요.",
    ctaLabel: "추천 사용법 보기"
  }
};

function normalizeText(value) {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeSurface(value) {
  const normalized = normalizeText(value).toLowerCase();
  if (!normalized) {
    return DEFAULT_SURFACE;
  }

  if (!ALLOWED_SURFACES.has(normalized)) {
    throw new AppError({
      code: "AD_INVALID_SURFACE",
      message: "지원하지 않는 광고 노출 위치입니다.",
      statusCode: 400,
      retryable: false
    });
  }

  return normalized;
}

async function resolveTier({ user, env }) {
  if (!user) {
    return "guest";
  }

  const isPaidUser = await hasPaidBillingHistory({ user, env });
  return isPaidUser ? "premium" : "free";
}

function resolvePolicyByTier(tier) {
  if (tier === "premium") {
    return {
      showAds: false,
      reason: "PAID_USER_AD_FREE",
      refreshIntervalSec: 0
    };
  }

  return {
    showAds: true,
    reason: tier === "guest" ? "GUEST_DEFAULT_POLICY" : "FREE_USER_POLICY",
    refreshIntervalSec: 90
  };
}

export async function getAdPlacement({ surface, user = null, env = process.env }) {
  const normalizedSurface = normalizeSurface(surface);
  const tier = await resolveTier({ user, env });
  const policy = resolvePolicyByTier(tier);
  const surfaceDefaults = SURFACE_DEFAULTS[normalizedSurface];

  if (!policy.showAds) {
    return {
      tier,
      surface: normalizedSurface,
      policy,
      creative: null
    };
  }

  return {
    tier,
    surface: normalizedSurface,
    policy,
    creative: {
      network: "house",
      slotId: surfaceDefaults.slotId,
      label: "광고",
      headline: surfaceDefaults.headline,
      body: surfaceDefaults.body,
      ctaLabel: surfaceDefaults.ctaLabel,
      ctaUrl: "/"
    }
  };
}
