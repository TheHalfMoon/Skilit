/** Authenticated browser journey smoke.
 *
 * `node scripts/smoke-auth-journey.mjs [--port N]`
 *
 * Proves real, isolated, authenticated human UI journeys on a clean install.
 * Two scenarios run against two disposable databases:
 *
 *   bootstrap — an empty installation: the owner creates the first account
 *     through the real form, receives a HttpOnly session cookie with no
 *     token in browser storage, discovers the authorized workspace, creates
 *     a board inside it, is refused a forged workspace id, cannot
 *     distinguish an unknown email from a wrong password, and is signed
 *     out at the end.
 *
 *   isolation — two pre-seeded actors, each owning a real workspace: the
 *     first actor signs in through the real form, sees only its own
 *     workspace, and is refused every read and write against the other
 *     actor's real workspace.
 *
 * Isolation: a disposable PGlite data directory under the system temp
 * area, migrated by a short-lived child process and then opened by the web
 * server. No production database, no hosted service, no user data, no
 * network egress. The directories are removed on exit.
 *
 * Requires the built web application (CI runs this after the production
 * build) and the pinned Playwright Chromium headless shell.
 */
import { spawn, spawnSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import path from "node:path";
import process from "node:process";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const selfPath = fileURLToPath(import.meta.url);
const requireLens = createRequire(path.join(root, "packages/lens/package.json"));
const { chromium } = requireLens("playwright-core");

const OWNER_EMAIL = "owner@skilit.example";
const OWNER_PASSWORD = "journey-password-01";
const ALICE_EMAIL = "alice@skilit.example";
const BOB_EMAIL = "bob@skilit.example";
const ACTOR_PASSWORD = "journey-password-01";
const FORGED_WORKSPACE_ID = "skilit://workspace/00000000-0000-4000-8000-000000000000";

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
  const { signUp } = await import(
    pathToFileURL(path.join(root, "packages/db/src/auth.ts")).href
  );
  const { createWorkspace } = await import(
    pathToFileURL(path.join(root, "packages/db/src/workspaces.ts")).href
  );
  const db = await openDatabase({ dataDir });
  const applied = await migrateUp(db);
  const prepared = { migrations: applied.length, scenario };
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
if (!Number.isInteger(basePort) || basePort < 1 || basePort > 65535) {
  console.error(`SMOKE_FAIL invalid port: ${process.argv[2] ?? ""}`);
  process.exit(2);
}

const failures = [];
function check(condition, message) {
  if (!condition) failures.push(message);
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
  return { dataDir, prepared: JSON.parse(prepare.stdout) };
}

async function startServer(port, dataDir) {
  const server = spawn(
    process.execPath,
    ["node_modules/next/dist/bin/next", "start", "-p", String(port)],
    {
      cwd: path.join(root, "apps/web"),
      stdio: ["ignore", "pipe", "pipe"],
      env: { ...process.env, SKILIT_MCP_PGLITE_DATA_DIR: dataDir },
    },
  );
  server.stdout.on("data", (chunk) => process.stdout.write(`[web] ${chunk}`));
  server.stderr.on("data", (chunk) => process.stdout.write(`[web] ${chunk}`));
  let exited = false;
  server.on("exit", (code) => {
    exited = true;
    if (code !== 0 && code !== null) console.error(`[web] server exited early with code ${code}`);
  });
  const deadline = Date.now() + 120_000;
  for (;;) {
    if (exited) throw new Error("server exited before it became ready");
    try {
      const response = await fetch(`http://127.0.0.1:${port}/api/health`);
      if (response.ok) return server;
    } catch {
      /* keep polling */
    }
    if (Date.now() > deadline) throw new Error("timed out waiting for the web server");
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
}

async function runScenario(name, port, journey) {
  const { dataDir, prepared } = await prepareDatabase(name);
  let server;
  let browser;
  try {
    server = await startServer(port, dataDir);
    browser = await chromium.launch({ headless: true });
    const context = await browser.newContext();
    const page = await context.newPage();
    await journey({ page, context, base: `http://127.0.0.1:${port}`, prepared });
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
  // --- A. owner bootstrap through the real form -------------------------
  await page.goto(base + "/signup", { waitUntil: "load" });
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

  const cookies = await context.cookies();
  const session = cookies.find((cookie) => cookie.name === "skilit_session");
  check(session !== undefined, "no skilit_session cookie was set");
  check(session?.httpOnly === true, "the session cookie must be HttpOnly");
  check(
    (session?.sameSite ?? "").toLowerCase() === "lax",
    `the session cookie must be SameSite=Lax, saw ${session?.sameSite}`,
  );
  const browserVisibleCookie = await page.evaluate(() => document.cookie);
  check(
    !browserVisibleCookie.includes("skilit_session"),
    "the session cookie must not be readable from document.cookie",
  );
  const storage = await page.evaluate(() => ({
    local: Object.keys(window.localStorage).length,
    session: Object.keys(window.sessionStorage).length,
  }));
  check(storage.local === 0, "the session must not be persisted in localStorage");
  check(storage.session === 0, "the session must not be persisted in sessionStorage");

  // --- B. authorized session -------------------------------------------
  const sessionResponse = await page.evaluate(async () => {
    const response = await fetch("/api/v1/auth/session");
    return { status: response.status, body: await response.json() };
  });
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
  await page.goto(base + "/boards", { waitUntil: "load" });
  await page.waitForLoadState("networkidle", { timeout: 20_000 }).catch(() => {});
  const selected = await page.evaluate(() => {
    const select = document.querySelector("select");
    return select ? select.value : "";
  });
  check(
    selected === workspaceId,
    `the workspace selector must auto-select the authorized workspace, saw "${selected}"`,
  );

  const created = await page.evaluate(
    async ({ id }) => {
      const response = await fetch("/api/v1/boards", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ workspaceId: id, title: "Journey board", visibility: "workspace" }),
      });
      return { status: response.status, body: await response.json().catch(() => null) };
    },
    { id: workspaceId },
  );
  check(
    created.status === 201 || created.status === 200,
    `board creation in the authorized workspace must succeed, saw ${created.status}`,
  );

  // --- D. a forged workspace id is denied ---------------------------------
  const forged = await page.evaluate(async (id) => {
    const response = await fetch("/api/v1/boards", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ workspaceId: id, title: "Forged board", visibility: "workspace" }),
    });
    return { status: response.status, body: await response.json().catch(() => null) };
  }, FORGED_WORKSPACE_ID);
  check(
    forged.status < 200 || forged.status >= 300,
    `a forged workspace id must be denied, saw ${forged.status}`,
  );

  // --- E. an invalid sign-in does not enumerate users ---------------------
  const signin = await page.evaluate(
    async ({ email, password, wrongEmail }) => {
      const post = async (address, secret) => {
        const response = await fetch("/api/v1/auth/signin", {
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
    { email: OWNER_EMAIL, password: OWNER_PASSWORD, wrongEmail: "nobody@skilit.example" },
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
  const signedOut = await page.evaluate(async () => {
    const response = await fetch("/api/v1/auth/signout", { method: "POST" });
    return { status: response.status };
  });
  check(signedOut.status === 200, `sign-out must succeed, saw ${signedOut.status}`);
  const afterSignOut = await page.evaluate(async () => {
    const response = await fetch("/api/v1/auth/session");
    return { status: response.status };
  });
  check(
    afterSignOut.status === 401,
    `the session must be gone after sign-out, saw ${afterSignOut.status}`,
  );
  const cleared = (await context.cookies()).find(
    (cookie) => cookie.name === "skilit_session" && cookie.value !== "",
  );
  check(cleared === undefined, "sign-out must clear the session cookie");
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
  await page.goto(base + "/login", { waitUntil: "load" });
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
  const sessionResponse = await page.evaluate(async () => {
    const response = await fetch("/api/v1/auth/session");
    return { status: response.status, body: await response.json() };
  });
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
  // is a workspace-authorization decision, not input validation. The API
  // deliberately answers "not found" for a workspace the actor cannot see,
  // so a caller cannot probe which workspace ids exist.
  const crossWrite = await page.evaluate(
    async (id) => {
      const response = await fetch("/api/v1/boards", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ workspaceId: id, title: "Cross workspace", visibility: "workspace" }),
      });
      return { status: response.status, body: await response.json().catch(() => null) };
    },
    bobWorkspaceId,
  );
  check(
    crossWrite.status >= 400 && crossWrite.status < 500,
    `writing into the other actor's workspace must be denied with a client error, saw ${crossWrite.status}`,
  );
  check(
    typeof crossWrite.body?.error?.code === "string" &&
      crossWrite.body.error.code !== "INVALID_INPUT",
    `the denial must come from workspace authorization, not input validation, saw ${crossWrite.body?.error?.code}`,
  );

  const crossRead = await page.evaluate(async (id) => {
    const response = await fetch(`/api/v1/boards?workspaceId=${encodeURIComponent(id)}`);
    return { status: response.status, body: await response.json().catch(() => null) };
  }, bobWorkspaceId);
  check(
    crossRead.status >= 400 && crossRead.status < 500,
    `reading the other actor's workspace must be denied with a client error, saw ${crossRead.status}`,
  );

  // --- D. the actor's own workspace still works ---------------------------
  const ownWrite = await page.evaluate(
    async (id) => {
      const response = await fetch("/api/v1/boards", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ workspaceId: id, title: "Own workspace", visibility: "workspace" }),
      });
      return { status: response.status };
    },
    aliceWorkspaceId,
  );
  check(
    ownWrite.status === 201 || ownWrite.status === 200,
    `writing into the actor's own workspace must succeed, saw ${ownWrite.status}`,
  );
  check(
    ownWrite.status < 400,
    `the own-workspace request must not be refused the way the cross-workspace one is, saw ${ownWrite.status}`,
  );
}

// ------------------------------------------------------------------- main
try {
  await runScenario("bootstrap", basePort, bootstrapJourney);
  await runScenario("isolation", basePort + 1, isolationJourney);
} catch (error) {
  failures.push(`smoke error: ${error?.message ?? error}`);
}

if (failures.length > 0) {
  for (const failure of failures) console.error(`SMOKE_FAIL ${failure}`);
  process.exit(1);
}
console.log(
  "SMOKE_PASSED authenticated browser journeys (bootstrap sign-up, session, workspace, isolation, enumeration, sign-out)",
);
