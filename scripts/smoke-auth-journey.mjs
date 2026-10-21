/** Authenticated browser journey smoke.
 *
 * `node scripts/smoke-auth-journey.mjs [port]`
 *
 * Proves real, isolated, authenticated browser journeys on a clean install.
 * Five scenarios run against five disposable databases:
 *
 *   bootstrap — an empty installation: the owner creates the first account
 *     through the real form, receives a HttpOnly session cookie with no
 *     token anywhere the page can read, discovers the authorized
 *     workspace, creates a board inside it, is refused a forged
 *     workspace id, cannot distinguish an unknown email from a wrong
 *     password, and is signed out at the end.
 *
 *   expiry — an already initialized installation with a real short-remaining-
 *     lifetime session held in the browser's HttpOnly cookie: the session
 *     works while live, expires while that browser stays open, fails closed
 *     for both cookie and bearer authorization, and lets the user sign in
 *     again without reopening owner bootstrap.
 *
 *   isolation — two pre-seeded actors, each owning a real workspace: the
 *     first actor signs in through the real form, sees only its own
 *     workspace, and is refused the board collection, board creation and
 *     board item reads that target the other actor's real workspace —
 *     with the same answer it gets for a workspace that does not exist
 *     at all, so the API never reveals which workspace ids are real.
 *
 *   sessions — one account holding three genuine sessions: the browser lists
 *     only its own sessions, cannot revoke another account's session (and
 *     gets the same answer for a session id that does not exist), drives the
 *     real account page to revoke one of its own sessions, signs out every
 *     other session while staying signed in itself, and the revoked token is
 *     refused in both Bearer and Cookie mode.
 *
 *   invites — one owner with one workspace: the owner signs up through the
 *     real form, invites a second person from the workspace page, and the
 *     invited person opens the invitation link in a separate anonymous
 *     browser, reads what the invitation is, creates their account and joins
 *     the workspace. The owner then sees the new member in the roster and
 *     the invitation as accepted, and a second invitation is revoked.
 *
 * Isolation: a disposable PGlite data directory under the system temp
 * area, migrated by a short-lived child process and then opened by the web
 * server. The directories are removed on exit.
 *
 * The web server is started with the database URL variables REMOVED from
 * the environment, so this smoke can only ever reach its own disposable
 * database even when the caller's shell points at a real PostgreSQL
 * server. No production database, hosted service, user data, or network
 * egress is involved, and the run costs nothing.
 *
 * Requires the built web application (CI runs this after the production
 * build) and the pinned Playwright Chromium headless shell.
 */
import { spawn, spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import path from "node:path";
import process from "node:process";
import { fileURLToPath, pathToFileURL } from "node:url";

import { createRedactor } from "./lib/log-redaction.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const selfPath = fileURLToPath(import.meta.url);
const requireLens = createRequire(path.join(root, "packages/lens/package.json"));
const { chromium } = requireLens("playwright-core");

const ROUTES = {
  signup: "/signup",
  status: "/api/v1/auth/status",
  login: "/login",
  boards: "/boards",
  session: "/api/v1/auth/session",
  signin: "/api/v1/auth/signin",
  signout: "/api/v1/auth/signout",
  boardsApi: "/api/v1/boards",
  sessions: "/api/v1/auth/sessions",
  account: "/account",
  workspaces: "/api/v1/workspaces",
};
const OWNER_EMAIL = "owner@skilit.example";
// One credential for every fixture identity: the journeys never need two
// distinct passwords, and one value keeps the redaction assertions honest.
const PASSWORD = "journey-password-01";
const ALICE_EMAIL = "alice@skilit.example";
const EXPIRY_EMAIL = "expiry@skilit.example";
// Production TTL is unchanged. The fixture creates a legitimate ten-minute
// session with a backdated trusted server clock, so about 90 seconds of
// real lifetime remain. The margin, not the backdate, is what absorbs
// unrelated startup latency: the session is created before the server
// boots, so booting, launching Chromium and opening the database all
// come out of the remaining lifetime. Ninety seconds is roughly fifty
// times the observed startup cost, so a slow cold run cannot turn a
// timing detail into a flake.
const EXPIRY_SESSION_TTL_SECONDS = 600;
const EXPIRY_BACKDATE_MS = 510_000;
const BOB_EMAIL = "bob@skilit.example";
const SESSIONS_EMAIL = "sessions@skilit.example";
const INVITES_EMAIL = "guest@skilit.example";
const INVITES_SECOND_EMAIL = "second-guest@skilit.example";
// A second, unrelated account with a real session of its own. The journey
// tries to revoke that session from the first account's browser: the answer
// must be indistinguishable from revoking a session id that never existed,
// so the API cannot be used to discover which session ids are real.
const SESSIONS_FOREIGN_EMAIL = "sessions-foreign@skilit.example";
// The sessions journey needs no timing trick: it only revokes and inspects
// sessions that are all still live, so an ordinary lifetime is enough.
const SESSIONS_SESSION_TTL_SECONDS = 3600;
// A well-formed workspace id that belongs to nobody.
const UNKNOWN_WORKSPACE_ID = "00000000-0000-4000-8000-000000000000";
// A well-formed session id that belongs to nobody.
const UNKNOWN_SESSION_ID = "00000000-0000-4000-8000-000000000000";
// The API answers a workspace the actor cannot see and a workspace that does
// not exist identically, so a caller cannot probe which ids are real.
const DENIED_CODE = "FORBIDDEN_OR_NOT_FOUND";
const DENIED_STATUS = 404;

// ---------------------------------------------------------------- prepare
// Child phase: migrate a fresh PGlite data directory, optionally seed it,
// then exit so the web server opens the same directory without a concurrent
// writer. Prints one JSON line describing what it prepared.
if (process.argv[2] === "--prepare") {
  const dataDir = process.argv[3];
  const scenario = process.argv[4] ?? "bootstrap";
  const { openDatabase } = await import(
    pathToFileURL(path.join(root, "packages/db/src/db.ts")).href
  );
  const { migrateUp } = await import(
    pathToFileURL(path.join(root, "packages/db/src/migrate.ts")).href
  );
  const { signUp, createSession } = await import(
    pathToFileURL(path.join(root, "packages/db/src/auth.ts")).href
  );
  const { createWorkspace } = await import(
    pathToFileURL(path.join(root, "packages/db/src/workspaces.ts")).href
  );
  const db = await openDatabase({ dataDir });
  await migrateUp(db);
  const prepared = { scenario };
  if (scenario === "expiry") {
    const owner = await signUp(db, { email: EXPIRY_EMAIL, password: PASSWORD });
    const space = await createWorkspace(db, { name: "Expiry owner workspace", ownerId: owner.id });
    const { token, session } = await createSession(db, owner.id, {
      ttlSeconds: EXPIRY_SESSION_TTL_SECONDS,
      now: new Date(Date.now() - EXPIRY_BACKDATE_MS),
    });
    // Never print a live bearer token to stdout, CI logs, or a GitHub artifact.
    // The parent reads this private fixture file and the enclosing temp
    // directory is deleted after the real browser/server finish.
    writeFileSync(path.join(dataDir, ".expiry-session-token"), token, { mode: 0o600 });
    prepared.expiresAt = session.expiresAt;
    prepared.ownerWorkspaceId = space.workspace.id;
  }
  if (scenario === "sessions") {
    const owner = await signUp(db, { email: SESSIONS_EMAIL, password: PASSWORD });
    const space = await createWorkspace(db, { name: "Sessions owner workspace", ownerId: owner.id });
    // Two genuine sessions for one account: the one the browser will hold
    // and a second "other device" session the journey revokes.
    const browser = await createSession(db, owner.id, { ttlSeconds: SESSIONS_SESSION_TTL_SECONDS });
    const other = await createSession(db, owner.id, { ttlSeconds: SESSIONS_SESSION_TTL_SECONDS });
    // A third session, so the journey can drive the account page's own
    // "Revoke" button against a real row instead of only calling the API.
    const other2 = await createSession(db, owner.id, { ttlSeconds: SESSIONS_SESSION_TTL_SECONDS });
    // A real session that belongs to somebody else.
    const foreign = await signUp(db, { email: SESSIONS_FOREIGN_EMAIL, password: PASSWORD });
    const foreignSession = await createSession(db, foreign.id, {
      ttlSeconds: SESSIONS_SESSION_TTL_SECONDS,
    });
    writeFileSync(
      path.join(dataDir, ".sessions-tokens.json"),
      JSON.stringify({
        browser: browser.token,
        other: other.token,
        other2: other2.token,
        foreign: foreignSession.token,
      }),
      { mode: 0o600 },
    );
    prepared.ownerWorkspaceId = space.workspace.id;
    prepared.browserSessionId = browser.session.id;
    prepared.otherSessionId = other.session.id;
    prepared.other2SessionId = other2.session.id;
    prepared.foreignSessionId = foreignSession.session.id;
  }
  if (scenario === "isolation") {
    const alice = await signUp(db, { email: ALICE_EMAIL, password: PASSWORD });
    const bob = await signUp(db, { email: BOB_EMAIL, password: PASSWORD });
    const aliceSpace = await createWorkspace(db, { name: "Alice space", ownerId: alice.id });
    const bobSpace = await createWorkspace(db, { name: "Bob space", ownerId: bob.id });
    // A real board inside the other actor's real workspace, so the item read
    // path can be exercised and not only the collection path.
    const { createCollection } = await import(
      pathToFileURL(path.join(root, "packages/db/src/collections.ts")).href
    );
    const bobBoard = await createCollection(db, {
      workspaceId: bobSpace.workspace.id,
      title: "Bob board",
      actorId: bob.id,
    });
    prepared.aliceWorkspaceId = aliceSpace.workspace.id;
    prepared.bobWorkspaceId = bobSpace.workspace.id;
    prepared.bobBoardId = bobBoard.id;
  }
  process.stdout.write(JSON.stringify(prepared));
  process.exit(0);
}

const basePort = Number(process.env.SMOKE_PORT ?? process.argv[2] ?? 3105);
const isolationPort = basePort + 1;
const expiryPort = basePort + 2;
const sessionsPort = basePort + 3;
const invitesPort = basePort + 4;
if (
  !Number.isInteger(basePort) ||
  basePort < 1 ||
  invitesPort > 65535
) {
  console.error(`SMOKE_FAIL invalid port: ${process.argv[2] ?? ""}`);
  process.exit(2);
}

const failures = [];
function check(condition, message) {
  if (!condition) failures.push(message);
}

/**
 * Secrets that must never reach a CI log. The session token is only known
 * once the fixture is prepared, so the redactor is rebuilt with it.
 */
const redactor = createRedactor([PASSWORD]);

function redact(text) {
  return redactor.redact(text);
}

/** Emit the held-back tail once the stream has ended. */
function flushRedactionCarry() {
  return redactor.flush();
}

// The running server and its disposable data directory, so an interrupt
// tears the run down instead of leaving an orphaned server holding a port
// and a directory that contains password verifiers and session material.
let activeServer = null;
let activeDataDir = null;

function teardown() {
  if (activeServer) {
    const child = activeServer;
    child.kill("SIGTERM");
    // The escalation must hold the child itself, not the module slot that
    // is cleared immediately afterwards.
    setTimeout(() => child.kill("SIGKILL"), 5000).unref();
    activeServer = null;
  }
  if (activeDataDir) {
    rmSync(activeDataDir, { recursive: true, force: true });
    activeDataDir = null;
  }
}

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => {
    teardown();
    // Keep the event loop alive across the escalation window, so the child
    // cannot survive the parent: an immediate exit would discard the
    // pending SIGKILL timer.
    setTimeout(() => process.exit(130), 6000);
  });
}

/** The environment the web server is allowed to see. */
function serverEnv(dataDir) {
  const {
    SKILIT_MCP_DATABASE_URL: _url,
    SKELET_MCP_DATABASE_URL: _legacyUrl,
    DATABASE_URL: _plainUrl,
    ...rest
  } = process.env;
  return { ...rest, SKILIT_MCP_PGLITE_DATA_DIR: dataDir };
}

// Next.js loads `apps/web/.env*` into the process environment for keys that
// are not already set, so stripping the URL variables from the inherited
// environment is not enough: an `.env.local` on the developer's machine can
// repopulate the very key this smoke removed, and the URL takes precedence
// over the disposable data directory. The smoke would then write an owner
// account, a workspace and a board into that database. Refuse to run rather
// than risk it.
const DATABASE_URL_KEYS = [
  "SKILIT_MCP_DATABASE_URL",
  "SKELET_MCP_DATABASE_URL",
  "DATABASE_URL",
];
const NEXT_ENV_FILES = [
  ".env.production.local",
  ".env.local",
  ".env.production",
  ".env",
];

function assertNoDotenvDatabaseUrl() {
  const offenders = [];
  for (const name of NEXT_ENV_FILES) {
    const file = path.join(root, "apps", "web", name);
    if (!existsSync(file)) continue;
    const contents = readFileSync(file, "utf8");
    for (const key of DATABASE_URL_KEYS) {
      const declared = contents
        .split("\n")
        .some((line) => {
          const match = line.match(/^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=/);
          return match?.[1] === key;
        });
      if (declared) offenders.push(`apps/web/${name} sets ${key}`);
    }
  }
  if (offenders.length > 0) {
    throw new Error(
      `refusing to run: ${offenders.join("; ")} — the web server would open that database instead of the disposable one`,
    );
  }
}

/** One in-page request, returning the status and the parsed body. */
async function apiCall(page, url, init) {
  return page.evaluate(
    async ({ target, options }) => {
      const response = await fetch(target, options);
      const body = await response.json().catch(() => null);
      return { status: response.status, body };
    },
    { target: url, options: init ?? {} },
  );
}

async function prepareDatabase(scenario) {
  const dataDir = mkdtempSync(path.join(tmpdir(), "skilit-auth-journey-"));
  const prepare = spawnSync(
    process.execPath,
    ["--experimental-strip-types", selfPath, "--prepare", dataDir, scenario],
    { encoding: "utf8" },
  );
  if (prepare.status !== 0) {
    rmSync(dataDir, { recursive: true, force: true });
    throw new Error(
      `could not prepare the isolated database: ${prepare.stderr || prepare.stdout}`,
    );
  }
  const prepared = JSON.parse(prepare.stdout);
  if (scenario === "expiry") {
    prepared.privateFixtureToken = readFileSync(
      path.join(dataDir, ".expiry-session-token"), "utf8",
    );
    // The live session token must never reach a log, even if the server
    // ever echoed it.
    redactor.add(prepared.privateFixtureToken);
  }
  if (scenario === "sessions") {
    // One private fixture file holds every token, so nothing can be
    // forgotten when the set changes.
    const tokens = JSON.parse(
      readFileSync(path.join(dataDir, ".sessions-tokens.json"), "utf8"),
    );
    prepared.browserToken = tokens.browser;
    prepared.otherToken = tokens.other;
    prepared.other2Token = tokens.other2;
    prepared.foreignToken = tokens.foreign;
    for (const token of Object.values(tokens)) redactor.add(token);
  }
  return { dataDir, prepared };
}

async function runScenario(name, port, journey) {
  assertNoDotenvDatabaseUrl();
  const { dataDir, prepared } = await prepareDatabase(name);
  let server = null;
  let browser = null;
  let output = "";
  try {
    server = spawn(
      process.execPath,
      // The throwaway server is bound to loopback only: nothing on the
      // local network can reach it while it holds a published password.
      ["node_modules/next/dist/bin/next", "start", "-p", String(port), "-H", "127.0.0.1"],
      {
        cwd: path.join(root, "apps/web"),
        stdio: ["ignore", "pipe", "pipe"],
        env: serverEnv(dataDir),
      },
    );
    activeServer = server;
    activeDataDir = dataDir;
    // The server output is mirrored into CI logs, so it is redacted on the
    // way out rather than checked after the fact: a check that fires after
    // the secret has already been published protects nothing.
    const capture = (chunk) => {
      const text = chunk.toString();
      output += text;
      process.stdout.write(`[web] ${redact(text)}`);
    };
    server.stdout.on("data", capture);
    server.stderr.on("data", capture);
    let exited = false;
    server.on("exit", () => {
      exited = true;
      const tail = flushRedactionCarry();
      if (tail !== "") process.stdout.write(`[web] ${tail}`);
    });
    const deadline = Date.now() + 120_000;
    for (;;) {
      if (exited) throw new Error("server exited before it became ready");
      try {
        const response = await fetch(`http://127.0.0.1:${port}/api/health`);
        if (response.ok) break;
      } catch {
        /* keep polling */
      }
      if (Date.now() > deadline) throw new Error("timed out waiting for the web server");
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
    browser = await chromium.launch({ headless: true });
    const context = await browser.newContext();
    const page = await context.newPage();
    await journey({ page, context, base: `http://127.0.0.1:${port}`, prepared });
    // The server output is mirrored into CI logs, so it must not carry a
    // session cookie or a session token.
    check(
      !output.includes("skilit_session="),
      "the web server output must not contain a session cookie",
    );
    check(
      !output.includes(PASSWORD),
      "the web server output must not contain a session password",
    );
    // Every token the fixture minted must not have reached the log. The
    // expiry scenario keeps its token in a private field; the sessions
    // scenario mints four.
    const fixtureTokens = [
      prepared.privateFixtureToken,
      prepared.browserToken,
      prepared.otherToken,
      prepared.other2Token,
      prepared.foreignToken,
    ].filter((token) => typeof token === "string" && token.length > 0);
    for (const token of fixtureTokens) {
      check(
        !output.includes(token),
        "the web server output must not contain a session token",
      );
    }
  } finally {
    if (browser) await browser.close();
    if (server) {
      server.kill("SIGTERM");
      setTimeout(() => server.kill("SIGKILL"), 5000).unref();
    }
    if (activeServer === server) activeServer = null;
    rmSync(dataDir, { recursive: true, force: true });
    if (activeDataDir === dataDir) activeDataDir = null;
  }
}

// ---------------------------------------------------------------- bootstrap
async function bootstrapJourney({ page, context, base }) {
  await page.goto(base + ROUTES.signup, { waitUntil: "load" });
  // --- A. public bootstrap status before the first owner exists ----------
  const freshStatus = await apiCall(page, ROUTES.status);
  check(
    freshStatus.status === 200 && freshStatus.body?.result?.initialized === false,
    "an empty installation must report initialized:false with HTTP 200",
  );
  // --- B. owner bootstrap through the real form -------------------------
  await page.fill("#signup-email", OWNER_EMAIL);
  await page.fill("#signup-password", PASSWORD);
  await page.click("form button[type=submit]");
  await page.waitForSelector("div[aria-live='polite'] p", { timeout: 20_000 });
  const notice = (await page.textContent("div[aria-live='polite'] p")) ?? "";
  check(
    notice.includes("Owner account created and signed in"),
    `sign-up did not report success: ${notice}`,
  );
  check(
    (await page.locator("p[role='alert']").count()) === 0,
    "sign-up reported an error instead of succeeding",
  );

  const initializedStatus = await apiCall(page, ROUTES.status);
  check(
    initializedStatus.status === 200 && initializedStatus.body?.result?.initialized === true,
    "creating the owner must permanently close bootstrap and report initialized:true",
  );

  const cookies = await context.cookies();
  const session = cookies.find((cookie) => cookie.name === "skilit_session");
  check(session !== undefined, "no skilit_session cookie was set");
  check(session?.httpOnly === true, "the session cookie must be HttpOnly");
  check(
    (session?.sameSite ?? "").toLowerCase() === "lax",
    `the session cookie must be SameSite=Lax, saw ${session?.sameSite}`,
  );

  // The session token must not be readable anywhere the page can reach:
  // not in document.cookie under any name, and not under any storage key.
  const token = session?.value ?? "";
  const readable = await page.evaluate((value) => {
    const storageValues = [
      ...Object.entries(window.localStorage),
      ...Object.entries(window.sessionStorage),
    ];
    return {
      inCookieJar: window.document.cookie.includes(value),
      inStorage: storageValues.some(([, stored]) => stored.includes(value)),
      storageKeys: [
        ...Object.keys(window.localStorage),
        ...Object.keys(window.sessionStorage),
      ],
    };
  }, token);
  check(token.length > 0, "the session cookie must carry a value");
  check(
    !readable.inCookieJar,
    "the session token must not be readable from document.cookie",
  );
  check(
    !readable.inStorage,
    `the session token must not be persisted in browser storage, found it in ${readable.storageKeys.join(", ")}`,
  );

  // --- B. authorized session -------------------------------------------
  const sessionResponse = await apiCall(page, ROUTES.session);
  check(sessionResponse.status === 200, `session status must be 200, saw ${sessionResponse.status}`);
  const sessionResult = sessionResponse.body?.result ?? {};
  check(
    sessionResult?.user?.email === OWNER_EMAIL,
    `session must report the owner identity, saw ${JSON.stringify(sessionResult?.user)}`,
  );
  const workspaces = sessionResult?.workspaces ?? [];
  check(workspaces.length === 1, `expected exactly one authorized workspace, saw ${workspaces.length}`);
  const workspaceId = workspaces[0]?.id ?? "";
  check(workspaceId.length > 0, "the authorized workspace must expose an id");

  // --- C. authorized workspace use --------------------------------------
  await page.goto(base + ROUTES.boards, { waitUntil: "load" });
  // The selector fills from a client-side session fetch, so wait for the
  // value instead of racing it.
  await page
    .waitForFunction(
      () => (document.querySelector("select")?.value ?? "") !== "",
      undefined,
      { timeout: 20_000 },
    )
    .catch(() => {});
  const selected = await page.evaluate(() => {
    const select = document.querySelector("select");
    return select ? select.value : "";
  });
  check(
    selected === workspaceId,
    `the workspace selector must auto-select the authorized workspace, saw "${selected}"`,
  );

  const created = await apiCall(page, ROUTES.boardsApi, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ workspaceId, title: "Journey board", visibility: "workspace" }),
  });
  check(
    created.status === 201,
    `board creation in the authorized workspace must answer 201, saw ${created.status}`,
  );

  // --- D. a workspace the actor cannot see is refused --------------------
  const denied = await apiCall(page, ROUTES.boardsApi, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      workspaceId: UNKNOWN_WORKSPACE_ID,
      title: "Unknown workspace board",
      visibility: "workspace",
    }),
  });
  check(
    denied.status === DENIED_STATUS && denied.body?.error?.code === DENIED_CODE,
    `an unseen workspace must answer ${DENIED_STATUS} ${DENIED_CODE}, saw ${denied.status} ${denied.body?.error?.code}`,
  );

  // --- E. an invalid sign-in does not enumerate users ---------------------
  const signin = await page.evaluate(
    async ({ path, email, password, wrongEmail }) => {
      const post = async (address, secret) => {
        const response = await fetch(path, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email: address, password: secret }),
        });
        const body = await response.json().catch(() => null);
        return {
          status: response.status,
          code: body?.error?.code ?? null,
          message: body?.error?.message ?? null,
        };
      };
      return {
        wrongPassword: await post(email, "definitely-not-the-password"),
        unknownEmail: await post(wrongEmail, password),
      };
    },
    {
      path: ROUTES.signin,
      email: OWNER_EMAIL,
      password: PASSWORD,
      wrongEmail: "nobody@skilit.example",
    },
  );
  check(
    signin.wrongPassword.status === 400 && signin.wrongPassword.code === "INVALID_INPUT",
    `a wrong password must answer 400 INVALID_INPUT, saw ${signin.wrongPassword.status} ${signin.wrongPassword.code}`,
  );
  check(
    signin.wrongPassword.status === signin.unknownEmail.status,
    `wrong password and unknown email must answer the same status, saw ${signin.wrongPassword.status} and ${signin.unknownEmail.status}`,
  );
  check(
    signin.wrongPassword.code === signin.unknownEmail.code,
    `wrong password and unknown email must answer the same error code, saw ${signin.wrongPassword.code} and ${signin.unknownEmail.code}`,
  );
  check(
    signin.wrongPassword.message === signin.unknownEmail.message,
    `wrong password and unknown email must answer the same message, saw "${signin.wrongPassword.message}" and "${signin.unknownEmail.message}"`,
  );

  // --- F. sign-out ends the session --------------------------------------
  const signedOut = await apiCall(page, ROUTES.signout, { method: "POST" });
  check(signedOut.status === 200, `sign-out must succeed, saw ${signedOut.status}`);
  const afterSignOut = await apiCall(page, ROUTES.session);
  check(
    afterSignOut.status === 401,
    `the session must be gone after sign-out, saw ${afterSignOut.status}`,
  );
  const cleared = (await context.cookies()).find(
    (cookie) => cookie.name === "skilit_session" && cookie.value !== "",
  );
  check(cleared === undefined, "sign-out must clear the session cookie");
  const afterSignoutStatus = await apiCall(page, ROUTES.status);
  check(
    afterSignoutStatus.status === 200 &&
      afterSignoutStatus.body?.result?.initialized === true,
    "sign-out must not reopen owner bootstrap",
  );
  // The revoked token must not work again, even if it is presented
  // directly.
  const revoked = await apiCall(page, ROUTES.session, {
    headers: { Authorization: `Bearer ${token}` },
  });
  check(
    revoked.status === 401,
    `a revoked session token must be refused, saw ${revoked.status}`,
  );
}

// ---------------------------------------------------------------- isolation
async function isolationJourney({ page, context, base, prepared }) {
  const { aliceWorkspaceId, bobWorkspaceId, bobBoardId } = prepared;
  check(
    typeof aliceWorkspaceId === "string" && typeof bobWorkspaceId === "string",
    "the isolation fixture must provide two real workspace ids",
  );
  check(
    aliceWorkspaceId !== bobWorkspaceId,
    "the two actors must own different workspaces",
  );
  check(
    typeof bobBoardId === "string" && bobBoardId.length > 0,
    "the isolation fixture must provide a real board id in the other actor's workspace",
  );

  // --- A. sign in as the first actor through the real form ---------------
  await page.goto(base + ROUTES.login, { waitUntil: "load" });
  await page.fill("#login-email", ALICE_EMAIL);
  await page.fill("#login-password", PASSWORD);
  await page.click("form button[type=submit]");
  await page.waitForSelector("div[aria-live='polite'] p", { timeout: 20_000 });
  const notice = (await page.textContent("div[aria-live='polite'] p")) ?? "";
  check(notice.includes("Signed in"), `sign-in did not report success: ${notice}`);

  const sessionCookie = (await context.cookies()).find(
    (cookie) => cookie.name === "skilit_session",
  );
  check(sessionCookie?.httpOnly === true, "the session cookie must be HttpOnly");

  // --- B. the session exposes only the actor's own workspace --------------
  const sessionResponse = await apiCall(page, ROUTES.session);
  check(sessionResponse.status === 200, `session status must be 200, saw ${sessionResponse.status}`);
  const workspaces = sessionResponse.body?.result?.workspaces ?? [];
  check(workspaces.length === 1, `the actor must see exactly one workspace, saw ${workspaces.length}`);
  check(
    workspaces[0]?.id === aliceWorkspaceId,
    `the actor must see its own workspace, saw ${workspaces[0]?.id}`,
  );
  check(
    !workspaces.some((workspace) => workspace.id === bobWorkspaceId),
    "the other actor's workspace must not appear in the session",
  );

  // --- C. every access to the other actor's real workspace is denied -----
  // The request shape is identical to the own-workspace request that
  // succeeds below, so the only difference is the workspace id: the denial
  // is a workspace-authorization decision, not input validation.
  const crossWrite = await apiCall(page, ROUTES.boardsApi, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      workspaceId: bobWorkspaceId,
      title: "Cross workspace",
      visibility: "workspace",
    }),
  });
  check(
    crossWrite.status === DENIED_STATUS && crossWrite.body?.error?.code === DENIED_CODE,
    `writing into the other actor's workspace must answer ${DENIED_STATUS} ${DENIED_CODE}, saw ${crossWrite.status} ${crossWrite.body?.error?.code}`,
  );

  const crossRead = await apiCall(
    page,
    `${ROUTES.boardsApi}?workspaceId=${encodeURIComponent(bobWorkspaceId)}`,
  );
  check(
    crossRead.status === DENIED_STATUS && crossRead.body?.error?.code === DENIED_CODE,
    `reading the other actor's workspace must answer ${DENIED_STATUS} ${DENIED_CODE}, saw ${crossRead.status} ${crossRead.body?.error?.code}`,
  );

  // The read path must not reveal which workspace ids are real either, so
  // the unknown workspace is read with the identical request shape and the
  // two answers are compared, not just their status.
  const unknownRead = await apiCall(
    page,
    `${ROUTES.boardsApi}?workspaceId=${encodeURIComponent(UNKNOWN_WORKSPACE_ID)}`,
  );
  check(
    unknownRead.status === crossRead.status &&
      unknownRead.body?.error?.code === crossRead.body?.error?.code &&
      unknownRead.body?.error?.message === crossRead.body?.error?.message,
    `reading a workspace that does not exist must be answered exactly like one the actor cannot see, saw ${JSON.stringify(unknownRead.body?.error)} against ${JSON.stringify(crossRead.body?.error)}`,
  );

  // A workspace that does not exist at all must be answered identically, so
  // the API never reveals which workspace ids are real.
  const unknownWrite = await apiCall(page, ROUTES.boardsApi, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      workspaceId: UNKNOWN_WORKSPACE_ID,
      title: "Unknown workspace",
      visibility: "workspace",
    }),
  });
  check(
    unknownWrite.status === crossWrite.status &&
      unknownWrite.body?.error?.code === crossWrite.body?.error?.code &&
      unknownWrite.body?.error?.message === crossWrite.body?.error?.message,
    `a workspace that does not exist must be answered exactly like one the actor cannot see, saw ${JSON.stringify(unknownWrite.body?.error)} against ${JSON.stringify(crossWrite.body?.error)}`,
  );

  // A single board inside the other actor's real workspace is refused on the
  // item read path too, not only on the collection path.
  const crossItemRead = await apiCall(
    page,
    `${ROUTES.boardsApi}/${encodeURIComponent(bobBoardId)}?workspaceId=${encodeURIComponent(bobWorkspaceId)}`,
  );
  check(
    crossItemRead.status === DENIED_STATUS && crossItemRead.body?.error?.code === DENIED_CODE,
    `reading a board in the other actor's workspace must answer ${DENIED_STATUS} ${DENIED_CODE}, saw ${crossItemRead.status} ${crossItemRead.body?.error?.code}`,
  );

  // --- D. the actor's own workspace still works ---------------------------
  const ownWrite = await apiCall(page, ROUTES.boardsApi, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      workspaceId: aliceWorkspaceId,
      title: "Own workspace",
      visibility: "workspace",
    }),
  });
  check(
    ownWrite.status === 201,
    `writing into the actor's own workspace must answer 201, saw ${ownWrite.status}`,
  );

  // Positive control: the same item route answers 200 for a board the actor
  // may read, so the denials above are authorization decisions and not a
  // route that answers 404 for everyone.
  const ownBoardId = ownWrite.body?.result?.board?.id;
  check(
    typeof ownBoardId === "string" && ownBoardId.length > 0,
    `the created board must expose its id, saw ${JSON.stringify(ownWrite.body?.result?.board?.id)}`,
  );
  const ownItemRead = await apiCall(
    page,
    `${ROUTES.boardsApi}/${encodeURIComponent(ownBoardId)}?workspaceId=${encodeURIComponent(aliceWorkspaceId)}`,
  );
  check(
    ownItemRead.status === 200,
    `reading a board in the actor's own workspace must answer 200, saw ${ownItemRead.status}`,
  );
}

// -------------------------------------------------------------- session expiry
async function expiryJourney({ page, context, base, prepared }) {
  const { expiresAt, ownerWorkspaceId, privateFixtureToken } = prepared;
  check(
    typeof privateFixtureToken === "string" && privateFixtureToken.length > 32,
    "expiry fixture must provide a genuine opaque token",
  );
  const expiryTime = Date.parse(expiresAt);
  check(Number.isFinite(expiryTime), "expiry fixture must have a valid server expiry timestamp");

  // Put a legitimate DB-issued session into the browser's HttpOnly cookie.
  // This is NOT a UI signin journey; bootstrap/isolation already test the UI.
  // The browser retains the cookie even after the DB session stops being live.
  await context.addCookies([{
    name: "skilit_session",
    value: privateFixtureToken,
    url: base,
    httpOnly: true,
    sameSite: "Lax",
  }]);
  await page.goto(base + ROUTES.login, { waitUntil: "load" });
  const live = await apiCall(page, ROUTES.session);
  check(live.status === 200, `the fixture session must initially be live, saw ${live.status}`);
  check(
    live.body?.result?.user?.email === EXPIRY_EMAIL,
    "the live fixture session must identify the pre-seeded owner",
  );
  const beforeStatus = await apiCall(page, ROUTES.status);
  check(
    beforeStatus.status === 200 && beforeStatus.body?.result?.initialized === true,
    "auth/status must report initialized:true during a live session",
  );

  // Wait until *the actual database timestamp*, not a mock clock or a
  // database mutation while PGlite is opened by the Next.js server.
  // Allow up to one minute of additional CI slowness, but fail if the
  // session was already expired before the browser could own it.
  const waitMs = expiryTime - Date.now() + 1_500;
  check(waitMs > 0, "fixture session expired before the browser exercised it");
  if (waitMs > 0) {
    await new Promise((resolve) => setTimeout(resolve, waitMs));
  }
  const heldCookie = (await context.cookies()).find(
    (cookie) => cookie.name === "skilit_session",
  );
  check(
    heldCookie?.httpOnly === true && heldCookie.value === privateFixtureToken,
    "the browser must still hold the expired HttpOnly cookie",
  );

  const expired = await apiCall(page, ROUTES.session);
  check(
    expired.status === 401 && expired.body?.error?.code === "UNAUTHENTICATED",
    `expired cookie must fail closed with 401 UNAUTHENTICATED, saw ${expired.status} ${expired.body?.error?.code}`,
  );
  const deniedBoards = await apiCall(
    page, `${ROUTES.boardsApi}?workspaceId=${encodeURIComponent(ownerWorkspaceId)}`,
  );
  check(
    deniedBoards.status === 401,
    `expired cookie must not read its former workspace, saw ${deniedBoards.status}`,
  );
  const expiredBearer = await apiCall(page, ROUTES.session, {
    headers: { Authorization: `Bearer ${privateFixtureToken}` },
  });
  check(
    expiredBearer.status === 401,
    `an expired token must also be refused in Bearer mode, saw ${expiredBearer.status}`,
  );

  const afterStatus = await apiCall(page, ROUTES.status);
  check(
    afterStatus.status === 200 && afterStatus.body?.result?.initialized === true,
    "auth/status must stay initialized:true when a session expires",
  );
  // Reloading the *same tab* must show a recoverable, signed-out UI.
  await page.reload({ waitUntil: "load" });
  await page.getByText("No active session in this browser.").waitFor({ timeout: 20_000 });
  await page.fill("#login-email", EXPIRY_EMAIL);
  await page.fill("#login-password", PASSWORD);
  await page.click("form button[type=submit]");
  await page.getByText(/Signed in as/).waitFor({ timeout: 20_000 });
  const recovered = await apiCall(page, ROUTES.session);
  check(
    recovered.status === 200 && recovered.body?.result?.user?.email === EXPIRY_EMAIL,
    "the same browser must recover by signing in normally after expiry",
  );
  const freshCookie = (await context.cookies()).find(
    (cookie) => cookie.name === "skilit_session",
  );
  check(
    freshCookie?.httpOnly === true && freshCookie.value !== privateFixtureToken,
    "recovery must replace the expired token with a new HttpOnly cookie",
  );
  const ownerBoards = await apiCall(
    page, `${ROUTES.boardsApi}?workspaceId=${encodeURIComponent(ownerWorkspaceId)}`,
  );
  check(
    ownerBoards.status === 200,
    `recovered owner session must restore authorized workspace access, saw ${ownerBoards.status}`,
  );
}

// ------------------------------------------------------------------ sessions
async function sessionsJourney({ page, context, base, prepared }) {
  const {
    browserToken,
    otherToken,
    other2Token,
    foreignToken,
    browserSessionId,
    otherSessionId,
    other2SessionId,
    foreignSessionId,
    ownerWorkspaceId,
  } = prepared;
  check(
    typeof browserToken === "string" && browserToken.length > 32,
    "sessions fixture must provide a genuine opaque browser token",
  );
  for (const [name, token] of [
    ["second", otherToken],
    ["third", other2Token],
    ["foreign", foreignToken],
  ]) {
    check(
      typeof token === "string" && token.length > 32,
      `sessions fixture must provide a genuine opaque ${name} token`,
    );
  }
  check(
    browserSessionId !== otherSessionId && browserSessionId !== other2SessionId,
    "the fixture must create distinct sessions for one account",
  );

  // Put the browser's own session into the HttpOnly cookie, exactly as the
  // real sign-in flow would.
  await context.addCookies([{
    name: "skilit_session",
    value: browserToken,
    url: base,
    httpOnly: true,
    sameSite: "Lax",
  }]);
  await page.goto(base + ROUTES.login, { waitUntil: "load" });

  // --- A. the account lists its own sessions ---------------------------
  const listed = await apiCall(page, ROUTES.sessions);
  check(listed.status === 200, `listing sessions must answer 200, saw ${listed.status}`);
  const result = listed.body?.result ?? {};
  const sessions = result.sessions ?? [];
  check(sessions.length === 3, `the account must list exactly three sessions, saw ${sessions.length}`);
  check(
    result.currentSessionId === browserSessionId,
    `the list must name the presenting session as current, saw ${result.currentSessionId}`,
  );
  const ids = sessions.map((session) => session.id);
  check(ids.includes(browserSessionId), "the list must contain the browser's own session");
  check(ids.includes(otherSessionId), "the list must contain the second session");
  check(ids.includes(other2SessionId), "the list must contain the third session");
  check(
    !ids.includes(foreignSessionId),
    "the list must never contain another account's session",
  );
  check(
    sessions.every((session) => typeof session.live === "boolean"),
    "every listed session must carry a liveness flag",
  );
  check(
    sessions.every((session) => session.token === undefined && session.tokenHash === undefined),
    "the list must never expose a session token or its hash",
  );

  // --- B. another account's session cannot be revoked -------------------
  const foreignRevoke = await apiCall(
    page,
    `${ROUTES.sessions}/${encodeURIComponent(foreignSessionId)}`,
    { method: "DELETE" },
  );
  check(
    foreignRevoke.status === DENIED_STATUS && foreignRevoke.body?.error?.code === DENIED_CODE,
    `revoking another account's session must answer ${DENIED_STATUS} ${DENIED_CODE}, saw ${foreignRevoke.status} ${foreignRevoke.body?.error?.code}`,
  );
  // An invented session id must be answered exactly the same way, so the
  // API never reveals which session ids are real.
  const unknownRevoke = await apiCall(
    page,
    `${ROUTES.sessions}/${encodeURIComponent(UNKNOWN_SESSION_ID)}`,
    { method: "DELETE" },
  );
  check(
    unknownRevoke.status === foreignRevoke.status &&
      unknownRevoke.body?.error?.code === foreignRevoke.body?.error?.code &&
      unknownRevoke.body?.error?.message === foreignRevoke.body?.error?.message,
    `an invented session id must be answered exactly like another account's session, saw ${JSON.stringify(unknownRevoke.body?.error)} against ${JSON.stringify(foreignRevoke.body?.error)}`,
  );
  // The foreign session must still be usable: the refusal did not revoke it.
  const foreignBearer = await apiCall(page, ROUTES.session, {
    headers: { Authorization: `Bearer ${foreignToken}` },
  });
  check(
    foreignBearer.status === 200,
    `the second account's session must still be live, saw ${foreignBearer.status}`,
  );

  // --- C. the account page renders the sessions and revokes one --------
  // The page is driven for real, not only through the API: the row the
  // browser acts on is the row the page rendered.
  await page.goto(base + ROUTES.account, { waitUntil: "load" });
  await page.waitForSelector("table tbody tr", { timeout: 20_000 });
  const rowCount = await page.locator("table tbody tr").count();
  check(rowCount === 3, `the account page must render three sessions, saw ${rowCount}`);
  const pageText = (await page.textContent("table")) ?? "";
  check(pageText.includes(browserSessionId), "the account page must show the browser's own session");
  check(pageText.includes(otherSessionId), "the account page must show the second session");
  check(pageText.includes(other2SessionId), "the account page must show the third session");
  check(pageText.includes("this browser"), "the account page must mark the current session");
  // The whole rendered page, not only the table: a token must not reach
  // any part of the document.
  const rendered = (await page.content()) ?? "";
  for (const [name, token] of [
    ["browser", browserToken],
    ["second", otherToken],
    ["third", other2Token],
    ["foreign", foreignToken],
  ]) {
    check(
      !rendered.includes(token),
      `the account page must never render the ${name} session token`,
    );
  }

  const thirdRow = page.locator("table tbody tr", {
    has: page.locator(`code:text-is("${other2SessionId}")`),
  });
  check((await thirdRow.count()) === 1, "the account page must render a row for the third session");
  await thirdRow.locator("button").click();
  await page.waitForFunction(
    () =>
      (document.querySelector("div[aria-live='polite']")?.textContent ?? "").includes("Session revoked."),
    undefined,
    { timeout: 20_000 },
  );
  // Scoped to the page: Next.js renders its own always-present, empty
  // route announcer as a `div[role=alert]` outside the page content.
  const pageAlerts = await page.locator("main [role='alert']").allTextContents();
  check(
    pageAlerts.length === 0,
    "revoking a session from the account page must not report an error: " +
      JSON.stringify(pageAlerts),
  );
  // The State column must describe the row the browser just acted on.
  const revokedRowText =
    (await page
      .locator("table tbody tr", { has: page.locator(`code:text-is("${other2SessionId}")`) })
      .textContent()) ?? "";
  check(
    revokedRowText.includes("Revoked"),
    `the revoked row must say Revoked, saw "${revokedRowText.trim()}"`,
  );
  const liveRowText =
    (await page
      .locator("table tbody tr", { has: page.locator(`code:text-is("${otherSessionId}")`) })
      .textContent()) ?? "";
  check(
    liveRowText.includes("Signed in"),
    `a session that is still live must say Signed in, saw "${liveRowText.trim()}"`,
  );

  // The API must agree with what the page just did.
  const afterUiRevoke = await apiCall(page, ROUTES.sessions);
  const afterUiSessions = afterUiRevoke.body?.result?.sessions ?? [];
  const uiRevoked = afterUiSessions.find((session) => session.id === other2SessionId);
  check(
    uiRevoked?.revokedAt !== null && uiRevoked?.revokedAt !== undefined,
    "the session the page revoked must be revoked in the API too",
  );
  check(uiRevoked?.live === false, "the session the page revoked must not be live");
  const uiRevokedBearer = await apiCall(page, ROUTES.session, {
    headers: { Authorization: `Bearer ${other2Token}` },
  });
  check(
    uiRevokedBearer.status === 401,
    `the token of the session the page revoked must be refused, saw ${uiRevokedBearer.status}`,
  );

  // --- D. the page's "sign out everywhere else" keeps this browser in --
  // The button is clicked, not only the endpoint behind it.
  await page.getByRole("button", { name: "Sign out of all other sessions" }).click();
  await page.waitForFunction(
    () =>
      (document.querySelector("div[aria-live='polite']")?.textContent ?? "").includes(
        "Signed out 1 other session(s).",
      ),
    undefined,
    { timeout: 20_000 },
  );
  const bulkAlerts = await page.locator("main [role='alert']").allTextContents();
  check(
    bulkAlerts.length === 0,
    "signing out of the other sessions must not report an error: " + JSON.stringify(bulkAlerts),
  );

  const afterBulk = await apiCall(page, ROUTES.sessions);
  const afterBulkSessions = afterBulk.body?.result?.sessions ?? [];
  const bulkRevoked = afterBulkSessions.find((session) => session.id === otherSessionId);
  check(
    bulkRevoked?.revokedAt !== null && bulkRevoked?.revokedAt !== undefined,
    "the session the page signed out must be revoked in the API too",
  );
  check(bulkRevoked?.live === false, "the session the page signed out must not be live");
  const bulkLive = afterBulkSessions.find((session) => session.id === browserSessionId);
  check(bulkLive?.live === true, "the calling browser's session must survive the bulk revoke");

  const stillLive = await apiCall(page, ROUTES.session);
  check(
    stillLive.status === 200 && stillLive.body?.result?.user?.email === SESSIONS_EMAIL,
    `the calling browser must stay signed in, saw ${stillLive.status}`,
  );
  const boards = await apiCall(
    page,
    `${ROUTES.boardsApi}?workspaceId=${encodeURIComponent(ownerWorkspaceId)}`,
  );
  check(
    boards.status === 200,
    `the calling browser must keep its workspace access, saw ${boards.status}`,
  );

  // --- E. the endpoint behind that button is idempotent ----------------
  const revokedOthers = await apiCall(page, ROUTES.sessions, { method: "DELETE" });
  check(
    revokedOthers.status === 200,
    `signing out of the other sessions must answer 200, saw ${revokedOthers.status}`,
  );
  check(
    revokedOthers.body?.result?.revoked === 0,
    `nothing is left to revoke, saw ${revokedOthers.body?.result?.revoked}`,
  );
  check(
    revokedOthers.body?.result?.signedOut === false,
    "signing out of the other sessions must not sign the caller out",
  );

  // --- F. the revoked session is refused everywhere ---------------------
  const revokedBearer = await apiCall(page, ROUTES.session, {
    headers: { Authorization: `Bearer ${otherToken}` },
  });
  check(
    revokedBearer.status === 401,
    `a revoked session token must be refused in Bearer mode, saw ${revokedBearer.status}`,
  );
  // Cookie mode is checked in a separate browser context: a page cannot
  // overwrite its own `Cookie` header from fetch, so the revoked token has
  // to be carried by a context that never held the live one.
  const browser = context.browser();
  check(browser !== null, "the browser context must expose its browser");
  if (browser !== null) {
    const revokedContext = await browser.newContext();
    try {
      await revokedContext.addCookies([{
        name: "skilit_session",
        value: otherToken,
        url: base,
        httpOnly: true,
        sameSite: "Lax",
      }]);
      const revokedPage = await revokedContext.newPage();
      await revokedPage.goto(base + ROUTES.login, { waitUntil: "load" });
      const revokedCookie = await apiCall(revokedPage, ROUTES.session);
      check(
        revokedCookie.status === 401,
        `a revoked session token must be refused in Cookie mode, saw ${revokedCookie.status}`,
      );
    } finally {
      await revokedContext.close();
    }
  }

  // --- G. the revoked sessions are still visible, marked revoked ---------
  const relisted = await apiCall(page, ROUTES.sessions);
  check(relisted.status === 200, `re-listing sessions must answer 200, saw ${relisted.status}`);
  const relistedSessions = relisted.body?.result?.sessions ?? [];
  check(
    relistedSessions.length === 3,
    `a revoked session must stay listed, saw ${relistedSessions.length}`,
  );
  for (const revokedId of [otherSessionId, other2SessionId]) {
    const revokedEntry = relistedSessions.find((session) => session.id === revokedId);
    check(revokedEntry !== undefined, "the revoked session must still be listed");
    check(
      revokedEntry?.revokedAt !== null && revokedEntry?.revokedAt !== undefined,
      "the revoked session must carry a revocation timestamp",
    );
    check(revokedEntry?.live === false, "the revoked session must not be reported as live");
  }
  const liveEntry = relistedSessions.find((session) => session.id === browserSessionId);
  check(liveEntry?.live === true, "the calling browser's session must still be live");
}


// ------------------------------------------------------------------- invites
async function invitesJourney({ page, context, base }) {
  // --- A. the owner signs up through the real form ----------------------
  await page.goto(base + ROUTES.signup, { waitUntil: "load" });
  await page.fill("#signup-email", "invites-owner@skilit.example");
  await page.fill("#signup-password", PASSWORD);
  await page.click("form button[type=submit]");
  await page.waitForSelector("div[aria-live='polite'] p", { timeout: 20_000 });
  const signupNotice = (await page.textContent("div[aria-live='polite'] p")) ?? "";
  check(
    signupNotice.includes("Owner account created and signed in"),
    `the owner sign-up did not report success: ${signupNotice}`,
  );

  // --- B. the owner invites a second person ----------------------------
  await page.goto(base + "/workspaces", { waitUntil: "load" });
  // The selector renders a placeholder option first, so wait for the
  // choice itself rather than for the option list.
  await page
    .waitForFunction(
      () => {
        const select = document.querySelector("#workspaces-picker");
        return select instanceof HTMLSelectElement && select.value !== "";
      },
      undefined,
      { timeout: 20_000 },
    )
    .catch(() => {});
  const workspaceId = await page.evaluate(() => {
    const select = document.querySelector("#workspaces-picker");
    return select instanceof HTMLSelectElement ? select.value : "";
  });
  check(workspaceId.length > 0, "the workspace selector must choose the owner's workspace");

  await page.fill("#workspaces-email", INVITES_EMAIL);
  await page.getByRole("button", { name: "Create invitation" }).click();
  await page.waitForSelector("#workspaces-invite-link", { timeout: 20_000 });
  const inviteLink = (await page.inputValue("#workspaces-invite-link")) ?? "";
  check(inviteLink.includes("/invite/"), `the invitation link is malformed: "${inviteLink}"`);
  const token = inviteLink.slice(inviteLink.lastIndexOf("/invite/") + "/invite/".length);
  check(token.length >= 32, "the invitation link must carry a long token");

  // The invitation list shows it as pending.
  await page.waitForSelector("section[aria-label='Invitations'] table tbody tr", { timeout: 20_000 });
  const invitationsText =
    (await page.textContent("section[aria-label='Invitations']")) ?? "";
  check(invitationsText.includes(INVITES_EMAIL), "the invitation list must name the invited address");
  check(invitationsText.includes("pending"), "the invitation must be pending");

  // --- C. the invited person accepts in a separate anonymous browser -----
  const browser = context.browser();
  check(browser !== null, "the browser context must expose its browser");
  if (browser === null) return;
  const guestContext = await browser.newContext();
  try {
    const guest = await guestContext.newPage();
    await guest.goto(`${base}/invite/${encodeURIComponent(token)}`, { waitUntil: "load" });
    await guest.waitForSelector("#invite-password", { timeout: 20_000 });
    const preview = (await guest.textContent("main")) ?? "";
    check(
      preview.includes(INVITES_EMAIL),
      `the invitation preview must name the invited address: ${preview.slice(0, 200)}`,
    );
    check(
      preview.includes("Personal"),
      `the invitation preview must name the workspace: ${preview.slice(0, 200)}`,
    );
    // The token itself is never rendered on the invitation page.
    check(
      !preview.includes(token),
      "the invitation page must not render the invitation token",
    );

    await guest.fill("#invite-password", PASSWORD);
    await guest.getByRole("button", { name: "Accept and create my account" }).click();
    await guest.waitForFunction(
      () =>
        (document.querySelector("div[aria-live='polite']")?.textContent ?? "").includes("You joined"),
      undefined,
      { timeout: 20_000 },
    );

    // The new account is signed in.
    const guestSession = await apiCall(guest, ROUTES.session);
    check(
      guestSession.status === 200 && guestSession.body?.result?.user?.email === INVITES_EMAIL,
      `the invited person must be signed in as themselves, saw ${guestSession.status}`,
    );
  } finally {
    await guestContext.close();
  }

  // --- D. the owner sees the new member ---------------------------------
  await page.reload({ waitUntil: "load" });
  await page.waitForSelector("section[aria-label='Members'] table tbody tr", { timeout: 20_000 });
  const memberRows = await page.locator("section[aria-label='Members'] table tbody tr").count();
  check(memberRows === 2, `the roster must show two members, saw ${memberRows}`);
  await page.waitForFunction(
    () =>
      (document.querySelector("section[aria-label='Invitations']")?.textContent ?? "").includes(
        "accepted",
      ),
    undefined,
    { timeout: 20_000 },
  );

  // The invited person is a member of the owner's workspace.
  const roster = await apiCall(
    page,
    `${ROUTES.workspaces}/${encodeURIComponent(workspaceId)}/members`,
  );
  check(roster.status === 200, `the roster must be readable, saw ${roster.status}`);
  check(
    (roster.body?.result?.members ?? []).length === 2,
    "the roster must show two members",
  );

  // --- E. an invitation can be revoked ----------------------------------
  await page.fill("#workspaces-email", INVITES_SECOND_EMAIL);
  await page.getByRole("button", { name: "Create invitation" }).click();
  await page.waitForSelector("section[aria-label='Invitations'] table tbody tr", { timeout: 20_000 });
  await page
    .locator("section[aria-label='Invitations'] table tbody tr", {
      hasText: INVITES_SECOND_EMAIL,
    })
    .getByRole("button", { name: "Revoke" })
    .click();
  await page.waitForFunction(
    () =>
      (document.querySelector("section[aria-label='Invitations']")?.textContent ?? "").includes(
        "revoked",
      ),
    undefined,
    { timeout: 20_000 },
  );
  const revokedLink = await apiCall(page, ROUTES.session);
  check(revokedLink.status === 200, "the owner stays signed in");
}

// ------------------------------------------------------------------- main
try {
  await runScenario("bootstrap", basePort, bootstrapJourney);
  await runScenario("isolation", isolationPort, isolationJourney);
  await runScenario("expiry", expiryPort, expiryJourney);
  await runScenario("sessions", sessionsPort, sessionsJourney);
  await runScenario("invites", invitesPort, invitesJourney);
} catch (error) {
  failures.push(`smoke error: ${error?.message ?? error}`);
}

if (failures.length > 0) {
  for (const failure of failures) console.error(`SMOKE_FAIL ${failure}`);
  process.exit(1);
}
console.log(
  "SMOKE_PASSED authenticated browser journeys (bootstrap status, signup, workspace, isolation, enumeration, sign-out, expiry, session recovery, session revocation, workspace invitation)",
);
