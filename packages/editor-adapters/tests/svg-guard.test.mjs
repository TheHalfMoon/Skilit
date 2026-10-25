import assert from "node:assert/strict";
import test from "node:test";
import {
  hasSvgEventHandlerAttribute,
  inspectSvgDimensionsLinear,
} from "../src/svg-guard.ts";
import {
  inspectOpenpencilSvg,
  validateOpenpencilSvgOutput,
} from "../src/openpencil-adapter.ts";
import {
  inspectSvg,
  validateSvgOutput,
} from "../src/vector-adapter.ts";

const good = '<svg xmlns="http://www.w3.org/2000/svg" width="96" height="48.5"><rect width="2" height="4"/></svg>';

test("linear SVG attribute scan rejects active event attributes in both adapters", () => {
  const risky = [
    '<svg width="3" height="5"><rect ONLOAD = "boom()"/></svg>',
    '<svg width="3" height="5"><path onmousemove\t= "boom()"/></svg>',
    '<svg width="3" height="5"><path onfocus\n= "boom()"/></svg>',
  ];
  for (const svg of risky) {
    assert.equal(hasSvgEventHandlerAttribute(svg), true);
    assert.throws(() => validateSvgOutput(svg, 8192));
    assert.throws(() => validateOpenpencilSvgOutput(svg, 8192));
  }
  assert.equal(hasSvgEventHandlerAttribute(good), false);
  assert.equal(hasSvgEventHandlerAttribute('on= on2= on ABC='), false);
});

test("linear parser preserves expected SVG dimensions and rejects malformed operands", () => {
  assert.deepEqual(inspectSvgDimensionsLinear(good), { width: 96, height: 48.5 });
  assert.equal(inspectSvg(good).width, 96);
  assert.equal(inspectOpenpencilSvg(good).height, 48.5);
  assert.deepEqual(
    inspectSvgDimensionsLinear('<svg data-label="İ" WIDTH="14" HEIGHT="9"></svg>'),
    { width: 14, height: 9 },
    "Unicode case folding must not shift attribute offsets",
  );
  for (const bad of [
    '<svg datawidth="12" height="10"></svg>',
    '<svg width="12.3.4" height="10"></svg>',
    '<svg width="10" height="-20"></svg>',
    '<svg width="0" height="10"></svg>',
  ]) {
    assert.throws(() => inspectSvg(bad));
    assert.throws(() => inspectOpenpencilSvg(bad));
  }
});

test("linear guard agrees with legacy event expression on bounded synthetic text", () => {
  let seed = 0x742ac421;
  const alphabet = "onabcXYZ =\t;!#/0";
  for (let trial = 0; trial < 2000; trial += 1) {
    let sample = "";
    for (let k = 0; k < 60; k += 1) {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
      sample += alphabet[seed % alphabet.length];
    }
    const expected = /on[a-z]+\s*=/i.test(sample);
    assert.equal(hasSvgEventHandlerAttribute(sample), expected, "Mismatch at synthetic trial " + trial);
  }
});

test("pathological repeated prefixes stay bounded and never bypass the deny gates", () => {
  const repeated = '<svg'.repeat(30000);
  const huge = '<svg width="12" height="34">' + 'onononon'.repeat(30000) + '</svg>';
  assert.deepEqual(inspectSvgDimensionsLinear(repeated), { width: NaN, height: NaN });
  assert.equal(hasSvgEventHandlerAttribute('onononon'.repeat(30000)), false);
  assert.equal(hasSvgEventHandlerAttribute(huge), false);
  assert.equal(hasSvgEventHandlerAttribute('on'.repeat(30000) + 'a='), true);
  assert.throws(() => validateSvgOutput('<svg width="12" height="34" onload="x">' + '</svg>', 8192));
});
