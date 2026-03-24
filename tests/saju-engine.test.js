import test from "node:test";
import assert from "node:assert/strict";
import { derivePillars } from "../src/saju-engine.js";

test("derivePillars returns four pillars when birth time is known", () => {
  const pillars = derivePillars({
    birthDate: "1995-02-14",
    calendarType: "solar",
    birthTimeUnknown: false,
    birthTime: "오후 12:10",
    birthTimeLabel: "오시"
  });

  assert.equal(typeof pillars.year.stem, "string");
  assert.equal(typeof pillars.month.branch, "string");
  assert.equal(typeof pillars.day.stem, "string");
  assert.ok(pillars.hour);
  assert.equal(typeof pillars.hour.stem, "string");
});

test("derivePillars supports lunar input and empty hour pillar", () => {
  const pillars = derivePillars({
    birthDate: "1995-01-15",
    calendarType: "lunar",
    birthTimeUnknown: true,
    birthTime: ""
  });

  assert.equal(typeof pillars.year.stem, "string");
  assert.equal(typeof pillars.month.stem, "string");
  assert.equal(typeof pillars.day.stem, "string");
  assert.equal(pillars.hour, null);
});
