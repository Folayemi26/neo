// server/tests/geminiClient.test.js
//
// The original code tried to pick a model inside a try/catch around
// getGenerativeModel(), which never throws, so the fallback was dead code and
// a retired model name failed silently at call time. These tests pin the fix:
// a model is only trusted once it has actually answered.
const test = require("node:test");
const assert = require("node:assert");

const SDK_PATH = require.resolve("@google/generative-ai");
const CLIENT_PATH = require.resolve("../services/geminiClient");
const { SchemaType } = require("@google/generative-ai");

process.env.GEMINI_API_KEY = "test-key-not-a-real-secret";

// Installs a fake SDK whose behaviour per model name is caller-defined, and
// returns a fresh geminiClient bound to it plus a log of attempted models.
function loadClientWith(behaviour) {
  const attempted = [];

  class FakeGoogleGenerativeAI {
    getGenerativeModel({ model, generationConfig }) {
      // Deliberately does not validate the model name, exactly like the real
      // SDK. If the fallback logic depended on this throwing, it would break.
      return {
        generateContent: async (parts) => {
          attempted.push(model);
          return behaviour(model, parts, generationConfig);
        },
      };
    }
  }

  require.cache[SDK_PATH] = {
    id: SDK_PATH,
    filename: SDK_PATH,
    loaded: true,
    exports: { GoogleGenerativeAI: FakeGoogleGenerativeAI, SchemaType },
  };
  delete require.cache[CLIENT_PATH];
  const client = require(CLIENT_PATH);
  client._resetForTests();
  return { client, attempted };
}

function reply(text) {
  return { response: { text: () => text } };
}

test("walks down the model ladder until one answers", async () => {
  const { client, attempted } = loadClientWith((model) => {
    if (model === "gemini-2.0-flash") throw new Error("404 model not found");
    return reply('{"ok":true}');
  });

  const { data, model } = await client.generateJSON("prompt");

  assert.deepStrictEqual(data, { ok: true });
  assert.strictEqual(model, "gemini-2.5-flash");
  assert.strictEqual(attempted[0], "gemini-2.0-flash", "the retired model is tried first");
  assert.strictEqual(attempted[1], "gemini-2.5-flash", "then it falls through");
});

test("throws with every attempt listed when no model answers", async () => {
  const { client } = loadClientWith(() => {
    throw new Error("404 model not found");
  });

  await assert.rejects(
    () => client.generateJSON("prompt"),
    (err) => {
      assert.match(err.message, /All Gemini models failed/);
      assert.match(err.message, /gemini-2\.0-flash/);
      return true;
    }
  );
});

test("reuses a model that already answered instead of retrying failures", async () => {
  const { client, attempted } = loadClientWith((model) => {
    if (model === "gemini-2.0-flash") throw new Error("404");
    return reply('{"n":1}');
  });

  await client.generateJSON("first");
  const callsAfterFirst = attempted.length;
  await client.generateJSON("second");

  assert.strictEqual(attempted[callsAfterFirst], "gemini-2.5-flash",
    "the known-good model is tried first on the next call");
  assert.strictEqual(attempted.length, callsAfterFirst + 1,
    "the failing model is not retried");
});

test("a hanging model does not hang the caller", async () => {
  process.env.GEMINI_TIMEOUT_MS = "40";
  const { client } = loadClientWith(() => new Promise(() => {}));

  await assert.rejects(() => client.generateJSON("prompt"), /timed out/);
  delete process.env.GEMINI_TIMEOUT_MS;
});

test("passes the response schema through to the SDK", async () => {
  let seenConfig = null;
  const { client } = loadClientWith((model, parts, generationConfig) => {
    seenConfig = generationConfig;
    return reply('{"ok":true}');
  });

  const schema = { type: SchemaType.OBJECT, properties: {} };
  await client.generateJSON("prompt", { schema });

  assert.strictEqual(seenConfig.responseMimeType, "application/json");
  assert.deepStrictEqual(seenConfig.responseSchema, schema);
});

test("parses JSON even when the model wraps it in prose or fences", async () => {
  const { client } = loadClientWith(() => reply('```json\n{"category":"medical"}\n```'));
  const { data } = await client.generateJSON("prompt");
  assert.strictEqual(data.category, "medical");
});
