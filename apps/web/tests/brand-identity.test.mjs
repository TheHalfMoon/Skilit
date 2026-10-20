import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import test from "node:test";
import { assertSafeSvgBody } from "../../../packages/assets/src/iconset.ts";

const read = (relative) => readFileSync(new URL(relative, import.meta.url), "utf8");
const tokens = JSON.parse(read("../../../docs/brand/tokens.json"));
const icons = JSON.parse(read("../registry/skilit-ui-icons.json"));
const paths = [
  "../public/brand/skilit-mark-orange.svg",
  "../public/brand/skilit-mark-black.svg",
  "../public/brand/skilit-lockup-light.svg",
  "../public/brand/skilit-lockup-orange.svg",
  "../app/icon.svg",
];
const assets = paths.map(read);

test("Skilit is the sole first-party brand identity in the active assets", () => {
  assert.equal(tokens.product, "skilit");
  assert.equal(tokens.version, 2);
  for (const asset of assets) {
    assert.match(asset, /<svg\b/);
    assert.match(asset, /Skilit/i);
    assert.doesNotMatch(asset, /skelet|muse|claude|mistral/i);
    assert.doesNotMatch(asset, /<script|onload=|<foreignObject/i);
    assert.doesNotMatch(asset, /filter=|<filter|<linearGradient|<radialGradient/i);
  }
});

test("web chrome wordmark tracking matches the approved outline geometry", () => {
  const source = JSON.parse(read("../../../docs/brand/wordmark-inter-tight-600.json"));
  const css = read("../app/globals.css");
  const brand = css.match(/\.sk-brand\s*\{([^}]*)\}/)?.[1] ?? "";
  const letterSpacing = brand.match(/letter-spacing:\s*(-?[\d.]+)em/)?.[1];
  assert.ok(letterSpacing, "the sidebar wordmark declares an em letter-spacing");
  const applied = Number(letterSpacing);
  // The approved outlines bake trackingPx into the glyph advances at
  // baselinePx, so the HTML wordmark must use the same tracking ratio or the
  // two renderings of one wordmark drift apart.
  const expected = source.trackingPx / source.baselinePx;
  assert.ok(
    Math.abs(applied - expected) < 0.002,
    `wordmark letter-spacing ${applied}em must match outline tracking ratio ${expected}em`,
  );
  // The brand mark must not use a fixed flex-basis: that silently defeats a
  // later responsive width override for the same flex item.
  const symbol = css.match(/\.sk-brand-symbol\s*\{([^}]*)\}/)?.[1] ?? "";
  assert.match(symbol, /flex:\s*0\s+0\s+auto/, "brand mark must keep width authoritative");
  const mobile = css.match(/@media \(max-width: 760px\)[\s\S]*?\.sk-brand-symbol\s*\{([^}]*)\}/)?.[1] ?? "";
  assert.match(mobile, /width:\s*\d+px/, "mobile breakpoint still overrides the brand mark width");
  // The reverse-field token is named for its role, matching docs/brand/tokens.json.
  assert.match(css, /--sk-orange-field:\s*#ff782d/i);
  assert.doesNotMatch(css, /--sk-orange-soft/);
});

test("pinned offline Inter Tight font, outline paths and OFL provenance are consistent", () => {
  const source = JSON.parse(read("../../../docs/brand/wordmark-inter-tight-600.json"));
  const font = readFileSync(new URL("../public/brand/inter-tight-latin-600.woff2", import.meta.url));
  const ofl = read("../../../docs/brand/licenses/Inter-Tight-OFL.txt");
  const css = read("../app/globals.css");
  assert.equal(source.family, "Inter Tight");
  assert.equal(source.weight, 600);
  assert.match(source.upstreamCommit, /^[a-f0-9]{40}$/);
  // upstreamTtfSha256 is provenance-only: it records the upstream TTF digest
  // and is not verifiable against a file in this repository, unlike
  // subsetSha256 and sourceLicenseSha256 which are hashed against committed
  // bytes. It is deliberately not named sourceSha256, which elsewhere in
  // this repository means "SHA-256 of the rendered source page".
  assert.match(source.upstreamTtfSha256, /^[a-f0-9]{64}$/);
  assert.equal(font.subarray(0, 4).toString("ascii"), "wOF2");
  assert.equal(createHash("sha256").update(font).digest("hex"), source.subsetSha256);
  assert.equal(createHash("sha256").update(ofl).digest("hex"), source.sourceLicenseSha256);
  assert.match(ofl, /SIL OPEN FONT LICENSE Version 1\.1/);
  assert.match(ofl, /Copyright 2022 The Inter Project Authors/);
  assert.match(css, /url\("\/brand\/inter-tight-latin-600\.woff2"\)/);
  assert.ok(source.path.length > 100);
  // The web application serves the OFL text to users alongside the font it
  // serves (OFL condition 2). The served copy must not drift from the
  // source of truth in docs/brand/licenses/.
  const servedOfL = readFileSync(new URL("../public/brand/Inter-Tight-OFL.txt", import.meta.url));
  assert.equal(
    createHash("sha256").update(servedOfL).digest("hex"),
    source.sourceLicenseSha256,
    "the served OFL text must be byte-identical to the source licence",
  );
  assert.match(
    read("../app/terms/page.tsx"),
    /\/brand\/Inter-Tight-OFL\.txt/,
    "the legal surface must link the font licence",
  );
  for (const asset of [
    ...assets.slice(2, 4),
    read("../public/brand/skilit-social-light.svg"),
    read("../public/brand/skilit-social-orange.svg"),
  ]) {
    assert.ok(asset.includes(`d="${source.path}"`), "wordmark must use pinned outlined geometry");
    assert.match(asset, /data-wordmark="skilit"/);
  }
});

test("orange and black official marks have identical S geometry", () => {
  const marks = assets.slice(0, 2).map((asset) => asset.match(/<path d="([^"]+)"/)?.[1]);
  assert.ok(marks[0]?.startsWith("M "));
  assert.equal(marks[0], marks[1]);
  const lockups = assets.slice(2, 4).map((asset) => asset.match(/<path d="([^"]+)"/)?.[1]);
  assert.deepEqual(lockups, marks);
  assert.ok(assets[2].includes(tokens.colors.orange));
  assert.ok(assets[3].includes(tokens.colors.orangeField));
  assert.ok(assets[3].includes(tokens.colors.ink));
  for (const lockup of assets.slice(2, 4)) {
    assert.match(lockup, /data-wordmark="skilit"/, "approved wordmark must remain lowercase");
    assert.doesNotMatch(lockup, />Skilit<\/text>|font-family="Arial/);
  }
  assert.match(assets[4], /fill="#FAF8F5"/);
  assert.match(assets[4], /fill="#FF6A1F"/);
});

test("18 Skilit-owned icons are safe and compatible with the asset importer", () => {
  assert.equal(icons.prefix, "skilit");
  assert.equal(Object.keys(icons.icons).length, 18);
  for (const [name, icon] of Object.entries(icons.icons)) {
    assert.match(name, /^[a-z][a-z0-9-]+$/);
    assert.ok(icon.paths.length > 0, name);
    assertSafeSvgBody(icon.body, name);
    for (const path of icon.paths) {
      assert.ok(icon.body.includes(path), name);
    }
  }
});

test("brand tokens and runtime stylesheet have no palette drift", () => {
  const css = read("../app/globals.css").toUpperCase();
  for (const [key, hex] of Object.entries(tokens.colors)) {
    assert.ok(css.includes(hex.toUpperCase()), key);
  }
});

test("navigation includes each existing Skilit workflow", () => {
  const navigation = read("../components/skilit-shell.tsx");
  const home = read("../app/page.tsx");
  for (const route of ["/lens", "/gallery", "/patterns", "/boards", "/flows"]) {
    assert.ok(navigation.includes(route), route);
    assert.ok(home.includes(route), route);
  }
  assert.match(navigation, /aria-current=/);
  assert.match(home, /href="\/api\/health"/);
});
