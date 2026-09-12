// server/tests/emergencySchema.test.js
const test = require("node:test");
const assert = require("node:assert");

const {
  validateAnalysis,
  normalizeCategory,
  normalizePriority,
  normalizePeopleAffected,
  normalizeNeeds,
  normalizeLanguage,
} = require("../utils/emergencySchema");

test("loose model wording is normalized onto project enums", () => {
  assert.strictEqual(normalizeCategory("medical"), "Medical Assistance");
  assert.strictEqual(normalizeCategory("MEDICAL EMERGENCY"), "Medical Assistance");
  assert.strictEqual(normalizeCategory("trapped"), "Emergency Rescue");
  assert.strictEqual(normalizePriority("critical"), "Critical");
  assert.strictEqual(normalizePriority("life-threatening"), "Critical");
  assert.strictEqual(normalizePriority("low"), "Normal");
});

test("'highest' resolves to Critical rather than High", () => {
  assert.strictEqual(normalizePriority("highest"), "Critical");
});

test("unrecognized values return null instead of guessing", () => {
  assert.strictEqual(normalizeCategory("banana"), null);
  assert.strictEqual(normalizePriority("spicy"), null);
  assert.strictEqual(normalizeCategory(""), null);
  assert.strictEqual(normalizeCategory(undefined), null);
});

test("headcount is coerced, and out-of-range values become null", () => {
  assert.strictEqual(normalizePeopleAffected("2"), 2);
  assert.strictEqual(normalizePeopleAffected(3.4), 3);
  assert.strictEqual(normalizePeopleAffected(0), null);
  assert.strictEqual(normalizePeopleAffected(-5), null);
  assert.strictEqual(normalizePeopleAffected(999999), null);
  assert.strictEqual(normalizePeopleAffected("not a number"), null);
  assert.strictEqual(normalizePeopleAffected(null), null);
});

test("needs are trimmed, de-duplicated case-insensitively and capped", () => {
  const needs = normalizeNeeds(["  first aid ", "First Aid", "", null, "bleeding assistance"]);
  assert.deepStrictEqual(needs, ["first aid", "bleeding assistance"]);
  assert.strictEqual(normalizeNeeds("not an array").length, 0);
  assert.ok(normalizeNeeds(Array(50).fill(0).map((_, i) => `need ${i}`)).length <= 6);
});

test("language accepts BCP-47 tags and rejects prose", () => {
  assert.strictEqual(normalizeLanguage("es"), "es");
  assert.strictEqual(normalizeLanguage("pt-BR"), "pt-br");
  assert.strictEqual(normalizeLanguage("Spanish, probably"), null);
});

test("a complete analysis validates and is normalized", () => {
  const { ok, value } = validateAnalysis({
    category: "medical",
    priority: "critical",
    summary: "  Person bleeding   after a crash.  ",
    peopleAffected: "2",
    needs: ["first aid", "First Aid"],
    detectedLanguage: "en",
  });
  assert.strictEqual(ok, true);
  assert.strictEqual(value.category, "Medical Assistance");
  assert.strictEqual(value.priority, "Critical");
  assert.strictEqual(value.summary, "Person bleeding after a crash.");
  assert.strictEqual(value.peopleAffected, 2);
  assert.deepStrictEqual(value.needs, ["first aid"]);
});

test("missing required fields are rejected with reasons", () => {
  const { ok, value, errors } = validateAnalysis({ category: "medical" });
  assert.strictEqual(ok, false);
  assert.strictEqual(value, null);
  assert.ok(errors.length >= 2);
});

test("non-objects are rejected rather than throwing", () => {
  for (const input of [null, undefined, "string", 42, []]) {
    const { ok } = validateAnalysis(input);
    assert.strictEqual(ok, false);
  }
});

test("optional fields degrade individually without failing validation", () => {
  const { ok, value } = validateAnalysis({
    category: "medical",
    priority: "critical",
    summary: "Injury reported.",
    peopleAffected: "garbage",
    needs: "not an array",
    detectedLanguage: "nonsense prose here",
  });
  assert.strictEqual(ok, true);
  assert.strictEqual(value.peopleAffected, null);
  assert.deepStrictEqual(value.needs, []);
  assert.strictEqual(value.detectedLanguage, null);
});
