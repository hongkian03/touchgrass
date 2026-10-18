import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  bundledAdapter,
  missingSelectorKeys,
  queryBySelector,
  snapshotHtml,
} from "../lib/adapter";

describe("snapshotHtml", () => {
  it("drops scripts, styles and svgs before the size cap", () => {
    const filler = "x".repeat(500);
    const html =
      `<html><head><script>${filler}</script><style>${filler}</style></head>` +
      `<body><svg viewBox="0 0 1 1"><path d="M0"/></svg>` +
      `<div contenteditable="true" role="textbox">draft</div></body></html>`;
    const out = snapshotHtml(html, 120);
    expect(out).not.toContain("<script");
    expect(out).not.toContain("<style");
    expect(out).not.toContain("<svg");
    expect(out).toContain('role="textbox"');
  });

  it("still caps the length", () => {
    expect(snapshotHtml("<p>" + "a".repeat(50) + "</p>", 10)).toHaveLength(10);
  });
});

describe("chatgpt adapter bundle", () => {
  it("ships versioned selectors (not a TODO stub)", () => {
    const raw = JSON.parse(
      readFileSync(resolve(__dirname, "../adapters/chatgpt.json"), "utf8"),
    );
    expect(raw._todo).toBeUndefined();
    expect(raw.site).toBe("chatgpt");
    expect(raw.version).toBeGreaterThanOrEqual(2);
    expect(raw.selectors.prompt_box).toBeTruthy();
    expect(raw.selectors.send_button).toBeTruthy();
    expect(bundledAdapter("chatgpt")?.version).toBe(raw.version);
  });
});

describe("adapter DOM helpers", () => {
  it("queryBySelector returns null on bad CSS without a document root", () => {
    const root = {
      querySelector: () => {
        throw new Error("bad selector");
      },
    } as unknown as ParentNode;
    expect(queryBySelector("[", root)).toBeNull();
  });

  it("missingSelectorKeys lists failed keys", () => {
    const root = {
      querySelector: () => null,
    } as unknown as ParentNode;
    const adapter = {
      site: "chatgpt",
      version: 2,
      selectors: {
        prompt_box: "#does-not-exist-prompt",
        send_button: "#does-not-exist-send",
      },
    };
    const miss = missingSelectorKeys(adapter, root);
    expect(miss).toEqual(["prompt_box", "send_button"]);
  });
});
