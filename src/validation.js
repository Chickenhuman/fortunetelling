const ALLOWED_GENDERS = new Set(["male", "female"]);
const ALLOWED_CALENDARS = new Set(["solar", "lunar"]);
const ALLOWED_TYPES = new Set(["overall", "daily", "monthly", "yearly"]);
import { resolveBirthTime } from "./birth-time.js";

const SUPPORTED_MIN_YEAR = 1900;
const SUPPORTED_MAX_YEAR = 2050;

function normalizeText(value) {
  return typeof value === "string" ? value.trim() : "";
}

function isValidDateString(value) {
  const matched = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!matched) {
    return false;
  }

  const year = Number(matched[1]);
  const month = Number(matched[2]);
  const day = Number(matched[3]);
  const date = new Date(Date.UTC(year, month - 1, day));

  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() + 1 === month &&
    date.getUTCDate() === day
  );
}

export function validateAnalyzePayload(payload) {
  if (!payload || typeof payload !== "object") {
    throw new Error("요청 본문이 올바르지 않습니다.");
  }

  const profile = payload.profile;
  const type = normalizeText(payload.type) || "overall";

  if (!profile || typeof profile !== "object") {
    throw new Error("profile 정보가 필요합니다.");
  }

  const name = normalizeText(profile.name) || "고객";
  const gender = normalizeText(profile.gender);
  const birthDate = normalizeText(profile.birthDate);
  const calendarType = normalizeText(profile.calendarType);
  const birthTimeUnknown = Boolean(profile.birthTimeUnknown);
  const birthTime = normalizeText(profile.birthTime);
  const resolvedBirthTime = birthTimeUnknown ? null : resolveBirthTime(birthTime);

  if (!ALLOWED_GENDERS.has(gender)) {
    throw new Error("성별 값이 올바르지 않습니다.");
  }

  if (!isValidDateString(birthDate)) {
    throw new Error("생년월일 형식이 올바르지 않습니다.");
  }

  const year = Number(birthDate.slice(0, 4));
  if (year < SUPPORTED_MIN_YEAR || year > SUPPORTED_MAX_YEAR) {
    throw new Error(
      `지원 범위는 ${SUPPORTED_MIN_YEAR}년부터 ${SUPPORTED_MAX_YEAR}년까지입니다.`
    );
  }

  if (!ALLOWED_CALENDARS.has(calendarType)) {
    throw new Error("양력/음력 값이 올바르지 않습니다.");
  }

  if (!birthTimeUnknown && !resolvedBirthTime) {
    throw new Error("태어난 시간은 예: 오전 7:30, 오후 3, 19:20 형태로 입력해주세요.");
  }

  if (!ALLOWED_TYPES.has(type)) {
    throw new Error("분석 타입이 올바르지 않습니다.");
  }

  return {
    profile: {
      name,
      gender,
      birthDate,
      calendarType,
      birthTimeUnknown,
      birthTime: birthTimeUnknown ? "" : resolvedBirthTime.display,
      birthTimeLabel: birthTimeUnknown ? "" : resolvedBirthTime.label
    },
    type
  };
}
