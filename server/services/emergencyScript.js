// server/services/emergencyScript.js
// Turns a stored emergency into a short spoken alert.
//
// Deterministic application logic, not another model call: the structured
// fields are already there, so composing a sentence from them costs nothing
// and cannot fail or hallucinate. It also means the script is unit-testable
// and identical every time, which matters for a live demo.
//
// Target length is roughly 5 to 12 seconds. A responder listening to this has
// their hands full; a 45-second paragraph would be worse than useless.
//
// Wording stays descriptive. "Severe bleeding has been reported", never "the
// patient is haemorrhaging": this is a relay of what someone said, not a
// clinical assessment.

const ONES = [
  "zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine",
  "ten", "eleven", "twelve", "thirteen", "fourteen", "fifteen", "sixteen",
  "seventeen", "eighteen", "nineteen",
];
const TENS = ["", "", "twenty", "thirty", "forty", "fifty", "sixty", "seventy", "eighty", "ninety"];

// Spelled-out numbers read more reliably than digits through text-to-speech.
function numberToWords(n) {
  const value = Math.round(Number(n));
  if (!Number.isFinite(value) || value < 0) return String(n);
  if (value < 20) return ONES[value];
  if (value < 100) {
    const rest = value % 10;
    return TENS[Math.floor(value / 10)] + (rest ? `-${ONES[rest]}` : "");
  }
  return String(value);
}

// "0.4" -> "zero point four", so the distance is spoken rather than spelled.
function distanceToWords(miles) {
  if (miles == null || !Number.isFinite(Number(miles))) return null;
  const fixed = Number(miles).toFixed(1);
  const [whole, decimal] = fixed.split(".");
  const wholeWords = numberToWords(parseInt(whole, 10));
  if (decimal === "0") return wholeWords;
  return `${wholeWords} point ${ONES[parseInt(decimal, 10)]}`;
}

// Categories are stored as UI labels ("Medical Assistance"); spoken aloud they
// want to be adjectives ("critical medical emergency").
const SPOKEN_CATEGORY = {
  "Medical Assistance": "medical emergency",
  "Food & Water": "request for food and water",
  "Shelter Needed": "request for shelter",
  "Transportation": "transportation emergency",
  "Emergency Rescue": "rescue emergency",
  "Communication": "request for communication",
};

function spokenCategory(category) {
  return SPOKEN_CATEGORY[category] || "emergency";
}

// Joins a list the way a person would say it.
function spokenList(items) {
  const list = items.filter(Boolean);
  if (list.length === 0) return "";
  if (list.length === 1) return list[0];
  return `${list.slice(0, -1).join(", ")} and ${list[list.length - 1]}`;
}

/**
 * Builds the spoken alert for a help request.
 *
 * Every clause is optional except the opening line, so a sparse request still
 * produces a sentence worth hearing.
 *
 * @param {object} request  a stored help request
 * @returns {string}
 */
function buildEmergencyScript(request) {
  if (!request) return "An emergency has been reported.";

  const ai = request.ai || {};
  const priority = request.priority || ai.priority || "";
  const category = request.natureOfHelp || ai.category || "";
  const sentences = [];

  // 1. What and how urgent.
  const urgency = priority && priority.toLowerCase() !== "normal" ? `${priority.toLowerCase()} ` : "";
  sentences.push(`${urgency}${spokenCategory(category)}.`);

  // 2. How many people.
  const people = ai.peopleAffected;
  if (people != null && Number.isFinite(Number(people))) {
    const n = Math.round(Number(people));
    sentences.push(n === 1 ? "One person is involved." : `${numberToWords(n)} people are involved.`);
  }

  // 3. What they need. Capped at three so the alert stays short.
  const needs = Array.isArray(ai.needs) ? ai.needs.slice(0, 3) : [];
  if (needs.length > 0) {
    sentences.push(`Reported needs: ${spokenList(needs)}.`);
  }

  // 4. How far away.
  const distance = distanceToWords(request.distanceMiles);
  if (distance) {
    sentences.push(`The emergency is approximately ${distance} miles away.`);
  }

  // Each clause is spoken as its own sentence, so each gets a capital.
  return sentences
    .map((sentence) => sentence.charAt(0).toUpperCase() + sentence.slice(1))
    .join(" ");
}

// Rough spoken duration, used to keep the alert inside its budget.
function estimateSeconds(script) {
  const words = String(script || "").trim().split(/\s+/).filter(Boolean).length;
  return words / 2.5; // ~150 words per minute
}

module.exports = {
  buildEmergencyScript,
  estimateSeconds,
  numberToWords,
  distanceToWords,
  spokenCategory,
  spokenList,
};
