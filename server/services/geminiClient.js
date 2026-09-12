// server/services/geminiClient.js
// The one and only Gemini client in this codebase.
//
// Everything that talks to Gemini goes through here so there is a single place
// that owns the API key, model selection and failure handling.
//
// Why this module exists at all: the previous code picked its model with
//
//     try { model = genai.getGenerativeModel({ model: "gemini-pro" }) }
//     catch { ...try other models... }
//
// which can never work. getGenerativeModel() only builds a local object; it
// does not contact the API and does not throw on an unknown model name. The
// catch block was dead code, so a retired model name failed later, during
// generateContent(), and silently fell through to keyword triage.
//
// The fix is to validate a model by actually calling it and to remember the
// first one that answers.

const { GoogleGenerativeAI, SchemaType } = require("@google/generative-ai");

// The floating "-latest" alias goes first on purpose: Google retires model
// names on its own schedule, and a pinned name silently rotting is exactly how
// this integration broke before. The two concrete names behind it are verified
// fallbacks in case the alias itself ever stops resolving.
//
// Verified against the live API on 2026-09-12. Note that ListModels advertises
// models a given key cannot actually call (gemini-2.5-flash lists but returns
// "no longer available to new users"), so this list reflects what answered a
// real generateContent call, not what ListModels reported.
const DEFAULT_MODEL_CANDIDATES = [
  "gemini-flash-latest",
  "gemini-3.8-flash",
  "gemini-3.5-flash",
];

const DEFAULT_TIMEOUT_MS = 12000;

let client = null;
// The first model that actually returned a response; tried first next time.
let knownGoodModel = null;

function getApiKey() {
  return process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || null;
}

function isConfigured() {
  return Boolean(getApiKey());
}

function getClient() {
  const apiKey = getApiKey();
  if (!apiKey) return null;
  if (!client) client = new GoogleGenerativeAI(apiKey);
  return client;
}

function getTimeoutMs() {
  const raw = parseInt(process.env.GEMINI_TIMEOUT_MS, 10);
  return Number.isFinite(raw) && raw > 0 ? raw : DEFAULT_TIMEOUT_MS;
}

// GEMINI_MODEL pins a specific model; otherwise walk the default ladder.
function modelCandidates() {
  const pinned = (process.env.GEMINI_MODEL || "").trim();
  const ordered = [];
  if (knownGoodModel) ordered.push(knownGoodModel);
  if (pinned) ordered.push(pinned);
  ordered.push(...DEFAULT_MODEL_CANDIDATES);
  return [...new Set(ordered)];
}

// An emergency must never hang on a slow API. The underlying request is not
// cancellable through this SDK, so we stop waiting rather than stop the call.
function withTimeout(promise, ms, label) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

/**
 * Calls Gemini, walking the model ladder until one responds.
 *
 * @param {string|Array} parts  prompt string, or SDK parts array (text, audio)
 * @param {object} generationConfig  passed through to the SDK
 * @returns {Promise<{text: string, model: string}>}
 * @throws when no model answers, or Gemini is not configured
 */
async function generateContent(parts, generationConfig = {}) {
  const genai = getClient();
  if (!genai) {
    throw new Error("Gemini is not configured (set GEMINI_API_KEY)");
  }

  const attempts = [];

  for (const modelName of modelCandidates()) {
    try {
      const model = genai.getGenerativeModel({ model: modelName, generationConfig });
      const result = await withTimeout(
        model.generateContent(parts),
        getTimeoutMs(),
        `Gemini (${modelName})`
      );
      const text = result.response.text();

      if (knownGoodModel !== modelName) {
        knownGoodModel = modelName;
        console.log(`[Neo][geminiClient] ✅ Using model: ${modelName}`);
      }
      return { text, model: modelName };
    } catch (error) {
      attempts.push(`${modelName}: ${error.message}`);
      // This model is unavailable to this key; stop trusting it as known-good.
      if (knownGoodModel === modelName) knownGoodModel = null;
      console.warn(`[Neo][geminiClient] ⚠️ ${modelName} failed: ${error.message}`);
    }
  }

  throw new Error(`All Gemini models failed. Attempts: ${attempts.join(" | ")}`);
}

// Strips markdown fences and pulls out the first JSON object, so a model that
// ignores responseMimeType still parses.
function parseJsonLoosely(text) {
  const cleaned = String(text || "")
    .replace(/```json/gi, "")
    .replace(/```/g, "")
    .trim();

  try {
    return JSON.parse(cleaned);
  } catch (_) {
    const start = cleaned.indexOf("{");
    const end = cleaned.lastIndexOf("}");
    if (start !== -1 && end > start) {
      return JSON.parse(cleaned.slice(start, end + 1));
    }
    throw new Error(`Gemini did not return parseable JSON: ${cleaned.slice(0, 200)}`);
  }
}

/**
 * Calls Gemini and returns parsed JSON, using the SDK's native structured
 * output when a schema is supplied.
 *
 * @returns {Promise<{data: object, model: string}>}
 */
async function generateJSON(parts, { schema, temperature = 0.2 } = {}) {
  const generationConfig = { temperature, responseMimeType: "application/json" };
  if (schema) generationConfig.responseSchema = schema;

  const { text, model } = await generateContent(parts, generationConfig);
  return { data: parseJsonLoosely(text), model };
}

// Exposed for tests, which need a clean slate between cases.
function _resetForTests() {
  client = null;
  knownGoodModel = null;
}

module.exports = {
  SchemaType,
  DEFAULT_MODEL_CANDIDATES,
  isConfigured,
  generateContent,
  generateJSON,
  parseJsonLoosely,
  _resetForTests,
};
