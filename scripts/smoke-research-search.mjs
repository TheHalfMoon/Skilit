/** Chromium research-screen discovery smoke.
 * Synthetic REST interception tests the built UI, not legal rights or live
 * data corpus. The PGlite tests separately establish actor authorization.
 */
import { spawn } from "node:child_process";
import path from "node:path";
import process from "node:process";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const requireLens = createRequire(path.join(root, "packages/lens/package.json"));
const { chromium } = requireLens("playwright-core");
const port = Number(process.argv[2] ?? 3197);
if (!Number.isInteger(port) || port < 1024 || port > 65535) {
  console.error("SMOKE_FAIL invalid port");
  process.exit(2);
}
const base = `http://127.0.0.1:${port}`;
const server = spawn(process.execPath, ["node_modules/next/dist/bin/next", "start", "-p", String(port)], {
  cwd: path.join(root, "apps/web"), stdio: ["ignore", "pipe", "pipe"],
  env: Object.fromEntries(Object.entries(process.env).filter(([key]) =>
    !["SKILIT_DATABASE_URL", "SKILIT_MCP_DATABASE_URL", "DATABASE_URL"].includes(key))),
});
server.stdout.on("data", (chunk) => process.stdout.write(`[web] ${chunk}`));
server.stderr.on("data", (chunk) => process.stdout.write(`[web] ${chunk}`));
let serverExited = false;
server.on("exit", () => { serverExited = true; });

async function ready() {
  const deadline = Date.now() + 90_000;
  while (!serverExited && Date.now() < deadline) {
    try {
      if ((await fetch(base + "/api/health")).ok) return;
    } catch {
      // Bounded local startup check only.
    }
    await new Promise((resolve) => setTimeout(resolve, 350));
  }
  throw new Error("Next server did not become healthy");
}
const reply = (route, status, body) => route.fulfill({
  status, contentType: "application/json", body: JSON.stringify(body),
});
const screen = {
  uri: "skilit://artifact/12345678-1234-4234-9234-1234567890ab",
  kind: "screen", title: "Synthetic checkout research screen",
  source: "synthetic-fixture", license: "unknown",
  rights: "metadata_only", serving: "metadata-only",
  servingReason: "Source data not approved for byte distribution",
};
let browser;
try {
  await ready();
  browser = await chromium.launch({ headless: true });
  for (const width of [390, 768, 1440]) {
    const page = await browser.newPage({ viewport: { width, height: 900 } });
    const requested = [];
    let denied = false;
    try {
      await page.route("**/api/v1/auth/session", (route) =>
        reply(route, 200, { result: { user: { email: "synthetic@skilit.invalid" } } }));
      await page.route("**/api/v1/assets?*", (route) => {
        const url = new URL(route.request().url());
        requested.push({
          query: url.searchParams.get("query"),
          kinds: url.searchParams.get("kinds"),
        });
        return denied
          ? reply(route, 404, { error: { code: "FORBIDDEN_OR_NOT_FOUND", message: "Object was not found." } })
          : reply(route, 200, { result: { assets: [screen], search_mode: "postgres-fts" } });
      });
      const document = await page.goto(base + "/research", { waitUntil: "load" });
      if (document?.status() !== 200) throw new Error("research page did not load");
      await page.locator("#research-query").fill("  checkout  ");
      await page.getByRole("button", { name: "Search screens" }).click();
      await page.getByRole("heading", { name: screen.title }).waitFor();
      if (requested.length !== 1 || requested[0].query !== "checkout" ||
          requested[0].kinds !== "screen") {
        throw new Error("browser search omitted explicit screen kind or escaped query");
      }
      await page.getByText("Metadata only", { exact: false }).first().waitFor();

      // Editing invalidates prior results before a subsequent request.
      await page.locator("#research-query").fill("private");
      if (await page.getByRole("heading", { name: screen.title }).count()) {
        throw new Error("editing the query left stale research result visible");
      }
      denied = true;
      await page.getByRole("button", { name: "Search screens" }).click();
      await page.getByRole("alert").getByText("FORBIDDEN_OR_NOT_FOUND", { exact: false }).waitFor();
      if (await page.getByRole("heading", { name: screen.title }).count()) {
        throw new Error("denied result leaked previously visible metadata");
      }
      if (await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1)) {
        throw new Error(`horizontal overflow at ${width}px viewport`);
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
if (!process.exitCode) {
  console.log("SMOKE_PASSED Research screen search in real Chromium (3 widths, valid + denied synthetic REST)");
}
