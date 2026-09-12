// src/api/demoApi.js
// Client for the demo relay endpoints. Mirrors the conventions in
// helpRequestApi.js so there is one way to talk to the server.

import axios from "axios";

const API_BASE = import.meta.env.VITE_API_BASE_URL || "http://localhost:4000";
const API_BASE_WITH_PATH = `${API_BASE}/api`;

// Sends an emergency into the simulated relay. `analysis` is the structured
// result the victim has already seen; omit it and the server analyzes.
export async function sendEmergency({ message, analysis, latitude, longitude, address }) {
  const res = await axios.post(`${API_BASE_WITH_PATH}/demo/emergencies`, {
    message,
    analysis,
    latitude,
    longitude,
    address,
  });
  return res.data;
}

// Returns { transport, helpRequest }. The victim view needs both: the
// transport for relay progress, and the help request for the responder's
// acceptance once it has been delivered.
export async function fetchEmergency(id) {
  const res = await axios.get(`${API_BASE_WITH_PATH}/demo/emergencies/${id}`);
  return { transport: res.data.transport, helpRequest: res.data.helpRequest || null };
}

// Topology plus the recorded event log of the most recent emergency.
export async function fetchNetwork() {
  const res = await axios.get(`${API_BASE_WITH_PATH}/demo/network`);
  return res.data;
}

export async function resetDemo() {
  const res = await axios.post(`${API_BASE_WITH_PATH}/demo/reset`);
  return res.data;
}

// The responder view's queue: the seeded responder plus active requests,
// each annotated with the distance and ETA server-side.
export async function fetchResponderQueue() {
  const res = await axios.get(`${API_BASE_WITH_PATH}/demo/responder/queue`);
  return { responder: res.data.responder, requests: res.data.requests || [] };
}

// Claims a request. A 409 is an expected outcome, not an error: it means
// another responder got there first, so it is reported rather than thrown.
export async function acceptRequest(id, responder) {
  try {
    const res = await axios.post(`${API_BASE_WITH_PATH}/help-requests/${id}/accept`, { responder });
    return { ok: true, request: res.data.request };
  } catch (err) {
    if (err.response && err.response.status === 409) {
      return { ok: false, conflict: true, request: err.response.data.request };
    }
    throw err;
  }
}

// Fetches the spoken alert for an emergency.
//
// Uses fetch rather than axios because the two outcomes have different body
// types: audio bytes on success, JSON on failure. A 503 is an expected
// outcome (voice unavailable), so it is returned rather than thrown, and the
// caller shows the script text instead.
export async function fetchEmergencyAudio(id) {
  const res = await fetch(`${API_BASE_WITH_PATH}/help-requests/${id}/audio`);

  if (res.ok) {
    const blob = await res.blob();
    const header = res.headers.get("X-Neo-Script");
    return {
      ok: true,
      url: URL.createObjectURL(blob),
      script: header ? decodeURIComponent(header) : null,
    };
  }

  const data = await res.json().catch(() => ({}));
  return {
    ok: false,
    code: data.code || "synthesis_failed",
    message: data.message || "Unable to generate audio.",
    script: data.script || null,
  };
}

// Structured emergency analysis (Gemini, with keyword fallback).
export async function analyzeEmergency(message) {
  const res = await axios.post(`${API_BASE_WITH_PATH}/medai/analyze`, { message });
  return res.data;
}
