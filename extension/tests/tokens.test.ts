import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

// Literals duplicated here on purpose (issue #2 test law).
// Do not import these from a shared tokens.ts that the app also owns as sole source.
const EXPECTED = {
  "frozen-water": "#bee9e8",
  "pacific-blue": "#62b6cb",
  "yale-blue": "#1b4965",
  "pale-sky": "#cae9ff",
  "fresh-sky": "#5fa8d3",
} as const;

describe("Puddle CSS tokens", () => {
  const css = readFileSync(
    resolve(__dirname, "../assets/puddle.css"),
    "utf8",
  );

  it("declares each palette hex as a :root variable", () => {
    for (const [name, hex] of Object.entries(EXPECTED)) {
      const re = new RegExp(`--${name}:\\s*${hex}\\b`, "i");
      expect(css, `missing --${name}: ${hex}`).toMatch(re);
    }
  });

  it("does not set yale-blue to a wrong hex", () => {
    expect(css).not.toMatch(/--yale-blue:\s*#000000/i);
    expect(css).toMatch(/--yale-blue:\s*#1b4965\b/i);
  });

  it("registers Castoro via local @font-face, not a google fonts URL", () => {
    expect(css).toMatch(/font-family:\s*["']Castoro["']/);
    expect(css).toMatch(/Castoro-Regular\.woff2/);
    expect(css).not.toMatch(/fonts\.googleapis\.com/);
  });
});

describe("Pip token-only SVG", () => {
  const pip = readFileSync(resolve(__dirname, "../components/Pip.tsx"), "utf8");

  it("uses only CSS var token fills, no hard-coded off-palette hex", () => {
    const hexes = pip.match(/#[0-9a-fA-F]{3,8}/g) ?? [];
    expect(hexes).toEqual([]);
    expect(pip).toMatch(/var\(--pacific-blue\)/);
    expect(pip).toMatch(/var\(--frozen-water\)/);
    expect(pip).toMatch(/var\(--yale-blue\)/);
    expect(pip).toMatch(/var\(--fresh-sky\)/);
    expect(pip).toMatch(/var\(--pale-sky\)/);
  });
});

describe("Puddle branding strings", () => {
  it("popup title is Puddle, not Prompt Print", () => {
    const html = readFileSync(
      resolve(__dirname, "../entrypoints/popup/index.html"),
      "utf8",
    );
    expect(html).toMatch(/<title>\s*Puddle\s*<\/title>/);
    expect(html).not.toMatch(/Prompt Print/i);
  });

  it("manifest name in wxt.config is Puddle", () => {
    const cfg = readFileSync(resolve(__dirname, "../wxt.config.ts"), "utf8");
    expect(cfg).toMatch(/name:\s*["']Puddle["']/);
    expect(cfg).toMatch(/host_permissions:\s*\[\s*\]/);
    expect(cfg).toMatch(/["']storage["']/);
    expect(cfg).toMatch(/["']tabs["']/);
    expect(cfg).toMatch(/["']scripting["']/);
  });

  it("built manifest keeps host_permissions empty", () => {
    const raw = readFileSync(
      resolve(__dirname, "../.output/chrome-mv3/manifest.json"),
      "utf8",
    );
    const manifest = JSON.parse(raw) as {
      name: string;
      permissions: string[];
      host_permissions?: string[];
    };
    expect(manifest.name).toBe("Puddle");
    expect(manifest.permissions).toEqual(
      expect.arrayContaining(["storage", "tabs", "scripting"]),
    );
    expect(manifest.host_permissions ?? []).toEqual([]);
  });
});
