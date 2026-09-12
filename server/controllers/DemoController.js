// server/controllers/DemoController.js
// HTTP surface for the one-laptop demo: send an emergency through the
// simulated relay, follow its progress, and reset between runs.

const DemoTransport = require("../services/DemoTransport");
const HelpRequestModel = require("../models/HelpRequestModel");
const EmergencyAnalyzer = require("../services/EmergencyAnalyzer");
const { DEMO_LOCATION, DEMO_RESPONDER, buildDemoResponder } = require("../fixtures/demoFixtures");

// POST /api/demo/emergencies
// Body: { message, analysis?, latitude?, longitude?, address? }
//
// analysis is normally supplied by the victim UI, which has already called
// /api/medai/analyze and shown the victim what it found. When it is absent we
// analyze here so an SOS is still sendable, and so this endpoint is usable on
// its own.
async function sendEmergency(req, res) {
  try {
    const { message, analysis, latitude, longitude, address } = req.body || {};

    if (!message || !String(message).trim()) {
      return res.status(400).json({
        error: "Missing message",
        message: "An emergency description is required",
      });
    }

    let ai = analysis || null;
    let warning = null;

    if (!ai) {
      const result = await EmergencyAnalyzer.analyzeEmergency(message);
      ai = result.analysis;
      warning = result.warning;
    }

    // Location is optional on purpose: a denied geolocation prompt must not
    // block an emergency. When the browser gives us nothing we fall back to
    // the demo fixture, which is tagged with source: "demo-fixture" so it is
    // never mistaken for a real position.
    const hasCoords =
      latitude !== undefined && longitude !== undefined && latitude !== null && longitude !== null;

    const location = hasCoords
      ? { latitude: Number(latitude), longitude: Number(longitude), address: address || null }
      : { ...DEMO_LOCATION };

    const transport = DemoTransport.send({ originalText: message, ai, location });

    res.status(201).json({ success: true, warning, transport });
  } catch (error) {
    console.error("[Neo][DemoController] ❌ Send error:", error);
    res.status(500).json({ error: "Failed to send emergency", message: error.message });
  }
}

// GET /api/demo/emergencies/:id
//
// Returns the relay progress and, once delivered, the stored help request
// alongside it. The victim view polls this one endpoint for the whole
// journey: relaying, delivered, then accepted by a responder.
async function getEmergency(req, res) {
  const transport = DemoTransport.get(req.params.id);
  if (!transport) {
    return res.status(404).json({
      error: "Not found",
      message: `No demo emergency with id: ${req.params.id}`,
    });
  }

  const helpRequest = transport.helpRequestId
    ? await HelpRequestModel.getById(transport.helpRequestId)
    : null;

  res.json({ success: true, transport, helpRequest });
}

// GET /api/demo/emergencies
async function listEmergencies(req, res) {
  res.json({ success: true, transports: DemoTransport.list() });
}

// GET /api/demo/network
// Drives the network view. Returns the live topology plus the recorded event
// log of the most recent emergency, so the view renders real state rather
// than replaying an animation.
async function getNetwork(req, res) {
  const transport = DemoTransport.current();
  res.json({
    success: true,
    network: transport ? transport.network : DemoTransport.idleNetwork(),
    events: transport ? transport.events : [],
    requestId: transport ? transport.id : null,
    helpRequestId: transport ? transport.helpRequestId : null,
  });
}

// GET /api/demo/responder/queue
//
// The responder view's single source: who the seeded responder is, plus the
// active requests annotated with the distance and ETA they would have if this
// responder took them. Computed here so the distance formula lives in one
// place rather than being duplicated in the browser.
async function getResponderQueue(req, res) {
  try {
    const requests = await HelpRequestModel.getActive();

    const annotated = requests.map((request) => {
      const preview = buildDemoResponder(request);
      return {
        ...request,
        distanceMiles: preview.distanceMiles,
        etaMinutes: preview.etaMinutes,
      };
    });

    res.json({
      success: true,
      responder: {
        id: DEMO_RESPONDER.id,
        name: DEMO_RESPONDER.name,
        verified: DEMO_RESPONDER.verified,
      },
      requests: annotated,
    });
  } catch (error) {
    console.error("[Neo][DemoController] \u274c Queue error:", error);
    res.status(500).json({ error: "Failed to load responder queue", message: error.message });
  }
}

// POST /api/demo/reset
async function resetDemo(req, res) {
  try {
    const result = await DemoTransport.reset();
    res.json({ success: true, ...result });
  } catch (error) {
    console.error("[Neo][DemoController] ❌ Reset error:", error);
    res.status(500).json({ error: "Failed to reset demo", message: error.message });
  }
}

module.exports = {
  sendEmergency,
  getResponderQueue,
  getEmergency,
  listEmergencies,
  getNetwork,
  resetDemo,
};
