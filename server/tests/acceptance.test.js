// server/tests/acceptance.test.js
//
// Two responders must never both believe they own the same emergency. The
// guard lives in the model rather than in a disabled button, so these tests
// go straight at the model and the controller.
const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const TMP_DB = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "neo-accept-")), "helpRequests.json");
process.env.HELP_REQUESTS_DB = TMP_DB;

const HelpRequestModel = require("../models/HelpRequestModel");
const HelpRequestController = require("../controllers/HelpRequestController");
const { buildDemoResponder, DEMO_LOCATION, DEMO_RESPONDER } = require("../fixtures/demoFixtures");

function mockRes() {
  const res = { statusCode: 200, body: null };
  res.status = (c) => { res.statusCode = c; return res; };
  res.json = (b) => { res.body = b; return res; };
  return res;
}

async function seedRequest(extra = {}) {
  return HelpRequestModel.add({
    message: "We were in a car accident. My friend is bleeding badly.",
    latitude: DEMO_LOCATION.latitude,
    longitude: DEMO_LOCATION.longitude,
    ...extra,
  });
}

test.afterEach(async () => {
  await HelpRequestModel.clear();
});

test("accepting moves a pending request to accepted and attaches the responder", async () => {
  const req = await seedRequest();
  assert.strictEqual(req.status, "pending");

  const result = await HelpRequestModel.accept(req.id, buildDemoResponder(req));

  assert.strictEqual(result.ok, true);
  assert.strictEqual(result.request.status, "accepted");
  assert.strictEqual(result.request.responder.name, DEMO_RESPONDER.name);
  assert.strictEqual(result.request.responder.verified, true);
  assert.ok(result.request.acceptedAt);
});

test("a second responder cannot take a request that is already accepted", async () => {
  const req = await seedRequest();

  const first = await HelpRequestModel.accept(req.id, { id: "r1", name: "First", verified: true });
  const second = await HelpRequestModel.accept(req.id, { id: "r2", name: "Second", verified: true });

  assert.strictEqual(first.ok, true);
  assert.strictEqual(second.ok, false);
  assert.strictEqual(second.reason, "already_taken");

  const stored = await HelpRequestModel.getById(req.id);
  assert.strictEqual(stored.responder.name, "First", "the first responder keeps the request");
});

test("concurrent accepts resolve to exactly one winner", async () => {
  const req = await seedRequest();

  const results = await Promise.all([
    HelpRequestModel.accept(req.id, { id: "r1", name: "First", verified: true }),
    HelpRequestModel.accept(req.id, { id: "r2", name: "Second", verified: true }),
    HelpRequestModel.accept(req.id, { id: "r3", name: "Third", verified: true }),
  ]);

  const winners = results.filter((r) => r.ok);
  assert.strictEqual(winners.length, 1, "exactly one accept succeeds");

  const stored = await HelpRequestModel.getById(req.id);
  assert.strictEqual(stored.status, "accepted");
  assert.strictEqual(stored.responder.name, winners[0].request.responder.name);
});

test("a request that is not pending cannot be accepted", async () => {
  const req = await seedRequest();
  await HelpRequestModel.updateStatus(req.id, "fulfilled");

  const result = await HelpRequestModel.accept(req.id, { id: "r1", name: "First", verified: true });
  assert.strictEqual(result.ok, false);
  assert.strictEqual(result.reason, "already_taken");
});

test("accepting an unknown request reports not_found", async () => {
  const result = await HelpRequestModel.accept("nope", { id: "r1", name: "First", verified: true });
  assert.strictEqual(result.ok, false);
  assert.strictEqual(result.reason, "not_found");
});

test("the controller returns 409 on the second accept, not a second success", async () => {
  const req = await seedRequest();

  const first = mockRes();
  await HelpRequestController.acceptHelpRequest({ params: { id: req.id }, body: {} }, first);
  assert.strictEqual(first.statusCode, 200);
  assert.strictEqual(first.body.request.status, "accepted");

  const second = mockRes();
  await HelpRequestController.acceptHelpRequest({ params: { id: req.id }, body: {} }, second);
  assert.strictEqual(second.statusCode, 409);
  assert.match(second.body.message, /already accepted/i);
});

test("the controller 404s for an unknown request", async () => {
  const res = mockRes();
  await HelpRequestController.acceptHelpRequest({ params: { id: "missing" }, body: {} }, res);
  assert.strictEqual(res.statusCode, 404);
});

test("distance and ETA are computed from coordinates, not hardcoded", async () => {
  const req = await seedRequest();
  const responder = buildDemoResponder(req);

  assert.strictEqual(responder.distanceMiles, 0.4);
  assert.strictEqual(responder.etaMinutes, 4);

  // Move the emergency further away and the numbers must follow.
  const far = await seedRequest({ latitude: DEMO_LOCATION.latitude - 0.05 });
  const farResponder = buildDemoResponder(far);
  assert.ok(farResponder.distanceMiles > responder.distanceMiles, "further away reads as further");
  assert.ok(farResponder.etaMinutes > responder.etaMinutes);
});

test("a request with no coordinates still accepts, with no invented distance", async () => {
  const req = await HelpRequestModel.add({ message: "Help", latitude: undefined, longitude: undefined });
  const responder = buildDemoResponder(req);

  assert.strictEqual(responder.distanceMiles, null);
  assert.strictEqual(responder.etaMinutes, null);

  const result = await HelpRequestModel.accept(req.id, responder);
  assert.strictEqual(result.ok, true);
});
