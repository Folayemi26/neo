// server/tests/demoTransport.test.js
//
// The demo's central claim is that one emergency, with one id, travels from
// the victim through the relay into the real help-request store. These tests
// hold that claim to account, and check that a reset cannot delete real data.
const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

// Point the model at a scratch file before anything requires it.
const TMP_DB = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "neo-demo-")), "helpRequests.json");
process.env.HELP_REQUESTS_DB = TMP_DB;

const HelpRequestModel = require("../models/HelpRequestModel");
const DemoTransport = require("../services/DemoTransport");

const GOLDEN = "We were in a car accident. My friend is bleeding badly and can't walk.";
const ANALYSIS = {
  category: "Medical Assistance",
  priority: "Critical",
  summary: "A person is bleeding after a vehicle accident and cannot walk.",
  peopleAffected: 2,
  needs: ["first aid", "bleeding assistance", "mobility assistance"],
};

// timescale 0 runs the whole timeline immediately.
function sendNow(overrides = {}) {
  return DemoTransport.send(
    { originalText: GOLDEN, ai: ANALYSIS, location: { latitude: 29.717, longitude: -95.402 }, ...overrides },
    { timescale: 0 }
  );
}

test.afterEach(async () => {
  await DemoTransport.reset();
  await HelpRequestModel.clear();
});

test("a sent emergency starts queued with a namespaced id", () => {
  const transport = sendNow();
  assert.ok(transport.id.startsWith("demo_request_"), `got ${transport.id}`);
  assert.strictEqual(transport.status, "queued");
  assert.strictEqual(transport.network.mode, "demo");
});

test("status progresses queued -> relaying -> delivered", async () => {
  const started = sendNow();
  assert.strictEqual(started.status, "queued", "it starts queued, before any hop");

  await new Promise((r) => setTimeout(r, 20));
  const done = DemoTransport.get(started.id);

  // The lifecycle is observable in the recorded events, not just the end state.
  const statuses = done.events.map((e) => e.status);
  assert.ok(statuses.indexOf("queued") < statuses.indexOf("relaying"), "queued precedes relaying");
  assert.ok(statuses.indexOf("relaying") < statuses.lastIndexOf("delivered"), "relaying precedes delivered");
  assert.strictEqual(done.status, "delivered");
});

test("every relay stage is recorded, in order", async () => {
  const started = sendNow();
  await new Promise((r) => setTimeout(r, 20));
  const done = DemoTransport.get(started.id);

  const names = done.events.map((e) => e.event);
  assert.deepStrictEqual(names, DemoTransport.STAGES.map((s) => s.event));
  assert.ok(names.includes("NO_DIRECT_CONNECTION"));
  assert.ok(names.includes("PEER_DISCOVERED"));
  assert.ok(names.includes("BACKEND_DELIVERED"));

  // Each event carries a real wall-clock timestamp, not a hardcoded string.
  done.events.forEach((e) => assert.ok(!Number.isNaN(Date.parse(e.timestamp))));
});

test("the same id travels from transport into the help-request store", async () => {
  const started = sendNow();
  await new Promise((r) => setTimeout(r, 20));

  const done = DemoTransport.get(started.id);
  const stored = await HelpRequestModel.getById(started.id);

  assert.ok(stored, "the emergency reached the real help-request store");
  assert.strictEqual(done.id, started.id);
  assert.strictEqual(done.helpRequestId, started.id);
  assert.strictEqual(stored.id, started.id);
});

test("the delivered request carries the AI fields a responder needs", async () => {
  const started = sendNow();
  await new Promise((r) => setTimeout(r, 20));

  const stored = await HelpRequestModel.getById(started.id);
  assert.strictEqual(stored.natureOfHelp, "Medical Assistance");
  assert.strictEqual(stored.priority, "Critical");
  assert.strictEqual(stored.message, GOLDEN, "the victim's original wording is preserved");
  assert.strictEqual(stored.ai.peopleAffected, 2);
  assert.strictEqual(stored.status, "pending");
});

test("an emergency without a location still delivers", async () => {
  const started = sendNow({ location: null });
  await new Promise((r) => setTimeout(r, 20));

  const stored = await HelpRequestModel.getById(started.id);
  assert.ok(stored, "a denied geolocation prompt must not block an SOS");
  assert.strictEqual(DemoTransport.get(started.id).status, "delivered");
});

test("reset removes demo requests and leaves real ones alone", async () => {
  const real = await HelpRequestModel.add({ message: "A real request", latitude: 1, longitude: 1 });
  const started = sendNow();
  await new Promise((r) => setTimeout(r, 20));

  assert.ok(await HelpRequestModel.getById(started.id), "demo request exists before reset");

  const result = await DemoTransport.reset();

  assert.strictEqual(result.removedHelpRequests, 1);
  assert.strictEqual(await HelpRequestModel.getById(started.id), null, "demo request removed");
  assert.ok(await HelpRequestModel.getById(real.id), "the real request survived the reset");
});

test("reset clears transport state and returns the network to idle", async () => {
  sendNow();
  await new Promise((r) => setTimeout(r, 20));
  assert.ok(DemoTransport.current(), "a transport exists before reset");

  await DemoTransport.reset();

  assert.strictEqual(DemoTransport.current(), null);
  assert.strictEqual(DemoTransport.idleNetwork().status, "idle");
});

test("reset cancels an in-flight relay instead of letting it land later", async () => {
  const started = DemoTransport.send({ originalText: GOLDEN, ai: ANALYSIS }, { timescale: 1 });
  await DemoTransport.reset();
  await new Promise((r) => setTimeout(r, 120));

  assert.strictEqual(DemoTransport.get(started.id), null, "the cancelled relay left no record");
  assert.strictEqual(await HelpRequestModel.getById(started.id), null, "and never reached the store");
});

test("the demo can be run repeatedly", async () => {
  for (let run = 0; run < 3; run++) {
    const started = sendNow();
    await new Promise((r) => setTimeout(r, 20));
    assert.strictEqual(DemoTransport.get(started.id).status, "delivered", `run ${run + 1}`);
    await DemoTransport.reset();
  }
});
