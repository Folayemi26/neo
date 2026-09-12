// server/controllers/MedAIController.js
// AI processing for emergency triage.
//
// Two responsibilities:
//   processText/processAudio - the original routing decision
//                              (hospital | police | safeplace)
//   analyzeEmergency         - structured emergency extraction for responders
//
// All Gemini access goes through services/geminiClient so there is exactly one
// client, one key lookup and one model-fallback path in the codebase.

const geminiClient = require("../services/geminiClient");
const { SchemaType } = geminiClient;
const EmergencyAnalyzer = require("../services/EmergencyAnalyzer");

if (!geminiClient.isConfigured()) {
  console.warn("[Neo][MedAIController] ⚠️ GEMINI_API_KEY not set; keyword fallback will be used");
}

// Normalize a routing recommendation to one of the three supported values.
function normalizeRecommendation(recommendation) {
  const normalized = String(recommendation || "")
    .toLowerCase()
    .replace(/-/g, "")
    .replace(/\s/g, "")
    .replace("_", "");

  if (
    normalized.includes("hospital") || normalized.includes("medical") ||
    normalized.includes("doctor") || normalized.includes("bleeding") ||
    normalized.includes("injured")
  ) {
    return "hospital";
  } else if (
    normalized.includes("police") || normalized.includes("911") ||
    normalized.includes("emergency") || normalized.includes("crime") ||
    normalized.includes("danger")
  ) {
    return "police";
  } else if (
    normalized.includes("safe") || normalized.includes("place") ||
    normalized.includes("shelter")
  ) {
    return "safeplace";
  }
  return "hospital";
}

// Offline routing fallback, used whenever Gemini is unavailable.
function analyzeWithKeywords(message) {
  const lowerMessage = String(message || "").toLowerCase();

  const medicalKeywords = ["bleeding", "bleed", "injured", "injury", "hurt", "pain", "medical", "doctor", "hospital", "ambulance", "sick", "ill", "wound", "cut", "broken", "fracture"];
  const policeKeywords = ["police", "911", "crime", "criminal", "danger", "dangerous", "threat", "attack", "robbery", "stolen", "emergency", "help", "unsafe"];
  const safePlaceKeywords = ["safe", "shelter", "place", "stay", "housing", "accommodation", "refuge", "protection"];

  const medicalCount = medicalKeywords.filter((kw) => lowerMessage.includes(kw)).length;
  const policeCount = policeKeywords.filter((kw) => lowerMessage.includes(kw)).length;
  const safeCount = safePlaceKeywords.filter((kw) => lowerMessage.includes(kw)).length;

  if (medicalCount > policeCount && medicalCount > safeCount) {
    return "hospital";
  } else if (policeCount > safeCount) {
    return "police";
  } else if (safeCount > 0) {
    return "safeplace";
  }

  if (lowerMessage.includes("urgent") || lowerMessage.includes("emergency") || lowerMessage.includes("help")) {
    return "hospital";
  }

  return "hospital";
}

const RECOMMENDATION_SCHEMA = {
  type: SchemaType.OBJECT,
  properties: {
    recommendation: {
      type: SchemaType.STRING,
      description: "Exactly one of: hospital | police | safeplace",
    },
  },
  required: ["recommendation"],
};

const ROUTING_RULES = `Determine what type of help is needed:
- "hospital" - medical emergencies (bleeding, injuries, medical help needed)
- "police" - police assistance, crimes, security issues
- "safeplace" - shelters, safe places to stay, non-urgent safety needs`;

// POST /api/medai/process_text
async function processText(req, res) {
  try {
    const { message } = req.body;

    if (!message || !message.trim()) {
      return res.status(400).json({
        error: "Missing message",
        message: "Please provide a message describing the situation",
      });
    }

    let recommendation;

    try {
      const { data } = await geminiClient.generateJSON(
        `Analyze this emergency situation: "${message}"\n\n${ROUTING_RULES}`,
        { schema: RECOMMENDATION_SCHEMA }
      );
      recommendation = normalizeRecommendation(data.recommendation);
      console.log("[Neo][MedAIController] ✅ AI processed:", recommendation);
    } catch (aiError) {
      console.warn("[Neo][MedAIController] ⚠️ AI unavailable, keyword fallback:", aiError.message);
      recommendation = analyzeWithKeywords(message);
    }

    res.json({
      recommendation,
      needs911: recommendation === "police",
    });
  } catch (error) {
    console.error("[Neo][MedAIController] ❌ Error processing text:", error);
    const fallbackRecommendation = analyzeWithKeywords(req.body && req.body.message);
    res.json({
      recommendation: fallbackRecommendation,
      needs911: fallbackRecommendation === "police",
    });
  }
}

// POST /api/medai/process_audio
async function processAudio(req, res) {
  try {
    if (!req.file) {
      return res.status(400).json({
        error: "No audio file",
        message: "Please provide an audio file",
      });
    }

    let recommendation = "hospital";

    try {
      const audioData = {
        inlineData: {
          data: req.file.buffer.toString("base64"),
          mimeType: req.file.mimetype || "audio/webm",
        },
      };

      const { data } = await geminiClient.generateJSON(
        [audioData, `Listen carefully to this audio from someone in an emergency.\n\n${ROUTING_RULES}`],
        { schema: RECOMMENDATION_SCHEMA }
      );
      recommendation = normalizeRecommendation(data.recommendation);
      console.log("[Neo][MedAIController] ✅ Audio processed:", recommendation);
    } catch (aiError) {
      // Audio triage has no offline equivalent, so default to the safest
      // routing rather than failing the request.
      console.warn("[Neo][MedAIController] ⚠️ Audio processing failed, defaulting:", aiError.message);
      recommendation = "hospital";
    }

    res.json({
      recommendation,
      needs911: recommendation === "police",
    });
  } catch (error) {
    console.error("[Neo][MedAIController] ❌ Error processing audio:", error);
    res.json({ recommendation: "hospital", needs911: false });
  }
}

// POST /api/medai/analyze
// Structured emergency extraction. Always 200 with a usable analysis: when
// Gemini is down the body carries keyword-derived fields plus a warning, so
// the victim can still send their SOS.
async function analyzeEmergency(req, res) {
  try {
    const { message } = req.body;

    if (!message || !String(message).trim()) {
      return res.status(400).json({
        error: "Missing message",
        message: "Please provide a message describing the emergency",
      });
    }

    const result = await EmergencyAnalyzer.analyzeEmergency(message);

    res.json({
      success: true,
      provider: result.provider,
      model: result.model,
      warning: result.warning,
      originalText: result.originalText,
      analysis: result.analysis,
    });
  } catch (error) {
    // analyzeEmergency() is contractually non-throwing; this is belt and braces.
    console.error("[Neo][MedAIController] ❌ Analyze error:", error);
    res.status(500).json({
      error: "Failed to analyze emergency",
      message: error.message,
    });
  }
}

module.exports = {
  processText,
  processAudio,
  analyzeEmergency,
};
