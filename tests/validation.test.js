import test from "node:test";
import assert from "node:assert/strict";
import { validateAnalyzePayload } from "../src/validation.js";

test("validateAnalyzePayload accepts a valid payload", () => {
  const validated = validateAnalyzePayload({
    profile: {
      name: "테스터",
      gender: "male",
      birthDate: "1995-02-14",
      calendarType: "solar",
      birthTimeUnknown: false,
      birthTime: "오시"
    },
    type: "overall"
  });

  assert.equal(validated.type, "overall");
  assert.equal(validated.profile.birthDate, "1995-02-14");
  assert.equal(validated.profile.birthTime, "오시");
});

test("validateAnalyzePayload rejects years outside 1900~2050", () => {
  assert.throws(
    () =>
      validateAnalyzePayload({
        profile: {
          name: "테스터",
          gender: "male",
          birthDate: "1899-12-31",
          calendarType: "solar",
          birthTimeUnknown: true,
          birthTime: ""
        },
        type: "overall"
      }),
    /1900년부터 2050년/
  );
});
