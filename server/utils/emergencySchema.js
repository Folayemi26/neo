// server/utils/emergencySchema.js
// Validation and normalization for structured emergency analysis.
//
// Model output is never trusted directly. Everything that reaches a responder
// passes through validateAnalysis() first, which coerces loose values onto the
// project's existing enums and rejects anything it cannot make sense of.
//
// Hand-rolled on purpose: the repo carries no validation library, and adding
// one for a single schema would not pay for itself.

const { CATEGORIES, PRIORITIES } = require("./keywordTriage");

const CATEGORY_LIST = Object.values(CATEGORIES);

const MAX_SUMMARY_LENGTH = 400;
const MAX_NEEDS = 6;
const MAX_NEED_LENGTH = 80;
const MAX_PEOPLE_AFFECTED = 1000;

// Maps the many ways a model might name a category onto our enum.
const CATEGORY_ALIASES = [
  { match: /medical|medic|injur|health|doctor|hospital|first.?aid|trauma/i, value: CATEGORIES.MEDICAL },
  { match: /food|water|hunger|thirst|nutrition|supplies/i, value: CATEGORIES.FOOD_WATER },
  { match: /shelter|housing|roof|refuge|accommodation/i, value: CATEGORIES.SHELTER },
  { match: /transport|evacuat|ride|vehicle.?need|mobility.?transport/i, value: CATEGORIES.TRANSPORT },
  { match: /rescue|trapped|search|extract|fire|flood|collapse|emergency/i, value: CATEGORIES.RESCUE },
  { match: /communicat|contact|message|signal/i, value: CATEGORIES.COMMUNICATION },
];

const PRIORITY_ALIASES = [
  { match: /critical|severe|life.?threat|immediate|extreme|urgent|emergency|p0|high(est)?/i, value: "Critical" },
  { match: /high|serious|moderate|medium|p1/i, value: "High" },
  { match: /normal|low|minor|routine|standard|p2|p3/i, value: "Normal" },
];

function isNonEmptyString(v) {
  return typeof v === "string" && v.trim().length > 0;
}

// Returns a canonical category, or null when the input maps to nothing.
function normalizeCategory(raw) {
  if (!isNonEmptyString(raw)) return null;
  const value = raw.trim();

  const exact = CATEGORY_LIST.find((c) => c.toLowerCase() === value.toLowerCase());
  if (exact) return exact;

  for (const alias of CATEGORY_ALIASES) {
    if (alias.match.test(value)) return alias.value;
  }
  return null;
}

// Returns a canonical priority, or null when the input maps to nothing.
// Order matters: "critical" is checked before "high" so that a value like
// "highest" does not land on High.
function normalizePriority(raw) {
  if (!isNonEmptyString(raw)) return null;
  const value = raw.trim();

  const exact = PRIORITIES.find((p) => p.toLowerCase() === value.toLowerCase());
  if (exact) return exact;

  for (const alias of PRIORITY_ALIASES) {
    if (alias.match.test(value)) return alias.value;
  }
  return null;
}

// Accepts numbers or numeric strings; anything out of range becomes null
// rather than a guess.
function normalizePeopleAffected(raw) {
  if (raw === null || raw === undefined || raw === "") return null;
  const n = typeof raw === "number" ? raw : Number(String(raw).trim());
  if (!Number.isFinite(n)) return null;
  const rounded = Math.round(n);
  if (rounded < 1 || rounded > MAX_PEOPLE_AFFECTED) return null;
  return rounded;
}

// Trims, de-duplicates (case-insensitively) and caps the needs list.
function normalizeNeeds(raw) {
  if (!Array.isArray(raw)) return [];
  const seen = new Set();
  const out = [];

  for (const entry of raw) {
    if (!isNonEmptyString(entry)) continue;
    let need = entry.trim().replace(/\s+/g, " ");
    if (need.length > MAX_NEED_LENGTH) need = need.slice(0, MAX_NEED_LENGTH - 3) + "...";
    const key = need.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(need);
    if (out.length >= MAX_NEEDS) break;
  }
  return out;
}

function normalizeLanguage(raw) {
  if (!isNonEmptyString(raw)) return null;
  const value = raw.trim().toLowerCase();
  // Accept BCP-47-ish tags only ("en", "es", "pt-br"); reject prose.
  return /^[a-z]{2,3}(-[a-z0-9]{2,8})?$/.test(value) ? value : null;
}

/**
 * Validates a candidate analysis object.
 *
 * category, priority and summary are required: without them a responder has
 * nothing actionable, so a result missing any of them is rejected and the
 * caller falls back to keyword triage. peopleAffected, needs, detectedLanguage
 * and responderSummary are optional and degrade to null/[] individually.
 *
 * @returns {{ok: boolean, value: object|null, errors: string[]}}
 */
function validateAnalysis(candidate) {
  const errors = [];

  if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) {
    return { ok: false, value: null, errors: ["analysis is not an object"] };
  }

  const category = normalizeCategory(candidate.category);
  if (!category) errors.push(`category is missing or unrecognized: ${JSON.stringify(candidate.category)}`);

  const priority = normalizePriority(candidate.priority);
  if (!priority) errors.push(`priority is missing or unrecognized: ${JSON.stringify(candidate.priority)}`);

  let summary = null;
  if (!isNonEmptyString(candidate.summary)) {
    errors.push("summary is missing or empty");
  } else {
    summary = candidate.summary.trim().replace(/\s+/g, " ");
    if (summary.length > MAX_SUMMARY_LENGTH) {
      summary = summary.slice(0, MAX_SUMMARY_LENGTH - 3) + "...";
    }
  }

  if (errors.length > 0) {
    return { ok: false, value: null, errors };
  }

  const responderSummary = isNonEmptyString(candidate.responderSummary)
    ? candidate.responderSummary.trim().replace(/\s+/g, " ").slice(0, MAX_SUMMARY_LENGTH)
    : null;

  return {
    ok: true,
    errors: [],
    value: {
      category,
      priority,
      summary,
      peopleAffected: normalizePeopleAffected(candidate.peopleAffected),
      needs: normalizeNeeds(candidate.needs),
      detectedLanguage: normalizeLanguage(candidate.detectedLanguage),
      responderSummary,
    },
  };
}

module.exports = {
  CATEGORY_LIST,
  PRIORITIES,
  MAX_SUMMARY_LENGTH,
  MAX_NEEDS,
  normalizeCategory,
  normalizePriority,
  normalizePeopleAffected,
  normalizeNeeds,
  normalizeLanguage,
  validateAnalysis,
};
