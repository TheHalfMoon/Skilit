import assert from "node:assert/strict";
import test from "node:test";

import { safeDestination } from "../lib/safe-destination.ts";

const ORIGIN = "https://app.example.com";

test("a sign-in destination is only ever a path inside the application", () => {
  assert.equal(safeDestination("/invite/abc", ORIGIN), "/invite/abc");
  assert.equal(
    safeDestination("/workspaces?a=1#b", ORIGIN),
    "/workspaces?a=1#b",
  );
});

test("a sign-in destination that would leave the application is refused", () => {
  // A query string is percent-decoded before the page sees it, so a
  // "%5C" arrives as a backslash — and a backslash is what a browser
  // reads as "//" in a path.
  const hostile = [
    null,
    "",
    "https://evil.example/",
    "//evil.example/",
    "/\\evil.example",
    "javascript:alert(1)",
    "invite/abc",
    "\\\\evil.example",
  ];
  for (const raw of hostile) {
    assert.equal(
      safeDestination(raw, ORIGIN),
      null,
      `${JSON.stringify(raw)} must not be a destination`,
    );
  }
  // A percent-encoded slash or backslash stays inside the path, so it is
  // a path of this application and is kept — the browser does not decode
  // it before it decides where to go.
  assert.equal(
    safeDestination("/%2F%2Fevil.example", ORIGIN),
    "/%2F%2Fevil.example",
  );
  assert.equal(
    safeDestination("/%5Cevil.example", ORIGIN),
    "/%5Cevil.example",
  );
});

test("the destination a query string carries is decoded before it is checked", () => {
  const carried = new URLSearchParams("next=/%5Cevil.example").get("next");
  assert.equal(carried, "/\\evil.example");
  assert.equal(safeDestination(carried, ORIGIN), null);
});
