import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
const css = readFileSync(
  new URL("../src/app/app/workspace.css", import.meta.url),
  "utf8",
);
const blocks = [
  ...css.matchAll(
    /(?:\.sti-workspace,\s*\.sti-auth|html\.dark \.sti-workspace,\s*html\.dark \.sti-auth)\s*\{([^}]+)\}/g,
  ),
];
function luminance(hex) {
  const c = [1, 3, 5]
    .map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
    .map((v) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return c[0] * 0.2126 + c[1] * 0.7152 + c[2] * 0.0722;
}
function ratio(a, b) {
  const [low, high] = [luminance(a), luminance(b)].sort((x, y) => x - y);
  return (high + 0.05) / (low + 0.05);
}
for (const [index, block] of blocks.entries()) {
  const tokens = Object.fromEntries(
    [...block[1].matchAll(/--sti-([\w-]+):\s*(#[\da-f]{6})\b/gi)].map((m) => [
      m[1],
      m[2],
    ]),
  );
  test(`${index === 0 ? "day" : "night"}: normal text, pastel labels and primary action meet 4.5:1`, () => {
    for (const fg of ["text", "muted"])
      for (const bg of ["bg", "surface", "column", "sidebar", "hover"])
        assert.ok(
          ratio(tokens[fg], tokens[bg]) >= 4.5,
          `${fg}/${bg}: ${ratio(tokens[fg], tokens[bg])}`,
        );
    for (const tone of ["violet", "pink", "green", "amber", "danger"])
      assert.ok(ratio(tokens[tone], tokens[`${tone}-bg`]) >= 4.5, tone);
    assert.ok(ratio(tokens["on-primary"], tokens.primary) >= 4.5);
  });
  test(`${index === 0 ? "day" : "night"}: identifying control borders and focus meet 3:1`, () => {
    for (const fg of ["control-border", "focus"])
      for (const bg of ["surface", "bg", "column", "sidebar"])
        assert.ok(
          ratio(tokens[fg], tokens[bg]) >= 3,
          `${fg}/${bg}: ${ratio(tokens[fg], tokens[bg])}`,
        );
  });
}
assert.equal(blocks.length, 2, "both themes must be checked");
