// server/tests/emergencyAnalyzer.test.js
//
// Covers the guarantee the demo depends on: an SOS stays sendable no matter
// what Gemini does.
const test = require("node:test");
const assert = require("node:assert");

const CLIENT_PATH = require.resolve("../services/geminiClient");
const ANALYZER_PATH = require.resolve("../services/EmergencyAnalyzer");
const { SchemaType } = require("@google/generative-ai");

const GOLDEN = "We were in a car accident. My friend is bleeding badly and can't walk.";

// Swaps in a fake Gemini client and reloads the analyzer against it.
function loadAnalyzerWith(stub) {
  delete require.cache[ANALYZER_PATH];
  require.cache[CLIENT_PATH] = {
    id: CLIENT_PATH,
    filename: CLIENT_PATH,
    loaded: true,
    exports: { SchemaType, ...stub },
  };
  return require(ANALYZER_PATH);
}

test("uses Gemini output when it is valid", async () => {
  const analyzer = loadAnalyzerWith({
    isConfigured: () => true,
    generateJSON: async () => ({
      model: "gemini-2.0-flash",
      data: {
        category: "medical",
        priority: "critical",
        summary: "A person is bleeding after a vehicle accident and cannot walk.",
        peopleAffected: 2,
        needs: ["first aid", "bleeding assistance", "mobility assistance"],
        detectedLanguage: "en",
      },
    }),
  });

  const result = await analyzer.analyzeEmergency(GOLDEN);

  assert.strictEqual(result.provider, "gemini");
  assert.strictEqual(result.model, "gemini-2.0-flash");
  assert.strictEqual(result.warning, null);
  assert.strictEqual(result.analysis.category, "Medical Assistance");
  assert.strictEqual(result.analysis.priority, "Critical");
  assert.strictEqual(result.analysis.peopleAffected, 2);
});

test("falls back to keyword triage when Gemini throws", async () => {
  const analyzer = loadAnalyzerWith({
    isConfigured: () => true,
    generateJSON: async () => {
      throw new Error("503 model overloaded");
    },
  });

  const result = await analyzer.analyzeEmergency(GOLDEN);

  assert.strictEqual(result.provider, "keyword");
  assert.ok(result.warning, "a warning must be surfaced to the victim");
  // The emergency is still fully actionable.
  assert.strictEqual(result.analysis.category, "Medical Assistance");
  assert.strictEqual(result.analysis.priority, "Critical");
  assert.ok(result.analysis.needs.length > 0);
});

test("falls back when Gemini returns a shape that fails validation", async () => {
  const analyzer = loadAnalyzerWith({
    isConfigured: () => true,
    generateJSON: async () => ({ model: "gemini-2.0-flash", data: { category: "banana" } }),
  });

  const result = await analyzer.analyzeEmergency(GOLDEN);

  assert.strictEqual(result.provider, "keyword");
  assert.strictEqual(result.analysis.priority, "Critical");
});

test("falls back when Gemini is not configured at all", async () => {
  const analyzer = loadAnalyzerWith({
    isConfigured: () => false,
    generateJSON: async () => {
      throw new Error("should not be called");
    },
  });

  const result = await analyzer.analyzeEmergency(GOLDEN);
  assert.strictEqual(result.provider, "keyword");
  assert.ok(result.warning);
});

test("the victim's original wording is always preserved", async () => {
  for (const stub of [
    { isConfigured: () => true, generateJSON: async () => ({ model: "m", data: { category: "medical", priority: "critical", summary: "Rewritten by AI.", needs: [] } }) },
    { isConfigured: () => false, generateJSON: async () => { throw new Error("x"); } },
  ]) {
    const analyzer = loadAnalyzerWith(stub);
    const result = await analyzer.analyzeEmergency(GOLDEN);
    assert.strictEqual(result.originalText, GOLDEN);
  }
});

test("never throws, even on empty input", async () => {
  const analyzer = loadAnalyzerWith({
    isConfigured: () => true,
    generateJSON: async () => { throw new Error("boom"); },
  });

  for (const input of ["", "   ", null, undefined]) {
    const result = await analyzer.analyzeEmergency(input);
    assert.ok(result.analysis, "an analysis object is always returned");
    assert.strictEqual(result.provider, "keyword");
  }
});

test("a Spanish message keeps its detected language and English summary", async () => {
  const analyzer = loadAnalyzerWith({
    isConfigured: () => true,
    generateJSON: async () => ({
      model: "gemini-2.0-flash",
      data: {
        category: "medical",
        priority: "critical",
        summary: "Una persona sangra mucho y no puede caminar.",
        needs: ["first aid"],
        detectedLanguage: "es",
        responderSummary: "A person is bleeding heavily and cannot walk.",
      },
    }),
  });

  const result = await analyzer.analyzeEmergency("Mi amigo esta sangrando mucho y no puede caminar.");
  assert.strictEqual(result.analysis.detectedLanguage, "es");
  assert.strictEqual(result.analysis.responderSummary, "A person is bleeding heavily and cannot walk.");
});
