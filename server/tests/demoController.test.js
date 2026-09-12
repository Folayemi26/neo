// server/tests/demoController.test.js
//
// The victim view polls one endpoint for the whole journey, so getEmergency
// must return the stored help request alongside the relay progress once the
// emergency has been delivered.
const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const TMP_DB = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "neo-ctrl-")), "helpRequests.json");
process.env.HELP_REQUESTS_DB = TMP_DB;

const HelpRequestModel = require("../models/HelpRequestModel");
const DemoTransport = require("../services/DemoTransport");
const DemoController = require("../controllers/DemoController");

// Minimal Express double: records what the handler sent.
function mockRes() {
  const res = { statusCode: 200, body: null };
  res.status = (code) => {
    res.statusCode = code;
    return res;
  };
  res.json = (payload) => {
    res.body = payload;
    return res;
  };
  return res;
}

const GOLDEN = "We were in a car accident. My friend is bleeding badly and can't walk.";
const ANALYSIS = { category: "Medical Assistance", priority: "Critical", summary: "Bleeding after a crash.", needs: ["first aid"] };

test.afterEach(async () => {
  await DemoTransport.reset();
  await HelpRequestModel.clear();
});

test("a missing message is rejected", async () => {
  const res = mockRes();
  await DemoController.sendEmergency({ body: { message: "   " } }, res);
  assert.strictEqual(res.statusCode, 400);
});

test("getEmergency returns the help request once delivered", async () => {
  const started = DemoTransport.send(
    { originalText: GOLDEN, ai: ANALYSIS, location: { latitude: 1, longitude: 2 } },
    { timescale: 0 }
  );
  await new Promise((r) => setTimeout(r, 20));

  const res = mockRes();
  await DemoController.getEmergency({ params: { id: started.id } }, res);

  assert.strictEqual(res.body.transport.status, "delivered");
  assert.ok(res.body.helpRequest, "the help request travels with the transport");
  assert.strictEqual(res.body.helpRequest.id, started.id, "and carries the same id");
});

test("getEmergency reports no help request before delivery", async () => {
  const started = DemoTransport.send({ originalText: GOLDEN, ai: ANALYSIS }, { timescale: 1 });

  const res = mockRes();
  await DemoController.getEmergency({ params: { id: started.id } }, res);

  assert.strictEqual(res.body.helpRequest, null, "nothing is stored until the gateway is reached");
  assert.notStrictEqual(res.body.transport.status, "delivered");
});

test("an unknown id is a 404", async () => {
  const res = mockRes();
  await DemoController.getEmergency({ params: { id: "demo_request_nope" } }, res);
  assert.strictEqual(res.statusCode, 404);
});

test("the victim sees a responder's acceptance through the same endpoint", async () => {
  const started = DemoTransport.send({ originalText: GOLDEN, ai: ANALYSIS }, { timescale: 0 });
  await new Promise((r) => setTimeout(r, 20));

  await HelpRequestModel.updateStatus(started.id, "accepted");

  const res = mockRes();
  await DemoController.getEmergency({ params: { id: started.id } }, res);
  assert.strictEqual(res.body.helpRequest.status, "accepted");
});

test("the network endpoint is idle before anything is sent", async () => {
  const res = mockRes();
  await DemoController.getNetwork({}, res);
  assert.strictEqual(res.body.network.status, "idle");
  assert.deepStrictEqual(res.body.events, []);
  assert.strictEqual(res.body.requestId, null);
});
