/** Authenticated browser journey smoke.
 *
 * `node scripts/smoke-auth-journey.mjs [port]`
 *
 * Proves real, isolated, authenticated human UI journeys on a clean install.
 * Three scenarios run against three disposable databases:
 *
 *   bootstrap — an empty installation: the owner creates the first account
 *     through the real form, receives a HttpOnly session cookie with no
 *     token anywhere the page can read, discovers the authorized
 *     workspace, creates a board inside it, is refused a workspace it
 *     cannot see, cannot distinguish an unknown email from a wrong
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
 *     workspace, and is refused every read and write against the other
 *     actor's real workspace — with the same answer it gets for a
 *     workspace that does not exist at all, so the API never reveals
 *     which workspace ids are real.
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
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import path from "node:path";
import process from "node:process";
import { fileURLToPath, pathToFileURL } from "node:url";

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
};
const OWNER_EMAIL = "owner@skilit.example";
const OWNER_PASSWORD = "journey-password-01";
const ALICE_EMAIL = "alice@skilit.example";
const EXPIRY_EMAIL = "expiry@skilit.example";
// Production TTL is unchanged: this fixture creates a legitimate 60-second
// session with a backdated trusted server clock, leaving ~45 seconds for
// startup, browser possession and an actual expiry transition.
const EXPIRY_BACKDATE_MS = 15_000;
const BOB_EMAIL = "bob@skilit.example";
const ACTOR_PASSWORD = "journey-password-01";
// A well-formed workspace id that belongs to nobody.
const UNKNOWN_WORKSPACE_ID = "00000000-0000-4000-8000-000000000000";
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
    const owner = await signUp(db, { email: EXPIRY_EMAIL, password: ACTOR_PASSWORD });
    const space = await createWorkspace(db, { name: "Expiry owner workspace", ownerId: owner.id });
    const { token, session } = await createSession(db, owner.id, {
      ttlSeconds: 60,
      now: new Date(Date.now() - EXPIRY_BACKDATE_MS),
    });
    // Never print a live bearer token to stdout, CI logs, or a GitHub artifact.
    // The parent reads this private fixture file and the enclosing temp
    // directory is deleted after the real browser/server finish.
    writeFileSync(path.join(dataDir, ".expiry-session-token"), token, { mode: 0o600 });
    prepared.expiresAt = session.expiresAt;
    prepared.ownerWorkspaceId = space.workspace.id;
  }
  if (scenario === "isolation") {
    const alice = await signUp(db, { email: ALICE_EMAIL, password: ACTOR_PASSWORD });
    const bob = await signUp(db, { email: BOB_EMAIL, password: ACTOR_PASSWORD });
    const aliceSpace = await createWorkspace(db, { name: "Alice space", ownerId: alice.id });
    const bobSpace = await createWorkspace(db, { name: "Bob space", ownerId: bob.id });
    prepared.aliceWorkspaceId = aliceSpace.workspace.id;
    prepared.bobWorkspaceId = bobSpace.workspace.id;
  }
  process.stdout.write(JSON.stringify(prepared));
  process.exit(0);
}

const basePort = Number(process.env.SMOKE_PORT ?? process.argv[2] ?? 3105);
const isolationPort = basePort + 1;
const expiryPort = basePort + 2;
if (
  !Number.isInteger(basePort) ||
  basePort < 1 ||
  expiryPort > 65535
) {
  console.error(`SMOKE_FAIL invalid port: ${process.argv[2] ?? ""}`);
  process.exit(2);
}

const failures = [];
function check(condition, message) {
  if (!condition) failures.push(message);
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
  }
  return { dataDir, prepared };
}

async function runScenario(name, port, journey) {
  const { dataDir, prepared } = await prepareDatabase(name);
  let server = null;
  let browser = null;
  let output = "";
  try {
    server = spawn(
      process.execPath,
      ["node_modules/next/dist/bin/next", "start", "-p", String(port)],
      {
        cwd: path.join(root, "apps/web"),
        stdio: ["ignore", "pipe", "pipe"],
        env: serverEnv(dataDir),
      },
    );
    const capture = (chunk) => {
      output += chunk.toString();
      process.stdout.write(`[web] ${chunk}`);
    };
    server.stdout.on("data", capture);
    server.stderr.on("data", capture);
    let exited = false;
    server.on("exit", () => {
      exited = true;
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
      !output.includes(OWNER_PASSWORD) && !output.includes(ACTOR_PASSWORD),
      "the web server output must not contain a session password",
    );
  } finally {
    if (browser) await browser.close();
    if (server) {
      server.kill("SIGTERM");
      setTimeout(() => server.kill("SIGKILL"), 5000).unref();
    }
    rmSync(dataDir, { recursive: true, force: true });
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
  await page.fill("#signup-password", OWNER_PASSWORD);
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
      password: OWNER_PASSWORD,
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
  const { aliceWorkspaceId, bobWorkspaceId } = prepared;
  check(
    typeof aliceWorkspaceId === "string" && typeof bobWorkspaceId === "string",
    "the isolation fixture must provide two real workspace ids",
  );
  check(
    aliceWorkspaceId !== bobWorkspaceId,
    "the two actors must own different workspaces",
  );

  // --- A. sign in as the first actor through the real form ---------------
  await page.goto(base + ROUTES.login, { waitUntil: "load" });
  await page.fill("#login-email", ALICE_EMAIL);
  await page.fill("#login-password", ACTOR_PASSWORD);
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
    crossRead.status === DENIED_STATUS,
    `reading the other actor's workspace must answer ${DENIED_STATUS}, saw ${crossRead.status}`,
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
  await page.fill("#login-password", ACTOR_PASSWORD);
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

// ------------------------------------------------------------------- main
try {
  await runScenario("bootstrap", basePort, bootstrapJourney);
  await runScenario("isolation", isolationPort, isolationJourney);
  await runScenario("expiry", expiryPort, expiryJourney);
} catch (error) {
  failures.push(`smoke error: ${error?.message ?? error}`);
}

if (failures.length > 0) {
  for (const failure of failures) console.error(`SMOKE_FAIL ${failure}`);
  process.exit(1);
}
console.log(
  "SMOKE_PASSED authenticated browser journeys (bootstrap status, signup, workspace, isolation, enumeration, sign-out, expiry, session recovery)",
);
