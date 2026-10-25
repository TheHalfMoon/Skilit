/** Brand chrome responsive and keyboard smoke: `node scripts/smoke-brand-chrome.mjs [--port N]`.
 *
 * Spawns the built web application, drives it with the pinned headless
 * Chromium, and asserts the founder-approved brand chrome stays in-bounds,
 * keeps the approved wordmark geometry, and remains reachable by keyboard at
 * 390 / 768 / 1440 px. Exit non-zero on any failure.
 *
 * The pages are statically prerendered and need no production data, but the
 * auth surfaces and the workspace shell do call the auth API. Those probes
 * are expected to fail here and are asserted explicitly below rather than
 * being ignored: the session probe answers 401 because the browser holds no
 * session cookie, and the bootstrap probe answers 500 because this smoke
 * stands up no database, so it fails closed with a typed INTERNAL_OPAQUE
 * error. Any other failed resource fails the smoke.
 */
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const requireLens = createRequire(path.join(root, "packages/lens/package.json"));
const { chromium } = requireLens("playwright-core");

const port = Number(process.env.SMOKE_PORT ?? process.argv[2] ?? 3104);
if (!Number.isInteger(port) || port < 1 || port > 65535) {
  console.error(`SMOKE_FAIL invalid port: ${process.argv[2] ?? ""}`);
  process.exit(2);
}
const base = `http://127.0.0.1:${port}`;
const deadline = Date.now() + 90_000;
const VIEWPORTS = [
  { name: "mobile", width: 390, height: 844 },
  { name: "tablet", width: 768, height: 1024 },
  { name: "desktop", width: 1440, height: 900 },
];
const GALLERY_FLOW_VERSION = "12345678-1234-4234-9234-1234567890ab";
const PAGES = ["/", "/login", "/signup", `/flows?productVersionId=${GALLERY_FLOW_VERSION}`];
// The approved outline geometry bakes tracking into the glyph advances; the
// sidebar wordmark must use the same tracking ratio. The expectation is read
// from the brand source of truth rather than duplicated here, so the smoke
// compares the stylesheet against the approved geometry itself.
const wordmark = JSON.parse(
  readFileSync(path.join(root, "docs/brand/wordmark-inter-tight-600.json"), "utf8"),
);
const APPROVED_WORDMARK_TRACKING_EM = wordmark.trackingPx / wordmark.baselinePx;
const MOBILE_BRAND_MARK_WIDTH_PX = 36;

const failures = [];
function check(condition, message) {
  if (!condition) failures.push(message);
}

// The auth pages and the workspace shell probe the auth API. Those probes
// are expected to fail in this smoke, and each expected failure is pinned to
// its exact status so a real regression cannot hide inside the allowlist.
const TOLERATED_FAILED_RESOURCES = new Map([
  ["/api/v1/auth/session", new Set([401])],
  ["/api/v1/auth/status", new Set([500])],
]);

const server = spawn(
  process.execPath,
  ["node_modules/next/dist/bin/next", "start", "-p", String(port)],
  { cwd: path.join(root, "apps/web"), stdio: ["ignore", "pipe", "pipe"] },
);
server.stdout.on("data", (chunk) => process.stdout.write(`[web] ${chunk}`));
server.stderr.on("data", (chunk) => process.stdout.write(`[web] ${chunk}`));
let serverExited = false;
server.on("exit", (code) => {
  serverExited = true;
  if (code !== 0 && code !== null) console.error(`[web] server exited early with code ${code}`);
});

async function waitForServer() {
  for (;;) {
    if (serverExited) throw new Error("server exited before it became ready");
    try {
      const response = await fetch(base + "/api/health");
      if (response.ok) return;
    } catch {
      /* keep polling */
    }
    if (Date.now() > deadline) throw new Error("timed out waiting for the web server");
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
}

let browser;
try {
  await waitForServer();
  browser = await chromium.launch({ headless: true });

  for (const viewport of VIEWPORTS) {
    for (const route of PAGES) {
      const page = await browser.newPage({ viewport: { width: viewport.width, height: viewport.height } });
      const errors = [];
      const failedResources = [];
      page.on("pageerror", (error) => errors.push(`pageerror: ${error.message}`));
      page.on("response", (response) => {
        if (response.status() >= 400) {
          failedResources.push({ path: new URL(response.url()).pathname, status: response.status() });
        }
      });
      page.on("console", (message) => {
        if (message.type() !== "error") return;
        // Resource-load failures are tracked precisely via the response hook
        // above, so they are not double-counted as script errors here.
        if (message.text().startsWith("Failed to load resource")) return;
        errors.push(`console: ${message.text()}`);
      });
      try {
        const response = await page.goto(base + route, { waitUntil: "load" });
        const label = `${viewport.name} ${viewport.width}px ${route}`;
        check(response?.status() === 200, `${label}: document status ${response?.status()}`);
        // Let the page's own async probes finish before the failures are
        // read, so a slow auth probe cannot be mistaken for a clean page.
        await page.waitForLoadState("networkidle", { timeout: 15000 }).catch(() => {});
        await page.evaluate(() => document.fonts.ready);

        const overflow = await page.evaluate(
          () => document.documentElement.scrollWidth - window.innerWidth,
        );
        check(overflow <= 1, `${label}: horizontal overflow of ${overflow}px`);

        if (route.startsWith("/flows?productVersionId=")) {
          // Real Chromium hydration contract: a gallery link must land on
          // the flow explorer with the same version selected. It does not
          // authorize a flow read, or invent a real product-version record.
          await page.waitForFunction(
            (id) => document.querySelector("#flows-version")?.value === id,
            GALLERY_FLOW_VERSION,
            { timeout: 10000 },
          );
          const selected = await page.inputValue("#flows-version");
          check(selected === GALLERY_FLOW_VERSION,
                `${label}: gallery version filter lost across route transition`);
        }

        const brand = await page.evaluate(() => {
          const link = document.querySelector(".sk-brand");
          if (!link) return null;
          const rect = link.getBoundingClientRect();
          const style = getComputedStyle(link);
          const mark = document.querySelector(".sk-brand-symbol");
          const markRect = mark ? mark.getBoundingClientRect() : null;
          return {
            text: (link.textContent ?? "").trim(),
            left: rect.left,
            right: rect.right,
            fontSize: parseFloat(style.fontSize),
            letterSpacingPx: parseFloat(style.letterSpacing),
            markWidth: markRect ? markRect.width : null,
            fontLoaded: document.fonts.check(`600 ${parseFloat(style.fontSize)}px "Inter Tight Skilit"`),
          };
        });

        if (route === "/") {
          check(brand !== null, `${label}: the sidebar brand wordmark is missing`);
          if (brand) {
            check(brand.text === "skilit", `${label}: wordmark must be lowercase "skilit", saw "${brand.text}"`);
            check(brand.left >= 0 && brand.right <= viewport.width, `${label}: brand wordmark is out of bounds`);
            check(
              brand.fontLoaded,
              `${label}: the bundled Inter Tight Skilit webfont did not load`,
            );
            const trackingEm = brand.letterSpacingPx / brand.fontSize;
            check(
              Math.abs(trackingEm - APPROVED_WORDMARK_TRACKING_EM) < 0.002,
              `${label}: wordmark tracking ${trackingEm}em must match the approved outline ratio ${APPROVED_WORDMARK_TRACKING_EM}em`,
            );
            if (viewport.width <= 760) {
              check(
                brand.markWidth !== null &&
                  Math.abs(brand.markWidth - MOBILE_BRAND_MARK_WIDTH_PX) < 0.5,
                `${label}: responsive brand mark width must apply (expected ${MOBILE_BRAND_MARK_WIDTH_PX}px, saw ${brand.markWidth}px)`,
              );
            }
          }

          await page.keyboard.press("Tab");
          let focused = null;
          for (let attempt = 0; attempt < 12; attempt += 1) {
            focused = await page.evaluate(() => {
              const active = document.activeElement;
              if (!active || !(active instanceof HTMLElement)) return null;
              const style = getComputedStyle(active);
              return {
                isBrand: active.classList.contains("sk-brand"),
                outlineStyle: style.outlineStyle,
                outlineWidth: parseFloat(style.outlineWidth) || 0,
              };
            });
            if (focused?.isBrand) break;
            await page.keyboard.press("Tab");
          }
          check(focused?.isBrand === true, `${label}: the brand wordmark link is not keyboard reachable`);
          check(
            focused?.outlineStyle !== "none" && focused?.outlineWidth > 0,
            `${label}: the focused brand wordmark shows no visible focus outline`,
          );
        }

        check(errors.length === 0, `${label}: page errors: ${errors.join(" | ")}`);
        for (const failed of failedResources) {
          const allowed = TOLERATED_FAILED_RESOURCES.get(failed.path);
          check(
            allowed !== undefined && allowed.has(failed.status),
            `${label}: unexpected failed resource ${failed.path} (${failed.status})`,
          );
        }

        // NOTICE section 7a requires a deployment that serves the font to
        // serve the licence notice to its users as well. Check the BUILT
        // instance actually does, not just the source tree.
        if (route === "/") {
          const served = await page.evaluate(async () => {
            const response = await fetch("/brand/Inter-Tight-OFL.txt");
            return { status: response.status, body: await response.text() };
          });
          check(
            served.status === 200,
            `the built instance must serve the font licence, saw ${served.status}`,
          );
          const digest = createHash("sha256").update(served.body).digest("hex");
          check(
            digest === wordmark.sourceLicenseSha256,
            "the served font licence must match the recorded source licence digest",
          );
        }
      } finally {
        await page.close();
      }
    }
  }

  // Genuine UI journey across the gallery and flow explorer. Fake only the
  // REST *responses* (synthetic, visible-only fixtures), not navigation or
  // browser behavior. Server actor authorization remains covered by existing
  // database/REST tests; this test never claims an authenticated backend.
  {
    const page = await browser.newPage({
      viewport: { width: 1440, height: 900 },
    });
    const productId = "22222222-2222-4222-9222-222222222222";
    const seenFlowFilters = [];
    const reply = (route, result) => route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ result, request_id: "synthetic-ui-fixture", cursor: null }),
    });
    try {
      await page.route("**/api/v1/auth/session", (route) => reply(route, {
        user: { email: "test-only@skilit.invalid" },
      }));
      await page.route("**/api/v1/products?*", (route) => reply(route, {
        products: [{
          uri: `skilit://product/${productId}`,
          title: "Synthetic test product",
          versionCount: 1,
          artifactCount: 1,
        }],
      }));
      await page.route(`**/api/v1/products/${productId}/versions?*`, (route) => reply(route, {
        versions: [{
          uri: `skilit://version/${GALLERY_FLOW_VERSION}`,
          productId,
          versionNo: 2,
          artifactCount: 1,
        }],
      }));
      await page.route("**/api/v1/flows?*", (route) => {
        seenFlowFilters.push(new URL(route.request().url()).searchParams.get("productVersionId"));
        return reply(route, {
          flows: [{
            uri: "skilit://flow/33333333-3333-4333-9333-333333333333",
            productVersionId: GALLERY_FLOW_VERSION,
            title: "Synthetic evidence flow",
            stepCount: 2,
          }],
        });
      });

      await page.goto(base + "/gallery", { waitUntil: "load" });
      await page.getByRole("button", { name: "List products" }).click();
      await page.getByText("Synthetic test product", { exact: false }).waitFor();
      await page.getByRole("button", { name: "Inspect versions" }).last().click();
      const link = page.getByRole("link", { name: "Explore flows for version 2" });
      await link.waitFor();
      check(
        await link.getAttribute("href") === `/flows?productVersionId=${GALLERY_FLOW_VERSION}`,
        "synthetic gallery row must point to a validated local flow explorer URL",
      );
      await link.click();
      await page.waitForURL((url) =>
        url.pathname === "/flows" && url.searchParams.get("productVersionId") === GALLERY_FLOW_VERSION,
      );
      await page.waitForFunction(
        (id) => document.querySelector("#flows-version")?.value === id,
        GALLERY_FLOW_VERSION,
      );
      check(!/token|secret|auth|bearer/i.test(new URL(page.url()).search),
        "cross-page URL must not carry auth/secret parameters");

      await page.getByRole("button", { name: "List flows" }).click();
      await page.getByText("Synthetic evidence flow", { exact: false }).waitFor();
      check(
        seenFlowFilters.length === 1 && seenFlowFilters[0] === GALLERY_FLOW_VERSION,
        "flow explorer must send the selected version UUID to the existing REST listing",
      );
    } catch (error) {
      failures.push(`synthetic gallery-to-flows Chromium journey: ${error?.message ?? error}`);
    } finally {
      await page.close();
    }
  }
} catch (error) {
  failures.push(`smoke error: ${error?.message ?? error}`);
} finally {
  if (browser) await browser.close();
  server.kill("SIGTERM");
  setTimeout(() => server.kill("SIGKILL"), 5000).unref();
}

if (failures.length > 0) {
  for (const failure of failures) console.error(`SMOKE_FAIL ${failure}`);
  process.exit(1);
}
console.log(
  `SMOKE_PASSED brand chrome responsive/keyboard (${VIEWPORTS.length} viewports x ${PAGES.length} routes), synthetic gallery-to-flows Chromium click journey`,
);
