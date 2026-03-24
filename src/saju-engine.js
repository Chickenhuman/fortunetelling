import { calculateSaju, lunarToSolar } from "@fullstackfamily/manseryeok";
import { resolveBirthTime } from "./birth-time.js";

const STEM_ELEMENT = {
  甲: "wood",
  乙: "wood",
  丙: "fire",
  丁: "fire",
  戊: "earth",
  己: "earth",
  庚: "metal",
  辛: "metal",
  壬: "water",
  癸: "water"
};

const BRANCH_ELEMENT = {
  子: "water",
  丑: "earth",
  寅: "wood",
  卯: "wood",
  辰: "earth",
  巳: "fire",
  午: "fire",
  未: "earth",
  申: "metal",
  酉: "metal",
  戌: "earth",
  亥: "water"
};

const ELEMENT_COLORS = {
  wood: "#2E7D32",
  fire: "#D84315",
  earth: "#A1887F",
  metal: "#546E7A",
  water: "#1565C0"
};

function splitBirthDate(birthDate) {
  const [yearText, monthText, dayText] = birthDate.split("-");
  return {
    year: Number(yearText),
    month: Number(monthText),
    day: Number(dayText)
  };
}

function normalizePillarText(value) {
  return typeof value === "string" ? value.trim() : "";
}

function pickPillarText({ hanja, fallback }) {
  const hanjaText = normalizePillarText(hanja);
  if (hanjaText.length >= 2) {
    return hanjaText;
  }

  const fallbackText = normalizePillarText(fallback);
  if (fallbackText.length >= 2) {
    return fallbackText;
  }

  return "";
}

function parsePillar({ hanja, fallback }) {
  const text = pickPillarText({ hanja, fallback });
  if (!text) {
    return null;
  }

  const stem = text[0];
  const branch = text[1];

  return {
    stem,
    stemColor: ELEMENT_COLORS[STEM_ELEMENT[stem]] ?? "#333333",
    branch,
    branchColor: ELEMENT_COLORS[BRANCH_ELEMENT[branch]] ?? "#333333"
  };
}

function resolveSolarDate(profile) {
  const { year, month, day } = splitBirthDate(profile.birthDate);

  if (profile.calendarType === "solar") {
    return { year, month, day };
  }

  const converted = lunarToSolar(year, month, day, false);
  const solarYear = converted?.solar?.year ?? converted?.solarYear;
  const solarMonth = converted?.solar?.month ?? converted?.solarMonth;
  const solarDay = converted?.solar?.day ?? converted?.solarDay;

  if (!solarYear || !solarMonth || !solarDay) {
    throw new Error("음력을 양력으로 변환하지 못했습니다.");
  }

  return {
    year: solarYear,
    month: solarMonth,
    day: solarDay
  };
}

function buildSajuArgs(profile, solarDate) {
  if (profile.birthTimeUnknown) {
    return [solarDate.year, solarDate.month, solarDate.day];
  }

  const clock = resolveBirthTime(profile.birthTime);
  if (!clock) {
    return [solarDate.year, solarDate.month, solarDate.day];
  }

  return [
    solarDate.year,
    solarDate.month,
    solarDate.day,
    clock.hour,
    clock.minute
  ];
}

export function derivePillars(profile) {
  try {
    const solarDate = resolveSolarDate(profile);
    const saju = calculateSaju(...buildSajuArgs(profile, solarDate));

    const year = parsePillar({
      hanja: saju.yearPillarHanja,
      fallback: saju.yearPillar
    });
    const month = parsePillar({
      hanja: saju.monthPillarHanja,
      fallback: saju.monthPillar
    });
    const day = parsePillar({
      hanja: saju.dayPillarHanja,
      fallback: saju.dayPillar
    });
    const hour = profile.birthTimeUnknown
      ? null
      : parsePillar({
          hanja: saju.hourPillarHanja,
          fallback: saju.hourPillar
        });

    if (!year || !month || !day) {
      throw new Error("사주 계산 결과가 불완전합니다.");
    }

    return {
      year,
      month,
      day,
      hour
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "알 수 없는 오류";
    throw new Error(`사주 계산에 실패했습니다: ${message}`);
  }
}
