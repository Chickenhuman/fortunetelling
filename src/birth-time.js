const BIRTH_TIME_SLOTS = [
  { label: "자시", startMinute: 23 * 60 + 30, endMinute: 1 * 60 + 29, fallbackHour: 23, fallbackMinute: 30 },
  { label: "축시", startMinute: 1 * 60 + 30, endMinute: 3 * 60 + 29, fallbackHour: 1, fallbackMinute: 30 },
  { label: "인시", startMinute: 3 * 60 + 30, endMinute: 5 * 60 + 29, fallbackHour: 3, fallbackMinute: 30 },
  { label: "묘시", startMinute: 5 * 60 + 30, endMinute: 7 * 60 + 29, fallbackHour: 5, fallbackMinute: 30 },
  { label: "진시", startMinute: 7 * 60 + 30, endMinute: 9 * 60 + 29, fallbackHour: 7, fallbackMinute: 30 },
  { label: "사시", startMinute: 9 * 60 + 30, endMinute: 11 * 60 + 29, fallbackHour: 9, fallbackMinute: 30 },
  { label: "오시", startMinute: 11 * 60 + 30, endMinute: 13 * 60 + 29, fallbackHour: 11, fallbackMinute: 30 },
  { label: "미시", startMinute: 13 * 60 + 30, endMinute: 15 * 60 + 29, fallbackHour: 13, fallbackMinute: 30 },
  { label: "신시", startMinute: 15 * 60 + 30, endMinute: 17 * 60 + 29, fallbackHour: 15, fallbackMinute: 30 },
  { label: "유시", startMinute: 17 * 60 + 30, endMinute: 19 * 60 + 29, fallbackHour: 17, fallbackMinute: 30 },
  { label: "술시", startMinute: 19 * 60 + 30, endMinute: 21 * 60 + 29, fallbackHour: 19, fallbackMinute: 30 },
  { label: "해시", startMinute: 21 * 60 + 30, endMinute: 23 * 60 + 29, fallbackHour: 21, fallbackMinute: 30 }
];

export const ALLOWED_BIRTHTIMES = new Set(BIRTH_TIME_SLOTS.map((slot) => slot.label));

function normalizeText(value) {
  return typeof value === "string" ? value.trim() : "";
}

function compactBirthTimeText(value) {
  return normalizeText(value)
    .toLowerCase()
    .replace(/\./g, "")
    .replace(/\s+/g, "");
}

function isMinuteInSlot(totalMinute, slot) {
  if (slot.startMinute <= slot.endMinute) {
    return totalMinute >= slot.startMinute && totalMinute <= slot.endMinute;
  }

  return totalMinute >= slot.startMinute || totalMinute <= slot.endMinute;
}

function resolveBirthTimeLabel(hour, minute) {
  const totalMinute = hour * 60 + minute;
  const matchedSlot = BIRTH_TIME_SLOTS.find((slot) => isMinuteInSlot(totalMinute, slot));
  return matchedSlot ? matchedSlot.label : "";
}

function formatBirthTimeDisplay(hour, minute) {
  const meridiem = hour < 12 ? "오전" : "오후";
  const hour12 = hour % 12 || 12;
  return `${meridiem} ${hour12}:${String(minute).padStart(2, "0")}`;
}

function parseClock(value) {
  let normalized = compactBirthTimeText(value);
  if (!normalized) {
    return null;
  }

  let meridiem = "";
  if (normalized.startsWith("오전")) {
    meridiem = "am";
    normalized = normalized.slice(2);
  } else if (normalized.startsWith("오후")) {
    meridiem = "pm";
    normalized = normalized.slice(2);
  } else if (normalized.startsWith("am")) {
    meridiem = "am";
    normalized = normalized.slice(2);
  } else if (normalized.startsWith("pm")) {
    meridiem = "pm";
    normalized = normalized.slice(2);
  }

  normalized = normalized.replace(/분/g, "").replace(/시/g, ":").replace(/:+$/, "");

  let hourText = "";
  let minuteText = "0";

  if (/^\d{1,2}:\d{1,2}$/.test(normalized)) {
    [hourText, minuteText] = normalized.split(":");
  } else if (/^\d{3,4}$/.test(normalized)) {
    if (normalized.length === 3) {
      hourText = normalized.slice(0, 1);
      minuteText = normalized.slice(1);
    } else {
      hourText = normalized.slice(0, 2);
      minuteText = normalized.slice(2);
    }
  } else if (/^\d{1,2}$/.test(normalized)) {
    hourText = normalized;
  } else {
    return null;
  }

  let hour = Number(hourText);
  const minute = Number(minuteText);

  if (!Number.isInteger(hour) || !Number.isInteger(minute) || minute < 0 || minute > 59) {
    return null;
  }

  if (meridiem) {
    if (hour < 1 || hour > 12) {
      return null;
    }

    if (meridiem === "am") {
      hour = hour === 12 ? 0 : hour;
    } else {
      hour = hour === 12 ? 12 : hour + 12;
    }
  } else if (hour < 0 || hour > 23) {
    return null;
  }

  return { hour, minute };
}

export function resolveBirthTime(value) {
  const rawValue = normalizeText(value);
  if (!rawValue) {
    return null;
  }

  if (ALLOWED_BIRTHTIMES.has(rawValue)) {
    const slot = BIRTH_TIME_SLOTS.find((candidate) => candidate.label === rawValue);
    return {
      input: rawValue,
      display: rawValue,
      label: rawValue,
      hour: slot.fallbackHour,
      minute: slot.fallbackMinute
    };
  }

  const clock = parseClock(rawValue);
  if (!clock) {
    return null;
  }

  const label = resolveBirthTimeLabel(clock.hour, clock.minute);
  if (!label) {
    return null;
  }

  return {
    input: rawValue,
    display: formatBirthTimeDisplay(clock.hour, clock.minute),
    label,
    hour: clock.hour,
    minute: clock.minute
  };
}
