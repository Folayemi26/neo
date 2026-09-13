// server/services/VoiceService.js
// Spoken emergency alerts via ElevenLabs.
//
// The API key stays here, server-side. The browser never sees it: the
// responder UI asks this server for audio by request id, and this server
// talks to ElevenLabs.
//
// The endpoint above this service synthesizes only text this service builds
// from a stored emergency. It never accepts caller-supplied text, so it
// cannot be used as a free text-to-speech relay even though the demo has no
// authentication of its own.
//
// Audio is never load-bearing. Every failure path here returns a structured
// error and the responder UI keeps showing the emergency as text.

const { buildEmergencyScript } = require("./emergencyScript");

const DEFAULT_API_BASE = "https://api.elevenlabs.io/v1/text-to-speech";
const VOICES_URL = "https://api.elevenlabs.io/v1/voices";

// Overridable so the voice path can be pointed at a stub in tests, or at a
// proxy in a deployment that requires one.
function getApiBase() {
  return process.env.ELEVENLABS_API_BASE || DEFAULT_API_BASE;
}

// A standard ElevenLabs stock voice. Override per deployment: voice ids are
// account-specific in general, and this one is only a sensible default.
const DEFAULT_VOICE_ID = "21m00Tcm4TlvDq8ikWAM";
// Multilingual so a Spanish-language alert can be spoken with the same setup.
const DEFAULT_MODEL_ID = "eleven_multilingual_v2";
const DEFAULT_TIMEOUT_MS = 15000;

// Keyed by request id. Value holds the script it was generated from, so a
// changed emergency regenerates instead of serving stale audio.
const cache = new Map();

// A voice id proven to work on this account, discovered after the configured
// one was rejected. Voice ids are account-specific, so a default that is
// merely plausible can fail at the worst moment; rather than hand-verify one,
// the service looks up a real voice and remembers it.
let discoveredVoiceId = null;

function getApiKey() {
  return process.env.ELEVENLABS_API_KEY || null;
}

function isConfigured() {
  return Boolean(getApiKey());
}

function getVoiceId() {
  return process.env.ELEVENLABS_VOICE_ID || DEFAULT_VOICE_ID;
}

function getModelId() {
  return process.env.ELEVENLABS_MODEL_ID || DEFAULT_MODEL_ID;
}

function getTimeoutMs() {
  const raw = parseInt(process.env.ELEVENLABS_TIMEOUT_MS, 10);
  return Number.isFinite(raw) && raw > 0 ? raw : DEFAULT_TIMEOUT_MS;
}

/**
 * Synthesizes a spoken alert for a stored help request.
 *
 * @param {object} request  a stored help request
 * @returns {Promise<{audio: Buffer, contentType: string, script: string, cached: boolean}>}
 * @throws {Error} with .code set to "not_configured" or "synthesis_failed"
 */
async function generateEmergencyAudio(request) {
  const script = buildEmergencyScript(request);

  const cached = cache.get(request.id);
  if (cached && cached.script === script) {
    return { ...cached, cached: true };
  }

  if (!isConfigured()) {
    const error = new Error("ElevenLabs is not configured (set ELEVENLABS_API_KEY)");
    error.code = "not_configured";
    error.script = script;
    throw error;
  }

  try {
    let result;
    try {
      result = await synthesize(script, discoveredVoiceId || getVoiceId());
    } catch (err) {
      // A rejected voice id is recoverable: ask the account which voices it
      // actually has, then retry once with a real one.
      if (err.code === "bad_voice") {
        const fallback = await lookupAnyVoiceId();
        if (!fallback) throw err;
        console.warn(`[Neo][VoiceService] ⚠️ Voice rejected; falling back to ${fallback}`);
        result = await synthesize(script, fallback);
        discoveredVoiceId = fallback;
      } else {
        throw err;
      }
    }

    const entry = { audio: result.audio, contentType: "audio/mpeg", script };
    cache.set(request.id, entry);

    console.log(
      `[Neo][VoiceService] 🔊 Generated ${result.audio.length} bytes for ${request.id}`
    );
    return { ...entry, cached: false };
  } catch (err) {
    if (err.code) throw err;
    const error = new Error(`ElevenLabs request failed: ${err.message}`);
    error.code = "synthesis_failed";
    error.script = script;
    throw error;
  }
}

// Asks the account for a usable voice id. Returns null if the lookup itself
// fails, in which case the original synthesis error stands.
async function lookupAnyVoiceId() {
  try {
    const res = await fetch(VOICES_URL, { headers: { "xi-api-key": getApiKey() } });
    if (!res.ok) return null;
    const data = await res.json();
    const voice = (data.voices || [])[0];
    return voice ? voice.voice_id : null;
  } catch (_) {
    return null;
  }
}

// One synthesis attempt against a specific voice.
async function synthesize(script, voiceId) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), getTimeoutMs());

  try {
    const response = await fetch(`${getApiBase()}/${voiceId}`, {
      method: "POST",
      headers: {
        "xi-api-key": getApiKey(),
        "Content-Type": "application/json",
        Accept: "audio/mpeg",
      },
      body: JSON.stringify({
        text: script,
        model_id: getModelId(),
        voice_settings: {
          // Steady and clear rather than expressive: this is a dispatch
          // readout, and a dramatic read would cost intelligibility.
          stability: 0.5,
          similarity_boost: 0.75,
        },
      }),
      signal: controller.signal,
    });

    if (!response.ok) {
      const detail = await response.text().catch(() => "");
      const error = new Error(
        `ElevenLabs returned ${response.status}: ${detail.slice(0, 200)}`
      );
      // 404 and 422 are how a wrong or inaccessible voice id comes back.
      error.code = response.status === 404 || response.status === 422 ? "bad_voice" : "synthesis_failed";
      error.status = response.status;
      error.script = script;
      throw error;
    }

    return { audio: Buffer.from(await response.arrayBuffer()), voiceId };
  } catch (err) {
    if (err.code) throw err;
    const error = new Error(
      err.name === "AbortError" ? "ElevenLabs timed out" : `ElevenLabs request failed: ${err.message}`
    );
    error.code = "synthesis_failed";
    error.script = script;
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

// Called by the demo reset so a fresh run regenerates audio.
function clearCache() {
  const size = cache.size;
  cache.clear();
  return size;
}

// Exposed for tests, which need the discovered voice forgotten between cases.
function _resetForTests() {
  cache.clear();
  discoveredVoiceId = null;
}

function cacheSize() {
  return cache.size;
}

module.exports = {
  isConfigured,
  _resetForTests,
  getApiBase,
  generateEmergencyAudio,
  clearCache,
  cacheSize,
  getVoiceId,
  getModelId,
  DEFAULT_VOICE_ID,
  DEFAULT_MODEL_ID,
};
