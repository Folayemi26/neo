// server/services/DemoTransport.js
// Simulated store-and-forward relay for the one-laptop demo.
//
// WHAT IS SIMULATED: the physical hops only. There is no BLE radio, no Wi-Fi
// Direct, and the laptop keeps its internet connection throughout. The peer
// and gateway nodes are fictional.
//
// WHAT IS REAL: everything else. Each stage below is an actual state
// transition on a stored record with a real timestamp, the request keeps one
// id from creation through to the responder, and reaching the gateway hands
// the emergency to the real HelpRequestModel. The network view renders these
// recorded events; it does not run animations of its own.
//
// The transport lives on the server rather than in the victim's browser tab
// so that the victim, responder and network views are all reading the same
// state instead of three tabs each telling their own story.

const crypto = require("crypto");
const HelpRequestModel = require("../models/HelpRequestModel");

// Demo records are namespaced so a reset can find them without touching real
// help requests.
const DEMO_ID_PREFIX = "demo_request_";

const NODES = [
  { id: "victim-device", label: "Victim Device" },
  { id: "neo-peer-01", label: "Neo Peer 01" },
  { id: "internet-gateway", label: "Internet Gateway" },
  { id: "neo-backend", label: "Neo Backend" },
];

// at: milliseconds from send. status: the request's lifecycle state once this
// stage fires. nodes: each node's state for the network view at that moment.
//
// victim-device stays "offline" for every stage on purpose. The victim never
// gains connectivity; the emergency travels because a peer carries it. Showing
// that node go green would contradict the premise of the product.
const STAGES = [
  {
    at: 0,
    event: "EMERGENCY_QUEUED",
    status: "queued",
    message: "Emergency created",
    nodes: { "victim-device": "offline", "neo-peer-01": "idle", "internet-gateway": "idle", "neo-backend": "idle" },
  },
  {
    at: 400,
    event: "NO_DIRECT_CONNECTION",
    status: "queued",
    message: "Victim device has no direct connection",
    nodes: { "victim-device": "offline", "neo-peer-01": "idle", "internet-gateway": "idle", "neo-backend": "idle" },
  },
  {
    at: 900,
    event: "SEARCHING_FOR_PEER",
    status: "searching",
    message: "Searching for nearby Neo nodes",
    nodes: { "victim-device": "offline", "neo-peer-01": "idle", "internet-gateway": "idle", "neo-backend": "idle" },
  },
  {
    at: 1500,
    event: "PEER_DISCOVERED",
    status: "relaying",
    message: "Neo Peer 01 discovered",
    nodes: { "victim-device": "offline", "neo-peer-01": "discovered", "internet-gateway": "idle", "neo-backend": "idle" },
  },
  {
    at: 2000,
    event: "RELAY_STARTED",
    status: "relaying",
    message: "Relaying emergency to Neo Peer 01",
    nodes: { "victim-device": "offline", "neo-peer-01": "relaying", "internet-gateway": "idle", "neo-backend": "idle" },
  },
  {
    at: 2500,
    event: "RELAY_COMPLETE",
    status: "relaying",
    message: "Neo Peer 01 accepted the relay",
    nodes: { "victim-device": "offline", "neo-peer-01": "relaying", "internet-gateway": "idle", "neo-backend": "idle" },
  },
  {
    at: 3000,
    event: "GATEWAY_DISCOVERED",
    status: "relaying",
    message: "Internet gateway reached",
    nodes: { "victim-device": "offline", "neo-peer-01": "relaying", "internet-gateway": "connected", "neo-backend": "idle" },
  },
  {
    at: 3400,
    event: "GATEWAY_FORWARDING",
    status: "forwarding",
    message: "Forwarding emergency to Neo backend",
    nodes: { "victim-device": "offline", "neo-peer-01": "sent", "internet-gateway": "connected", "neo-backend": "idle" },
  },
  {
    at: 3900,
    event: "BACKEND_DELIVERED",
    status: "delivered",
    message: "Emergency delivered to Neo backend",
    nodes: { "victim-device": "offline", "neo-peer-01": "sent", "internet-gateway": "connected", "neo-backend": "delivered" },
  },
  {
    at: 4200,
    event: "ACK_RECEIVED",
    status: "delivered",
    message: "Delivery acknowledged to victim device",
    nodes: { "victim-device": "offline", "neo-peer-01": "sent", "internet-gateway": "connected", "neo-backend": "delivered" },
  },
];

const RELAY_PATH = NODES.map((n) => n.id);
const TOTAL_DURATION_MS = STAGES[STAGES.length - 1].at;

// In-memory: a demo is a single session on one laptop, and a reset should
// genuinely forget everything. The delivered help request itself is persisted
// by HelpRequestModel, so nothing a responder needs is lost.
const transports = new Map();
const timers = new Set();

function idleNodeStates() {
  return NODES.reduce((acc, n) => ({ ...acc, [n.id]: "idle" }), {});
}

function newId() {
  return `${DEMO_ID_PREFIX}${crypto.randomUUID()}`;
}

// The public shape the API and UI consume.
function serialize(record) {
  return {
    id: record.id,
    status: record.status,
    createdAt: record.createdAt,
    deliveredAt: record.deliveredAt,
    input: record.input,
    ai: record.ai,
    location: record.location,
    network: {
      mode: "demo",
      status: record.status,
      relayPath: RELAY_PATH,
      hopCount: record.hopCount,
      nodes: record.nodeStates,
      nodeLabels: NODES,
      totalDurationMs: TOTAL_DURATION_MS,
    },
    events: record.events,
    helpRequestId: record.helpRequestId,
    error: record.error,
  };
}

function recordEvent(record, stage) {
  record.status = stage.status;
  record.nodeStates = { ...stage.nodes };
  // Hops are nodes that have actually carried the emergency. The victim
  // device is the origin, not a hop, and stays offline throughout.
  record.hopCount = RELAY_PATH.filter(
    (id) => id !== "victim-device" && ["relaying", "sent", "connected", "delivered"].includes(stage.nodes[id])
  ).length;
  record.events.push({
    event: stage.event,
    message: stage.message,
    status: stage.status,
    at: stage.at,
    timestamp: new Date().toISOString(),
  });
}

// Hands the emergency to the real help-request infrastructure. From here on
// it is an ordinary request: the responder dashboard reads it through the
// same API it already uses.
async function deliverToBackend(record) {
  try {
    const analysis = record.ai || {};
    const saved = await HelpRequestModel.add({
      id: record.id, // one id from victim through to responder
      message: record.input.originalText,
      natureOfHelp: analysis.category,
      priority: analysis.priority,
      latitude: record.location ? record.location.latitude : undefined,
      longitude: record.location ? record.location.longitude : undefined,
      address: record.location ? record.location.address : undefined,
      timestamp: record.createdAt,
      status: "pending",
      demo: true,
      ai: record.ai,
      network: { mode: "demo", relayPath: RELAY_PATH, hopCount: RELAY_PATH.length },
    });
    record.helpRequestId = saved.id;
    record.deliveredAt = new Date().toISOString();
  } catch (error) {
    // A backend failure must not wedge the demo: the record stays visible and
    // says what went wrong.
    console.error("[Neo][DemoTransport] ❌ Delivery failed:", error.message);
    record.error = `Delivery to backend failed: ${error.message}`;
  }
}

/**
 * Begins a simulated relay.
 *
 * @param {object} emergency  { originalText, ai, location }
 * @param {object} options    timescale multiplies every delay; 0 runs the
 *                            whole timeline immediately (used by tests).
 * @returns {object} the serialized transport record, already carrying its id
 */
function send(emergency, { timescale = 1 } = {}) {
  const record = {
    id: emergency.id || newId(),
    status: "queued",
    createdAt: new Date().toISOString(),
    deliveredAt: null,
    input: { originalText: String(emergency.originalText || "").trim() },
    ai: emergency.ai || null,
    location: emergency.location || null,
    nodeStates: idleNodeStates(),
    hopCount: 0,
    events: [],
    helpRequestId: null,
    error: null,
  };

  transports.set(record.id, record);

  record.completion = new Promise((resolve) => {
    let pending = STAGES.length;

    STAGES.forEach((stage) => {
      const fire = async () => {
        recordEvent(record, stage);
        if (stage.event === "BACKEND_DELIVERED") {
          await deliverToBackend(record);
        }
        if (--pending === 0) resolve(serialize(record));
      };

      const delay = Math.round(stage.at * timescale);
      if (delay <= 0) {
        // Still async so callers observe stages in order, never mid-write.
        Promise.resolve().then(fire);
      } else {
        const timer = setTimeout(() => {
          timers.delete(timer);
          fire();
        }, delay);
        timers.add(timer);
      }
    });
  });

  console.log(`[Neo][DemoTransport] 📡 Relay started for ${record.id}`);
  return serialize(record);
}

function get(id) {
  const record = transports.get(id);
  return record ? serialize(record) : null;
}

function list() {
  return [...transports.values()]
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
    .map(serialize);
}

// The most recent transport, which is what the network view follows.
function current() {
  const all = list();
  return all.length > 0 ? all[0] : null;
}

// Idle topology, shown before any emergency has been sent.
function idleNetwork() {
  return {
    mode: "demo",
    status: "idle",
    relayPath: RELAY_PATH,
    hopCount: 0,
    nodes: idleNodeStates(),
    nodeLabels: NODES,
    totalDurationMs: TOTAL_DURATION_MS,
  };
}

/**
 * Clears demo state only. Cancels in-flight timers, drops transport records,
 * and removes demo help requests from the store by id prefix. Real help
 * requests are left untouched.
 */
async function reset() {
  for (const timer of timers) clearTimeout(timer);
  timers.clear();
  transports.clear();

  const removed = await HelpRequestModel.removeByIdPrefix(DEMO_ID_PREFIX);
  console.log(`[Neo][DemoTransport] 🧹 Reset: removed ${removed} demo help request(s)`);
  return { success: true, removedHelpRequests: removed };
}

module.exports = {
  DEMO_ID_PREFIX,
  NODES,
  STAGES,
  RELAY_PATH,
  TOTAL_DURATION_MS,
  send,
  get,
  list,
  current,
  idleNetwork,
  reset,
};
