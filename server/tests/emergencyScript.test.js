// server/tests/emergencyScript.test.js
const test = require("node:test");
const assert = require("node:assert");

const {
  buildEmergencyScript,
  estimateSeconds,
  numberToWords,
  distanceToWords,
  spokenList,
} = require("../services/emergencyScript");

const GOLDEN = {
  id: "demo_request_1",
  natureOfHelp: "Medical Assistance",
  priority: "Critical",
  distanceMiles: 0.4,
  ai: { peopleAffected: 2, needs: ["first aid", "bleeding assistance", "mobility assistance"] },
};

test("the golden emergency reads as a critical medical alert", () => {
  const script = buildEmergencyScript(GOLDEN);
  assert.match(script, /critical medical emergency/i);
  assert.match(script, /two people are involved/i);
  assert.match(script, /bleeding assistance/i);
  assert.match(script, /mobility assistance/i);
});

test("the alert stays within its spoken budget", () => {
  const seconds = estimateSeconds(buildEmergencyScript(GOLDEN));
  assert.ok(seconds >= 5 && seconds <= 12, `expected 5-12s, got ${seconds.toFixed(1)}s`);
});

test("numbers and distances are spelled out for speech", () => {
  assert.strictEqual(numberToWords(2), "two");
  assert.strictEqual(numberToWords(21), "twenty-one");
  assert.strictEqual(distanceToWords(0.4), "zero point four");
  assert.strictEqual(distanceToWords(2.0), "two");
  assert.strictEqual(distanceToWords(null), null);
  assert.match(buildEmergencyScript(GOLDEN), /zero point four miles away/);
});

test("one person is singular", () => {
  const script = buildEmergencyScript({ ...GOLDEN, ai: { peopleAffected: 1, needs: [] } });
  assert.match(script, /one person is involved/i);
  assert.doesNotMatch(script, /people are involved/i);
});

test("every sentence is capitalized", () => {
  const script = buildEmergencyScript(GOLDEN);
  for (const sentence of script.split(". ")) {
    const first = sentence.trim()[0];
    assert.strictEqual(first, first.toUpperCase(), `not capitalized: "${sentence}"`);
  }
});

test("needs are capped so the alert cannot run long", () => {
  const script = buildEmergencyScript({
    ...GOLDEN,
    ai: { peopleAffected: 2, needs: ["a", "b", "c", "d", "e", "f"] },
  });
  assert.ok(!script.includes("d,") && !script.includes(" and f"), "only the first three needs are read");
});

test("a sparse emergency still produces a usable sentence", () => {
  const script = buildEmergencyScript({ id: "x", natureOfHelp: "Food & Water", priority: "Normal", ai: {} });
  assert.ok(script.length > 0);
  assert.match(script, /food and water/i);
});

test("a missing request never throws", () => {
  assert.ok(buildEmergencyScript(null).length > 0);
  assert.ok(buildEmergencyScript(undefined).length > 0);
  assert.ok(buildEmergencyScript({}).length > 0);
});

test("the wording reports rather than diagnoses", () => {
  const script = buildEmergencyScript(GOLDEN);
  assert.match(script, /reported needs/i);
  // No clinical verdicts about the patient.
  assert.doesNotMatch(script, /diagnos|suffering from|the patient has/i);
});

test("lists are joined the way a person speaks them", () => {
  assert.strictEqual(spokenList(["a"]), "a");
  assert.strictEqual(spokenList(["a", "b"]), "a and b");
  assert.strictEqual(spokenList(["a", "b", "c"]), "a, b and c");
});
