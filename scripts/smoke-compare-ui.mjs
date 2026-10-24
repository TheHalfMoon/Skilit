/** Actor-scoped comparison UI smoke: real built Next + real Chromium.
 *
 * Synthetic REST envelopes are intercepted in this browser test only.
 * REST/MCP tenant denial and rights logic is tested separately with real
 * PGlite in apps/web/tests/compare.test.mjs; this smoke doesn't claim otherwise.
 * Usage: node scripts/smoke-compare-ui.mjs [port]
 */
import { spawn } from "node:child_process";
import path from "node:path";
import process from "node:process";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const requireLens = createRequire(path.join(root, "packages/lens/package.json"));
const { chromium } = requireLens("playwright-core");
const port = Number(process.argv[2] ?? 3111);
if (!Number.isInteger(port) || port < 1024 || port > 65535) {
  console.error("SMOKE_FAIL invalid port");
  process.exit(2);
}
const base = `http://127.0.0.1:${port}`;
const FIRST = "12345678-1234-4234-9234-1234567890ab";
const SECOND = "22345678-1234-4234-9234-1234567890ab";
const server = spawn(process.execPath, ["node_modules/next/dist/bin/next", "start", "-p", String(port)], {
  cwd: path.join(root, "apps/web"),
  stdio: ["ignore", "pipe", "pipe"],
  // User-level DB URL must never be inherited into a synthetic browser smoke.
  env: Object.fromEntries(
    Object.entries(process.env).filter(([key]) => ![
      "SKILIT_DATABASE_URL", "SKILIT_MCP_DATABASE_URL", "DATABASE_URL",
    ].includes(key)),
  ),
});
server.stdout.on("data", (chunk) => process.stdout.write(`[web] ${chunk}`));
server.stderr.on("data", (chunk) => process.stdout.write(`[web] ${chunk}`));
let serverExited = false;
server.on("exit", () => { serverExited = true; });

const deadline = Date.now() + 90_000;
async function ready() {
  while (!serverExited && Date.now() < deadline) {
    try {
      if ((await fetch(base + "/api/health")).ok) return;
    } catch {
      // Not started yet; bounded retry only.
    }
    await new Promise((resolve) => setTimeout(resolve, 350));
  }
  throw new Error("local Next server did not become healthy");
}
const response = (route, status, payload) => route.fulfill({
  status, contentType: "application/json",
  body: JSON.stringify(payload),
});
const side = (id, title) => ({
  uri: `skilit://artifact/${id}`, kind: "screen", title,
  summary: "Synthetic test-only design evidence", rights: "permitted",
  license: "MIT", trademark: false, serving: "allowed", servingReason: "synthetic",
  tags: ["navigation", "research"],
});
const comparison = {
  left: side(FIRST, "First screen"), right: side(SECOND, "Second screen"),
  identical: false, score: 0.625, sharedTerms: ["research", "navigation"],
  uniqueLeft: ["first"], uniqueRight: ["second"],
  fieldDiffs: [{ field: "title", left: "First screen", right: "Second screen" }],
};
let browser;
try {
  await ready();
  browser = await chromium.launch({ headless: true });
  for (const width of [390, 768, 1440]) {
    const page = await browser.newPage({ viewport: { width, height: 900 } });
    let denied = false;
    const compared = [];
    try {
      await page.route("**/api/v1/auth/session", (route) => response(route, 200, {
        result: { user: { email: "synthetic@skilit.invalid" } },
      }));
      await page.route("**/api/v1/assets/compare?*", (route) => {
        const url = new URL(route.request().url());
        compared.push({ left: url.searchParams.get("left"), right: url.searchParams.get("right") });
        return denied
          ? response(route, 404, { error: { code: "FORBIDDEN_OR_NOT_FOUND", message: "Not found." } })
          : response(route, 200, { result: comparison });
      });
      const document = await page.goto(base + "/compare", { waitUntil: "load" });
      if (document?.status() !== 200) throw new Error("compare page did not load");
      await page.locator("#compare-left").fill(`skilit://artifact/${FIRST}`);
      await page.locator("#compare-right").fill(SECOND);
      await page.getByRole("button", { name: "Compare evidence" }).click();
      await page.getByRole("heading", { name: "Evidence comparison" }).waitFor();
      await page.getByText("Lexical Jaccard overlap", { exact: false }).waitFor();
      if (compared.length !== 1 || compared[0].left !== FIRST || compared[0].right !== SECOND) {
        throw new Error("browser failed to transmit the exact approved pair");
      }
      if (await page.locator('section[aria-label="First artifact"]').getByText("First screen").count() !== 1 ||
          await page.locator('section[aria-label="Second artifact"]').getByText("Second screen").count() !== 1) {
        throw new Error("expected side-by-side evidence cards missing");
      }
      await page.locator("#compare-right").fill("../../../../login");
      await page.getByRole("button", { name: "Compare evidence" }).click();
      await page.getByRole("alert").getByText("INVALID_INPUT", { exact: false }).waitFor();
      if (compared.length !== 1) throw new Error("invalid artifact reference made a request");
      if (await page.getByRole("heading", { name: "Evidence comparison" }).count()) {
        throw new Error("failed request retained old comparison data");
      }
      denied = true;
      await page.locator("#compare-right").fill(SECOND);
      await page.getByRole("button", { name: "Compare evidence" }).click();
      await page.getByRole("alert").getByText("FORBIDDEN_OR_NOT_FOUND", { exact: false }).waitFor();
      if (await page.getByRole("heading", { name: "Evidence comparison" }).count()) {
        throw new Error("denied artifact leaked prior comparison");
      }
      if (await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1)) {
        throw new Error(`horizontal overflow at viewport ${width}`);
      }
    } finally {
      await page.close();
    }
  }
} catch (error) {
  console.error(`SMOKE_FAIL ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
} finally {
  if (browser) await browser.close();
  server.kill("SIGTERM");
  setTimeout(() => server.kill("SIGKILL"), 5000).unref();
}
if (!process.exitCode) console.log("SMOKE_PASSED compare UI real Chromium (3 viewports, valid/invalid/denied synthetic transport)");
