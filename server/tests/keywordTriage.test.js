// server/tests/keywordTriage.test.js
const test = require("node:test");
const assert = require("node:assert");

const {
  summarizeHelpRequest,
  analyzePriority,
  analyzeWithKeywords,
  estimatePeopleAffected,
} = require("../utils/keywordTriage");

const GOLDEN = "We were in a car accident. My friend is bleeding badly and can't walk.";

test("golden scenario is classified as a critical medical emergency", () => {
  assert.strictEqual(summarizeHelpRequest(GOLDEN), "Medical Assistance");
  assert.strictEqual(analyzePriority(GOLDEN), "Critical");
});

test("golden scenario extracts the expected needs", () => {
  const { needs } = analyzeWithKeywords(GOLDEN);
  assert.ok(needs.includes("first aid"), `expected first aid in ${JSON.stringify(needs)}`);
  assert.ok(needs.includes("bleeding assistance"), `expected bleeding assistance in ${JSON.stringify(needs)}`);
  assert.ok(needs.includes("mobility assistance"), `expected mobility assistance in ${JSON.stringify(needs)}`);
});

test("a vehicle accident is not mistaken for a request for a ride", () => {
  const { needs } = analyzeWithKeywords(GOLDEN);
  assert.ok(!needs.includes("transportation"), "bare 'car' should not imply a transport need");
});

test("headcount is extracted when stated and null when not", () => {
  assert.strictEqual(estimatePeopleAffected("there are 3 people trapped"), 3);
  assert.strictEqual(estimatePeopleAffected("two people are hurt"), 2);
  assert.strictEqual(estimatePeopleAffected(GOLDEN), null);
});

test("analysis never throws on empty or junk input", () => {
  for (const input of ["", "   ", null, undefined, "??!!"]) {
    const result = analyzeWithKeywords(input);
    assert.ok(typeof result.category === "string");
    assert.ok(["Critical", "High", "Normal"].includes(result.priority));
    assert.ok(Array.isArray(result.needs));
  }
});

test("non-medical emergencies route to their own categories", () => {
  assert.strictEqual(summarizeHelpRequest("we have no food or water"), "Food & Water");
  assert.strictEqual(summarizeHelpRequest("we need transport, we are stranded"), "Transportation");
});
