#!/usr/bin/env node
// server/scripts/check-voice.js
//
// Verifies the ElevenLabs setup from the machine that will run the demo.
//
// Exists because the voice id is the one piece of this integration that
// cannot be checked from source: voice ids are account-specific, so a
// plausible-looking default can still be wrong. Run this before presenting.
//
//   cd server && node scripts/check-voice.js

require("dotenv").config();

const VoiceService = require("../services/VoiceService");
const { buildEmergencyScript, estimateSeconds } = require("../services/emergencyScript");

const SAMPLE = {
  id: "check_voice_sample",
  natureOfHelp: "Medical Assistance",
  priority: "Critical",
  distanceMiles: 0.4,
  ai: { peopleAffected: 2, needs: ["first aid", "bleeding assistance", "mobility assistance"] },
};

async function main() {
  const script = buildEmergencyScript(SAMPLE);
  console.log(`\nScript (${estimateSeconds(script).toFixed(1)}s):\n  "${script}"\n`);

  if (!VoiceService.isConfigured()) {
    console.log("✗ ELEVENLABS_API_KEY is not set. Add it to server/.env");
    process.exitCode = 1;
    return;
  }

  console.log(`Configured voice : ${VoiceService.getVoiceId()}`);
  console.log(`Configured model : ${VoiceService.getModelId()}\n`);

  try {
    const result = await VoiceService.generateEmergencyAudio(SAMPLE);
    console.log(`✓ Synthesis succeeded: ${result.audio.length} bytes of ${result.contentType}`);
    console.log("  The responder's Play Emergency button will work.\n");
  } catch (err) {
    console.log(`✗ Synthesis failed (${err.code}): ${err.message}\n`);
    if (err.code === "bad_voice") {
      console.log("  The configured voice id was rejected and no replacement was found.");
      console.log("  Set ELEVENLABS_VOICE_ID in server/.env to a voice from your account.\n");
    }
    process.exitCode = 1;
  }
}

main();
