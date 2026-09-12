// server/tests/voiceService.test.js
//
// No ElevenLabs key is needed here: fetch is stubbed. These tests pin the
// contract the responder UI relies on, above all that a synthesis failure is
// reported cleanly instead of breaking the emergency.
const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const TMP_DB = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "neo-voice-")), "helpRequests.json");
process.env.HELP_REQUESTS_DB = TMP_DB;

const VoiceService = require("../services/VoiceService");
const HelpRequestModel = require("../models/HelpRequestModel");
const HelpRequestController = require("../controllers/HelpRequestController");

const REQUEST = {
  id: "demo_request_voice",
  natureOfHelp: "Medical Assistance",
  priority: "Critical",
  distanceMiles: 0.4,
  ai: { peopleAffected: 2, needs: ["first aid", "bleeding assistance"] },
};

const realFetch = global.fetch;
let calls = [];

function stubFetch(impl) {
  calls = [];
  global.fetch = async (url, options) => {
    calls.push({ url, options });
    return impl(url, options);
  };
}

function audioResponse(bytes = 32) {
  return {
    ok: true,
    status: 200,
    arrayBuffer: async () => new Uint8Array(bytes).fill(7).buffer,
  };
}

test.beforeEach(() => {
  VoiceService.clearCache();
  process.env.ELEVENLABS_API_KEY = "test-key-not-a-real-secret";
});

test.afterEach(() => {
  global.fetch = realFetch;
  delete process.env.ELEVENLABS_API_KEY;
  VoiceService.clearCache();
});

test("without a key it reports not_configured and still returns the script", async () => {
  delete process.env.ELEVENLABS_API_KEY;
  await assert.rejects(
    () => VoiceService.generateEmergencyAudio(REQUEST),
    (err) => {
      assert.strictEqual(err.code, "not_configured");
      assert.match(err.script, /critical medical emergency/i);
      return true;
    }
  );
});

test("a successful synthesis returns audio and sends the key as a header", async () => {
  stubFetch(() => audioResponse(64));

  const result = await VoiceService.generateEmergencyAudio(REQUEST);

  assert.ok(Buffer.isBuffer(result.audio));
  assert.strictEqual(result.audio.length, 64);
  assert.strictEqual(result.contentType, "audio/mpeg");
  assert.strictEqual(result.cached, false);

  // The key travels in a server-side header, never in the URL.
  assert.strictEqual(calls[0].options.headers["xi-api-key"], "test-key-not-a-real-secret");
  assert.ok(!calls[0].url.includes("test-key"), "the key is not in the URL");

  // Only the script we built is ever sent for synthesis.
  const sent = JSON.parse(calls[0].options.body);
  assert.match(sent.text, /critical medical emergency/i);
});

test("a repeat request is served from cache without calling ElevenLabs again", async () => {
  stubFetch(() => audioResponse());

  const first = await VoiceService.generateEmergencyAudio(REQUEST);
  const second = await VoiceService.generateEmergencyAudio(REQUEST);

  assert.strictEqual(first.cached, false);
  assert.strictEqual(second.cached, true);
  assert.strictEqual(calls.length, 1, "one network call for two plays");
});

test("a changed emergency regenerates rather than replaying stale audio", async () => {
  stubFetch(() => audioResponse());

  await VoiceService.generateEmergencyAudio(REQUEST);
  await VoiceService.generateEmergencyAudio({ ...REQUEST, priority: "Normal" });

  assert.strictEqual(calls.length, 2, "a different script means a fresh synthesis");
});

test("an API error becomes synthesis_failed, with the script preserved", async () => {
  stubFetch(() => ({ ok: false, status: 401, text: async () => "unauthorized" }));

  await assert.rejects(
    () => VoiceService.generateEmergencyAudio(REQUEST),
    (err) => {
      assert.strictEqual(err.code, "synthesis_failed");
      assert.strictEqual(err.status, 401);
      assert.ok(err.script);
      return true;
    }
  );
});

test("a network failure is reported, not thrown raw", async () => {
  stubFetch(() => {
    throw new Error("ECONNRESET");
  });

  await assert.rejects(
    () => VoiceService.generateEmergencyAudio(REQUEST),
    (err) => {
      assert.strictEqual(err.code, "synthesis_failed");
      return true;
    }
  );
});

test("clearCache empties the store so a reset regenerates", async () => {
  stubFetch(() => audioResponse());
  await VoiceService.generateEmergencyAudio(REQUEST);
  assert.strictEqual(VoiceService.cacheSize(), 1);

  assert.strictEqual(VoiceService.clearCache(), 1);
  assert.strictEqual(VoiceService.cacheSize(), 0);
});

// --- the HTTP surface ---

function mockRes() {
  const res = { statusCode: 200, body: null, headers: {}, sent: null };
  res.status = (c) => { res.statusCode = c; return res; };
  res.json = (b) => { res.body = b; return res; };
  res.set = (h) => { Object.assign(res.headers, h); return res; };
  res.send = (b) => { res.sent = b; return res; };
  return res;
}

test("the audio endpoint 404s for an unknown request", async () => {
  const res = mockRes();
  await HelpRequestController.getHelpRequestAudio({ params: { id: "missing" } }, res);
  assert.strictEqual(res.statusCode, 404);
});

test("the audio endpoint returns 503 with the script when synthesis fails", async () => {
  const stored = await HelpRequestModel.add({ message: "Bleeding badly", latitude: 1, longitude: 1 });
  stubFetch(() => ({ ok: false, status: 500, text: async () => "boom" }));

  const res = mockRes();
  await HelpRequestController.getHelpRequestAudio({ params: { id: stored.id } }, res);

  assert.strictEqual(res.statusCode, 503);
  assert.strictEqual(res.body.code, "synthesis_failed");
  assert.ok(res.body.script, "the UI can still show what would have been read");
  assert.match(res.body.message, /details remain available/i);

  await HelpRequestModel.clear();
});

test("the audio endpoint serves audio with the script in a header", async () => {
  const stored = await HelpRequestModel.add({ message: "Bleeding badly", latitude: 1, longitude: 1 });
  stubFetch(() => audioResponse(16));

  const res = mockRes();
  await HelpRequestController.getHelpRequestAudio({ params: { id: stored.id } }, res);

  assert.strictEqual(res.statusCode, 200);
  assert.strictEqual(res.headers["Content-Type"], "audio/mpeg");
  assert.ok(Buffer.isBuffer(res.sent));
  assert.ok(decodeURIComponent(res.headers["X-Neo-Script"]).length > 0);

  await HelpRequestModel.clear();
});
