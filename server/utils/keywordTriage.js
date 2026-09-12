// server/utils/keywordTriage.js
// Deterministic, dependency-free triage of a free-text emergency message.
//
// This is the fallback path used whenever Gemini is unavailable or returns
// something we can't validate. It is intentionally offline and synchronous so
// that an SOS is never blocked on an external API.
//
// The logic here was previously inlined in HelpRequestModel.js; it lives here
// so the model and the AI analyzer share one implementation instead of two.

// Categories double as HelpRequest.natureOfHelp values. The dashboard renders
// these strings directly, so treat them as a stable enum.
const CATEGORIES = {
  MEDICAL: "Medical Assistance",
  FOOD_WATER: "Food & Water",
  SHELTER: "Shelter Needed",
  TRANSPORT: "Transportation",
  RESCUE: "Emergency Rescue",
  COMMUNICATION: "Communication",
};

const PRIORITIES = ["Critical", "High", "Normal"];

// Extracts the key help type from a message.
function summarizeHelpRequest(message) {
  const lowerMessage = message.toLowerCase();

  if (lowerMessage.match(/\b(medical|doctor|hospital|injured|wound|bleeding|medicine|medication|health|sick|ill|pain)\b/)) {
    return CATEGORIES.MEDICAL;
  }

  if (lowerMessage.match(/\b(food|water|hungry|thirsty|starving|drink|eat|meal|supplies)\b/)) {
    return CATEGORIES.FOOD_WATER;
  }

  if (lowerMessage.match(/\b(shelter|home|house|place to stay|roof|safe|warm|cold|exposed)\b/)) {
    return CATEGORIES.SHELTER;
  }

  if (lowerMessage.match(/\b(transport|ride|car|vehicle|stuck|stranded|need to get|cannot move)\b/)) {
    return CATEGORIES.TRANSPORT;
  }

  if (lowerMessage.match(/\b(emergency|help|rescue|stuck|trapped|danger|urgent|immediate)\b/)) {
    return CATEGORIES.RESCUE;
  }

  if (lowerMessage.match(/\b(contact|call|phone|communication|message|reach|connect)\b/)) {
    return CATEGORIES.COMMUNICATION;
  }

  const words = message.split(/\s+/).slice(0, 4).join(" ");
  return words.length > 30 ? words.substring(0, 27) + "..." : words;
}

// Scores urgency signals in a message and buckets them into a priority.
function analyzePriority(message) {
  const lowerMessage = message.toLowerCase();
  let criticalScore = 0;

  const criticalKeywords = [
    /\b(urgent|immediate|asap|emergency|critical|life|death|dying|bleeding|unconscious|can't breathe|can't move|trapped|stuck|danger|dangerous|help now|please help|need help now)\b/gi,
    /\b(heart attack|stroke|seizure|choking|asthma|allergic reaction|overdose|poisoning)\b/gi,
    /\b(fire|flood|earthquake|building collapse|explosion|accident|crash)\b/gi,
  ];

  criticalKeywords.forEach((pattern) => {
    const matches = lowerMessage.match(pattern);
    if (matches) {
      criticalScore += matches.length * 3;
    }
  });

  const moderateKeywords = [
    /\b(injured|hurt|pain|sick|ill|fever|broken|fracture|cut|wound)\b/gi,
    /\b(stranded|stuck|lost|can't find|need to get|trapped)\b/gi,
    /\b(no food|no water|hungry|thirsty|starving|dehydrated)\b/gi,
  ];

  moderateKeywords.forEach((pattern) => {
    const matches = lowerMessage.match(pattern);
    if (matches) {
      criticalScore += matches.length * 2;
    }
  });

  const exclamationCount = (message.match(/!/g) || []).length;
  criticalScore += exclamationCount;

  const urgencyPhrases = [
    /\b(as soon as possible|right now|immediately|right away)\b/gi,
    /\b(please|please help|anyone|anybody|someone|somebody)\b/gi,
  ];

  urgencyPhrases.forEach((pattern) => {
    const matches = lowerMessage.match(pattern);
    if (matches) {
      criticalScore += matches.length * 1;
    }
  });

  if (criticalScore >= 5) {
    return "Critical";
  } else if (criticalScore >= 2) {
    return "High";
  } else {
    return "Normal";
  }
}

// Best-effort extraction of how many people are involved, for the fallback
// path only. Returns null when the message gives us nothing to go on, which is
// honest: we would rather show nothing than invent a headcount.
const NUMBER_WORDS = {
  one: 1, two: 2, three: 3, four: 4, five: 5,
  six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
};

function estimatePeopleAffected(message) {
  const lower = message.toLowerCase();

  const digitMatch = lower.match(/\b(\d{1,3})\s+(?:people|persons?|passengers|victims|adults|children|kids)\b/);
  if (digitMatch) {
    const n = parseInt(digitMatch[1], 10);
    if (n > 0 && n <= 999) return n;
  }

  const wordMatch = lower.match(/\b(one|two|three|four|five|six|seven|eight|nine|ten)\s+(?:people|persons?|passengers|victims|adults|children|kids)\b/);
  if (wordMatch) {
    return NUMBER_WORDS[wordMatch[1]];
  }

  return null;
}

// Derives a short list of needs from the message. Descriptive only: these are
// restatements of what the victim said, never a diagnosis or treatment plan.
const NEED_RULES = [
  // Ordered most-urgent-first; the responder card shows these in order.
  { pattern: /\b(bleed|blood|hemorrhag|injur|hurt|wound|cut|broken|fracture|burn|unconscious)/i, need: "first aid" },
  { pattern: /\b(bleed|blood|hemorrhag)/i, need: "bleeding assistance" },
  { pattern: /\b(breath|choking|asthma|suffocat)/i, need: "breathing difficulty reported" },
  { pattern: /\b(can't walk|cannot walk|can't move|cannot move|immobile|trapped|pinned|crushed)/i, need: "mobility assistance" },
  { pattern: /\b(water|thirsty|dehydrat)/i, need: "drinking water" },
  { pattern: /\b(food|hungry|starving)/i, need: "food" },
  { pattern: /\b(shelter|roof|nowhere to stay|exposed)/i, need: "shelter" },
  // Deliberately does not match a bare "car"/"vehicle": a vehicle accident is
  // a medical call, not a request for a ride.
  { pattern: /\b(transport|need a ride|stranded|evacuat)/i, need: "transportation" },
  { pattern: /\b(fire|smoke|burning)/i, need: "fire response" },
  { pattern: /\b(unsafe|threat|attack|violence|danger)/i, need: "safety escort" },
];

function extractNeeds(message) {
  const needs = [];
  for (const rule of NEED_RULES) {
    if (rule.pattern.test(message) && !needs.includes(rule.need)) {
      needs.push(rule.need);
    }
  }
  return needs;
}

// Full offline analysis in the same shape the Gemini path produces, so callers
// can treat the two interchangeably.
function analyzeWithKeywords(message) {
  const text = String(message || "");
  return {
    category: summarizeHelpRequest(text),
    priority: analyzePriority(text),
    summary: text.length > 180 ? text.slice(0, 177) + "..." : text,
    peopleAffected: estimatePeopleAffected(text),
    needs: extractNeeds(text),
  };
}

module.exports = {
  CATEGORIES,
  PRIORITIES,
  summarizeHelpRequest,
  analyzePriority,
  estimatePeopleAffected,
  extractNeeds,
  analyzeWithKeywords,
};
