import test from "node:test";
import assert from "node:assert/strict";
import { resolveBirthTime } from "../src/birth-time.js";

test("resolveBirthTime supports earthly branch labels", () => {
  const resolved = resolveBirthTime("유시");

  assert.equal(resolved.display, "유시");
  assert.equal(resolved.label, "유시");
  assert.equal(resolved.hour, 17);
  assert.equal(resolved.minute, 30);
});

test("resolveBirthTime parses Korean meridiem input", () => {
  const resolved = resolveBirthTime("오전 7:25");

  assert.equal(resolved.display, "오전 7:25");
  assert.equal(resolved.label, "묘시");
  assert.equal(resolved.hour, 7);
  assert.equal(resolved.minute, 25);
});

test("resolveBirthTime parses compact 24-hour input", () => {
  const resolved = resolveBirthTime("1930");

  assert.equal(resolved.display, "오후 7:30");
  assert.equal(resolved.label, "술시");
  assert.equal(resolved.hour, 19);
  assert.equal(resolved.minute, 30);
});

test("resolveBirthTime rejects invalid text", () => {
  assert.equal(resolveBirthTime("아침 아무때나"), null);
});
