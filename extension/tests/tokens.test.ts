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

  it("registers Castoro + Geist via local @font-face, not google fonts", () => {
    expect(css).toMatch(/font-family:\s*["']Castoro["']/);
    expect(css).toMatch(/Castoro-Regular\.woff2/);
    expect(css).toMatch(/font-family:\s*["']Geist["']/);
    expect(css).toMatch(/Geist-Regular\.woff2/);
    expect(css).toMatch(/\[data-testid=["']puddle-title["']\]/);
    expect(css).not.toMatch(/fonts\.googleapis\.com/);
  });
});

describe("Pip = muskie Codex pet", () => {
  const pip = readFileSync(resolve(__dirname, "../components/Pip.tsx"), "utf8");
  const pet = JSON.parse(
    readFileSync(
      resolve(__dirname, "../public/pets/muskie/pet.json"),
      "utf8",
    ),
  ) as { id: string; spritesheetPath: string };
  const css = readFileSync(resolve(__dirname, "../assets/puddle.css"), "utf8");

  it("points at muskie sticker + spritesheet, no off-palette SVG hex", () => {
    expect(pet.id).toBe("muskie");
    expect(pet.spritesheetPath).toBe("spritesheet.webp");
    expect(pip).toMatch(/muskie\/spritesheet\.webp/);
    expect(pip).toMatch(/muskie\/sticker-hello\.png/);
    expect(pip).toMatch(/muskie\/sticker-gotit\.png/);
    const hexes = pip.match(/#[0-9a-fA-F]{3,8}/g) ?? [];
    expect(hexes).toEqual([]);
  });

  it("uses white surface for extension chrome", () => {
    expect(css).toMatch(/--surface:\s*#ffffff\b/i);
    expect(css).toMatch(/background:\s*#ffffff/);
  });
});

describe("onboarding chrome", () => {
  const onboard = readFileSync(
    resolve(__dirname, "../entrypoints/onboarding/App.tsx"),
    "utf8",
  );

  it("shows Ahead-style Pip sticker above Puddle title", () => {
    expect(onboard).toMatch(/puddle-title/);
    expect(onboard).toMatch(/<Pip/);
    expect(onboard).toMatch(/variant=["']sticker["']/);
    expect(onboard).toMatch(/from ["'].*ui\/button["']/);
    expect(onboard).toMatch(/from ["'].*ui\/input["']/);
  });
});

describe("Touchgrass branding strings", () => {
  it("popup title is Touchgrass, not Prompt Print", () => {
    const html = readFileSync(
      resolve(__dirname, "../entrypoints/popup/index.html"),
      "utf8",
    );
    expect(html).toMatch(/<title>\s*Touchgrass\s*<\/title>/);
    expect(html).not.toMatch(/Prompt Print/i);
  });

  it("manifest name in wxt.config is Touchgrass", () => {
    const cfg = readFileSync(resolve(__dirname, "../wxt.config.ts"), "utf8");
    expect(cfg).toMatch(/name:\s*["']Touchgrass["']/);
    expect(cfg).toMatch(/api\.groq\.com/);
    expect(cfg).toMatch(/["']storage["']/);
    expect(cfg).toMatch(/["']tabs["']/);
    expect(cfg).toMatch(/["']scripting["']/);
  });

  it("built manifest: Groq active; AI sites optional until onboarding", () => {
    const raw = readFileSync(
      resolve(__dirname, "../.output/chrome-mv3/manifest.json"),
      "utf8",
    );
    const manifest = JSON.parse(raw) as {
      name: string;
      permissions: string[];
      host_permissions?: string[];
      optional_host_permissions?: string[];
    };
    expect(manifest.name).toBe("Touchgrass");
    expect(manifest.permissions).toEqual(
      expect.arrayContaining(["storage", "tabs", "scripting"]),
    );
    expect(manifest.host_permissions ?? []).toEqual(
      expect.arrayContaining([
        "https://api.groq.com/*",
        "http://127.0.0.1:8000/*",
        "http://localhost:8000/*",
      ]),
    );
    expect(manifest.optional_host_permissions ?? []).toEqual(
      expect.arrayContaining([
        "https://chatgpt.com/*",
        "https://claude.ai/*",
        "https://chat.mistral.ai/*",
      ]),
    );
  });
});
