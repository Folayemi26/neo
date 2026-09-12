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

export async function fetchEmergency(id) {
  const res = await axios.get(`${API_BASE_WITH_PATH}/demo/emergencies/${id}`);
  return res.data.transport;
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

// Structured emergency analysis (Gemini, with keyword fallback).
export async function analyzeEmergency(message) {
  const res = await axios.post(`${API_BASE_WITH_PATH}/medai/analyze`, { message });
  return res.data;
}
