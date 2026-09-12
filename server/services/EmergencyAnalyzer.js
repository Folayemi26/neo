// server/services/EmergencyAnalyzer.js
// Turns a free-text emergency description into structured, actionable fields.
//
// This is the core intelligence step: a victim describes what happened in
// their own words, and a responder needs category, urgency, headcount and
// concrete needs at a glance.
//
// Contract: analyzeEmergency() NEVER throws and NEVER returns null. If Gemini
// is unconfigured, unreachable, slow, or returns something that fails
// validation, it falls back to offline keyword triage and reports that in the
// `provider` field. An SOS must not be blocked by an AI outage.

const geminiClient = require("./geminiClient");
const { SchemaType } = geminiClient;
const { analyzeWithKeywords, CATEGORIES } = require("../utils/keywordTriage");
const { validateAnalysis, CATEGORY_LIST, PRIORITIES } = require("../utils/emergencySchema");

const FALLBACK_WARNING =
  "AI analysis unavailable. Your original emergency message will still be sent.";

// Native structured-output schema. Values are still re-validated on the way
// out: a schema constrains shape, not truthfulness.
const RESPONSE_SCHEMA = {
  type: SchemaType.OBJECT,
  properties: {
    category: {
      type: SchemaType.STRING,
      description: `The single best fit from exactly this list: ${CATEGORY_LIST.join(" | ")}`,
    },
    priority: {
      type: SchemaType.STRING,
      description: `Exactly one of: ${PRIORITIES.join(" | ")}`,
    },
    summary: {
      type: SchemaType.STRING,
      description:
        "One or two plain sentences a responder can read at a glance, describing only what was reported.",
    },
    peopleAffected: {
      type: SchemaType.INTEGER,
      description: "How many people are involved. Null if the message does not say or imply a number.",
      nullable: true,
    },
    needs: {
      type: SchemaType.ARRAY,
      description: "Short lowercase noun phrases naming the concrete assistance required.",
      items: { type: SchemaType.STRING },
    },
    detectedLanguage: {
      type: SchemaType.STRING,
      description: "BCP-47 language code of the victim's message, e.g. 'en', 'es'.",
      nullable: true,
    },
    responderSummary: {
      type: SchemaType.STRING,
      description:
        "The summary in English. Only meaningful when the victim did not write in English.",
      nullable: true,
    },
  },
  required: ["category", "priority", "summary", "needs"],
};

function buildPrompt(message) {
  return `You are the triage layer of an emergency dispatch system. A person in
distress has described their situation. Convert it into structured data a
first responder can act on in seconds.

Victim's message:
"""
${message}
"""

Rules:
- Report only what the message states or plainly implies. Never invent details.
- You are NOT a clinician. Do not diagnose. Write "severe bleeding reported",
  never "the patient has internal bleeding". Describe, do not conclude.
- category: choose the single best fit from exactly this list:
  ${CATEGORY_LIST.join(" | ")}
- priority: exactly one of ${PRIORITIES.join(" | ")}.
  Critical means a life may be at immediate risk.
- peopleAffected: count the people involved, including the speaker when they
  are part of the emergency. Use null if the message gives no basis for a count.
- needs: 1 to 5 short lowercase noun phrases naming concrete assistance,
  for example "first aid", "bleeding assistance", "mobility assistance".
- detectedLanguage: the BCP-47 code of the language the message is written in.
- responderSummary: if that language is not English, put an English version of
  the summary here. Otherwise null.

Return JSON only.`;
}

/**
 * @param {string} message  the victim's own words
 * @returns {Promise<{
 *   analysis: object,
 *   provider: "gemini"|"keyword",
 *   model: string|null,
 *   warning: string|null,
 *   originalText: string
 * }>}
 */
async function analyzeEmergency(message) {
  const originalText = String(message || "").trim();

  const fallback = (warning) => ({
    analysis: { ...analyzeWithKeywords(originalText), detectedLanguage: null, responderSummary: null },
    provider: "keyword",
    model: null,
    warning,
    originalText,
  });

  if (!originalText) {
    return fallback("No emergency description was provided.");
  }

  if (!geminiClient.isConfigured()) {
    console.warn("[Neo][EmergencyAnalyzer] ⚠️ Gemini not configured, using keyword triage");
    return fallback(FALLBACK_WARNING);
  }

  try {
    const { data, model } = await geminiClient.generateJSON(buildPrompt(originalText), {
      schema: RESPONSE_SCHEMA,
    });

    const { ok, value, errors } = validateAnalysis(data);
    if (!ok) {
      console.warn(`[Neo][EmergencyAnalyzer] ⚠️ Gemini output rejected: ${errors.join("; ")}`);
      return fallback(FALLBACK_WARNING);
    }

    console.log(
      `[Neo][EmergencyAnalyzer] ✅ ${model}: ${value.category} / ${value.priority}`
    );
    return { analysis: value, provider: "gemini", model, warning: null, originalText };
  } catch (error) {
    console.warn(`[Neo][EmergencyAnalyzer] ⚠️ Gemini failed: ${error.message}`);
    return fallback(FALLBACK_WARNING);
  }
}

module.exports = {
  analyzeEmergency,
  buildPrompt,
  RESPONSE_SCHEMA,
  FALLBACK_WARNING,
  CATEGORIES,
};
