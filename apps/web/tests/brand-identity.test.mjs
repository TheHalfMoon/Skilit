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
  assert.match(source.upstreamPath, /^ofl\/intertight\//, "the upstream file path is recorded");
  // upstreamTtfSha256 is the digest of the upstream file at the pinned
  // commit. It is not verifiable against a file in this repository, so it
  // is only shape-checked here; the digest can be re-checked by fetching
  // upstreamPath at upstreamCommit.
  assert.match(source.upstreamTtfSha256, /^[a-f0-9]{64}$/);
  // upstreamOflSha256 is the digest of the upstream licence file. The
  // in-tree licence text is a whitespace-normalised copy, so it has its
  // own digest (sourceLicenseSha256) and is checked against the file
  // below.
  assert.match(source.upstreamOflSha256, /^[a-f0-9]{64}$/);
  assert.notEqual(
    source.upstreamOflSha256,
    source.sourceLicenseSha256,
    "the upstream licence digest and the in-tree copy digest must differ",
  );
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

test("brand panel text meets WCAG AA contrast on the approved orange field", () => {
  // The brand field is the approved orange; the text that sits on it must
  // stay readable when the field is darkened, so the contrast is asserted
  // here rather than left to a visual review.
  const relativeLuminance = (hex) => {
    const channels = [0, 2, 4].map((offset) => parseInt(hex.slice(1 + offset, 3 + offset), 16) / 255);
    const [r, g, b] = channels.map((c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  };
  const contrast = (a, b) => {
    const [hi, lo] = [relativeLuminance(a), relativeLuminance(b)].sort((x, y) => y - x);
    return (hi + 0.05) / (lo + 0.05);
  };
  const css = read("../app/globals.css");
  const field = css.match(/--sk-orange-field:\s*(#[0-9a-f]{6})/i)?.[1];
  assert.ok(field, "the stylesheet declares the brand field colour");
  assert.equal(field.toUpperCase(), tokens.colors.orangeField.toUpperCase());

  // The panel text colours are brand tokens, so the contrast is asserted
  // against the recorded palette rather than against whatever the
  // stylesheet happens to say today.
  const surfaces = [
    { selector: ".sk-brand-panel-top", variable: "--sk-brand-panel-text-strong", token: "brandPanelTextStrong" },
    { selector: ".sk-brand-panel-bottom", variable: "--sk-brand-panel-text", token: "brandPanelText" },
  ];
  for (const { selector, variable, token } of surfaces) {
    const colour = tokens.colors[token];
    assert.ok(colour, `${token} is a recorded brand colour`);
    const declared = css.match(new RegExp(`${variable}:\\s*(#[0-9a-f]{6})`, "i"))?.[1];
    assert.ok(declared, `${variable} is declared in the stylesheet`);
    assert.equal(declared.toUpperCase(), colour.toUpperCase(), `${variable} matches the recorded ${token} token`);
    const rule = css.split("\n").find((line) => line.startsWith(selector) && line.includes("{"));
    assert.ok(rule, `${selector} has a rule`);
    assert.ok(rule.includes(`var(${variable})`), `${selector} uses ${variable}`);
    const ratio = contrast(declared, field);
    assert.ok(ratio >= 4.5, `${selector} contrast ${ratio.toFixed(3)}:1 on ${field} is below WCAG AA 4.5:1`);
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
