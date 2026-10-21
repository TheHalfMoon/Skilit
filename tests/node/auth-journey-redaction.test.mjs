import assert from "node:assert/strict";
import test from "node:test";

import { createRedactor, escapeRegExp } from "../../scripts/lib/log-redaction.mjs";

const PASSWORD = "journey-password-01";
const TOKEN = "kR3w9dQm7ZpX2vBn4LkJhF6tGyU1sAeI0oCxWl";

test("a secret is redacted everywhere it appears in a chunk", () => {
  const redactor = createRedactor([PASSWORD]);
  const output = redactor.redact(`a ${PASSWORD} b ${PASSWORD} c ${PASSWORD} d`);
  assert.equal(output.includes(PASSWORD), false);
  assert.equal(output.split("<redacted>").length - 1, 3);
});

test("a secret split across two chunks is still redacted", () => {
  for (let split = 1; split < PASSWORD.length; split += 1) {
    const redactor = createRedactor([PASSWORD]);
    const first = redactor.redact(`log: ${PASSWORD.slice(0, split)}`);
    const second = redactor.redact(`${PASSWORD.slice(split)} done`);
    assert.equal(
      `${first}${second}`.includes(PASSWORD),
      false,
      `the secret leaked when split at ${split}`,
    );
  }
});

test("a secret split across two chunks is still redacted when it is longer than the password", () => {
  for (let split = 1; split < TOKEN.length; split += 1) {
    const redactor = createRedactor([PASSWORD, TOKEN]);
    const first = redactor.redact(`log: ${TOKEN.slice(0, split)}`);
    const second = redactor.redact(`${TOKEN.slice(split)} done`);
    assert.equal(
      `${first}${second}`.includes(TOKEN),
      false,
      `the token leaked when split at ${split}`,
    );
  }
});

test("a runtime secret registered after the first chunk is redacted", () => {
  const redactor = createRedactor([PASSWORD]);
  redactor.add(TOKEN);
  const output = redactor.redact(`token=${TOKEN} end`);
  assert.equal(output.includes(TOKEN), false);
});

test("the session cookie value is redacted whatever it is", () => {
  const redactor = createRedactor([PASSWORD]);
  const output = redactor.redact("set-cookie: skilit_session=abc123XYZ; path=/");
  assert.equal(output.includes("abc123XYZ"), false);
  assert.ok(output.includes("skilit_session=<redacted>"));
});

test("the held-back tail is emitted when the stream ends", () => {
  const redactor = createRedactor([PASSWORD]);
  const first = redactor.redact("plain text");
  const tail = redactor.flush();
  assert.equal(`${first}${tail}`, "plain text");
});

test("a chunk shorter than the carry is emitted once the stream ends", () => {
  const redactor = createRedactor([PASSWORD]);
  const first = redactor.redact("short");
  const tail = redactor.flush();
  assert.equal(`${first}${tail}`, "short");
});

test("an empty secret is ignored rather than redacting everything", () => {
  const redactor = createRedactor(["", PASSWORD]);
  const output = `${redactor.redact("nothing to hide here")}${redactor.flush()}`;
  assert.equal(output, "nothing to hide here");
});

test("regular expression metacharacters in a secret are escaped", () => {
  assert.equal(escapeRegExp("a.b*c"), "a\\.b\\*c");
  const redactor = createRedactor(["a.b*c"]);
  const output = redactor.redact("value a.b*c end");
  assert.equal(output.includes("a.b*c"), false);
});
