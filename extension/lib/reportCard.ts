/** Achievement card metrics + offline PDF/PNG helpers (no heavy deps). */

export const REPORT_CARD_WIDTH = 1080;
export const REPORT_CARD_HEIGHT = 1350;

export type ReportRank =
  | "Lush Lawn Legend"
  | "Sapling Guardian"
  | "Fresh Sprout"
  | "Dry Patch";

export type ReportCardData = {
  userName: string;
  score: number;
  streak: number;
  /** Estimated grams CO2e avoided by using smaller models. */
  co2SavedG: number;
  smallPct: number;
  energyWh: number;
  waterL: number;
  co2g: number;
  platforms: string[];
  dateLabel: string;
  /** Optional sticker URL or data-URI for the Elon/Muskie sticker presenting the report. */
  stickerHref?: string;
};

let cachedStickerDataUrls: Partial<Record<"gotit" | "hello", string>> = {};

/** Load sticker PNG as a base64 data URI so canvas JPEG/PNG export can draw it without tainting. */
export async function resolveStickerDataUrl(
  pose: "gotit" | "hello" = "gotit",
): Promise<string> {
  const cached = cachedStickerDataUrls[pose];
  if (cached) return cached;
  const path =
    pose === "gotit"
      ? "/pets/muskie/sticker-gotit.png"
      : "/pets/muskie/sticker-hello.png";
  try {
    const res = await fetch(path);
    if (!res.ok) return path;
    const blob = await res.blob();
    const dataUrl = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result ?? path));
      reader.onerror = () => reject(new Error("read failed"));
      reader.readAsDataURL(blob);
    });
    cachedStickerDataUrls[pose] = dataUrl;
    return dataUrl;
  } catch {
    return path;
  }
}

export function rankForScore(score: number): ReportRank {
  const s = Math.max(0, Math.min(100, score));
  if (s >= 70) return "Lush Lawn Legend";
  if (s >= 45) return "Sapling Guardian";
  if (s >= 25) return "Fresh Sprout";
  return "Dry Patch";
}

export function slugifyName(name: string): string {
  const s = name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
  return s || "friend";
}

export function reportFileBase(userName: string): string {
  return `touchgrass-report-${slugifyName(userName)}`;
}

/** Escape text for SVG text nodes. */
export function escapeXml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function treeSvg(cx: number, cy: number, scale: number): string {
  return `
  <g transform="translate(${cx} ${cy}) scale(${scale})">
    <ellipse cx="0" cy="2" rx="14" ry="4" fill="#8fd18f" opacity="0.55"/>
    <rect x="-3.5" y="-22" width="7" height="22" rx="2.5" fill="#8b5a2b"/>
    <circle cx="0" cy="-34" r="16" fill="#5cb85c"/>
    <circle cx="-9" cy="-28" r="11" fill="#3d8b40"/>
    <circle cx="9" cy="-29" r="10" fill="#8fd18f"/>
    <circle cx="-4.5" cy="-34" r="2.2" fill="#2d5a27"/>
    <circle cx="4.5" cy="-34" r="2.2" fill="#2d5a27"/>
    <path d="M-4.5 -27 Q0 -23 5 -27" fill="none" stroke="#2d5a27" stroke-width="1.8" stroke-linecap="round"/>
  </g>`;
}

function boltSvg(cx: number, cy: number, scale: number): string {
  return `
  <g transform="translate(${cx} ${cy}) scale(${scale})">
    <circle cx="0" cy="0" r="30" fill="#fff3c4"/>
    <path d="M4 -20 L-14 2 H-2 L-6 22 L18 -2 H6 Z" fill="#f5c400" stroke="#8a5a00" stroke-width="1.6" stroke-linejoin="round"/>
    <circle cx="-4" cy="-1" r="1.8" fill="#8a5a00"/>
    <circle cx="5" cy="-2" r="1.8" fill="#8a5a00"/>
  </g>`;
}

function dropSvg(cx: number, cy: number, scale: number): string {
  return `
  <g transform="translate(${cx} ${cy}) scale(${scale})">
    <circle cx="0" cy="0" r="30" fill="#d6f0ff"/>
    <path d="M0 -19 C0 -19 -15 2 -15 12 C-15 22 -8 28 0 28 C8 28 15 22 15 12 C15 2 0 -19 0 -19 Z" fill="#2ba4e0" stroke="#0b4f74" stroke-width="1.6"/>
    <ellipse cx="-5" cy="7" rx="4" ry="5.5" fill="#9ad8f5" opacity="0.9"/>
    <circle cx="-5" cy="10" r="1.9" fill="#0b4f74"/>
    <circle cx="5" cy="10" r="1.9" fill="#0b4f74"/>
    <path d="M-4 16 Q0 19 4 16" fill="none" stroke="#0b4f74" stroke-width="1.5" stroke-linecap="round"/>
  </g>`;
}

function cloudSvg(cx: number, cy: number, scale: number): string {
  return `
  <g transform="translate(${cx} ${cy}) scale(${scale})">
    <circle cx="0" cy="0" r="30" fill="#e4e8ec"/>
    <ellipse cx="-6" cy="4" rx="16" ry="11" fill="#c5cdd4"/>
    <ellipse cx="9" cy="2" rx="13" ry="10" fill="#8e99a4"/>
    <ellipse cx="0" cy="-6" rx="12" ry="9.5" fill="#c5cdd4"/>
    <circle cx="-5" cy="1" r="1.9" fill="#4a5560"/>
    <circle cx="6" cy="0" r="1.9" fill="#4a5560"/>
    <path d="M-4 7 Q1 10 6 6" fill="none" stroke="#4a5560" stroke-width="1.5" stroke-linecap="round"/>
  </g>`;
}

function muskieStickerSvg(href: string): string {
  const safeHref = escapeXml(href);
  return `
  <g transform="translate(232 424) rotate(-4)">
    <ellipse cx="0" cy="116" rx="84" ry="18" fill="#3d8b40" opacity="0.22"/>
    <image href="${safeHref}" x="-110" y="-154" width="220" height="296" preserveAspectRatio="xMidYMid meet"/>
  </g>`;
}

function flameBadgeSvg(cx: number, cy: number, scale: number): string {
  return `
  <g transform="translate(${cx} ${cy}) scale(${scale})">
    <path d="M0 -14 C-2 -6 -10 -3 -10 5 C-10 11 -5 15 0 15 C5 15 10 11 10 5 C10 -2 4 -5 3 -11 C2 -8 0 -7 0 -14 Z" fill="#ff6a00"/>
    <path d="M0 -7 C-1 -2 -6 0 -6 5 C-6 9 -3 12 0 12 C3 12 6 9 6 5 C6 0 2 -2 1 -6 Z" fill="#ffd000"/>
  </g>`;
}

/** Symmetrically center N items around center=540. */
export function symmetricPositions(
  count: number,
  center = 540,
  spacing = 125,
): number[] {
  const n = Math.max(1, count);
  return Array.from(
    { length: n },
    (_, i) => center + (i - (n - 1) / 2) * spacing,
  );
}

/** Full-bleed SVG achievement card (1080×1350). */
export function buildReportCardSvg(data: ReportCardData): string {
  const name = escapeXml(data.userName.trim() || "Friend");
  const rank = escapeXml(rankForScore(data.score));
  const date = escapeXml(data.dateLabel);
  const plats =
    data.platforms.slice(0, 6).map(escapeXml).join("  ·  ") ||
    "Local AI footprint tracker";
  // Decorative lawn: more trees for a better rank (not a CO2 quantity)
  const treeCount = Math.min(5, Math.max(1, Math.round(data.score / 20)));
  const treeXs = symmetricPositions(treeCount, 540, 128);
  const scoreInt = Math.round(Math.max(0, Math.min(100, data.score)));
  const stickerHref =
    data.stickerHref ||
    (scoreInt >= 70
      ? "/pets/muskie/sticker-gotit.png"
      : "/pets/muskie/sticker-hello.png");

  // 4 symmetrically centered stat cards across x=96..984 (total width=888, cardW=204, gap=24)
  const statCards = [
    {
      x: 96,
      cx: 198,
      wash: "#fff8dc",
      value: `${data.energyWh.toFixed(2)} Wh`,
      label: "power used (est.)",
      art: boltSvg(198, 972, 1.15),
    },
    {
      x: 324,
      cx: 426,
      wash: "#e7f6ff",
      value: `${(data.waterL * 1000).toFixed(1)} mL`,
      label: "water used (est.)",
      art: dropSvg(426, 972, 1.15),
    },
    {
      x: 552,
      cx: 654,
      wash: "#eef1f4",
      value: `${data.co2g.toFixed(2)} g`,
      label: "carbon out (est.)",
      art: cloudSvg(654, 972, 1.15),
    },
    {
      x: 780,
      cx: 882,
      wash: "#e8f6df",
      value: `${data.co2SavedG.toFixed(2)} g`,
      label: "CO₂ saved (est.)",
      art: treeSvg(882, 994, 1.15),
    },
  ];

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${REPORT_CARD_WIDTH}" height="${REPORT_CARD_HEIGHT}" viewBox="0 0 ${REPORT_CARD_WIDTH} ${REPORT_CARD_HEIGHT}">
  <defs>
    <linearGradient id="sky" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#cae9ff"/>
      <stop offset="55%" stop-color="#e8f6df"/>
      <stop offset="100%" stop-color="#d8f0c8"/>
    </linearGradient>
    <linearGradient id="hill" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#8fd18f"/>
      <stop offset="100%" stop-color="#5cb85c"/>
    </linearGradient>
  </defs>

  <!-- outer backdrop -->
  <rect width="100%" height="100%" fill="url(#sky)"/>
  <path d="M0 1080 Q270 1010 540 1060 T1080 1040 L1080 1350 L0 1350 Z" fill="url(#hill)" opacity="0.75"/>
  <path d="M0 1140 Q360 1090 720 1130 T1080 1110 L1080 1350 L0 1350 Z" fill="#3d8b40" opacity="0.3"/>

  <!-- main white card frame -->
  <rect x="48" y="44" width="984" height="1262" rx="48" fill="#ffffff" stroke="#1b4965" stroke-opacity="0.1" stroke-width="3"/>

  <!-- Header Zone -->
  <rect x="390" y="78" width="300" height="40" rx="20" fill="#e7f6ff"/>
  <text x="540" y="104" text-anchor="middle" font-family="Geist, system-ui, -apple-system, sans-serif" font-size="20" font-weight="700" letter-spacing="1.5" fill="#1b4965">Touchgrass Passport</text>

  <text x="540" y="176" text-anchor="middle" font-family="Geist, system-ui, -apple-system, sans-serif" font-size="54" font-weight="800" fill="#1b4965">${name}'s Report</text>

  <!-- Rank + Date pill -->
  <rect x="270" y="202" width="540" height="50" rx="25" fill="#e8f6df"/>
  <text x="540" y="235" text-anchor="middle" font-family="Geist, system-ui, -apple-system, sans-serif" font-size="24" font-weight="700" fill="#3d8b40">${rank}  ·  ${date}</text>

  <!-- Hero Score Box (matches Popup ScoreHero, Elon/Muskie sticker presenting your report!) -->
  <g>
    <rect x="96" y="278" width="888" height="292" rx="36" fill="#e8f6df"/>
    <path d="M96 520 Q310 492 540 518 T984 510 L984 570 L96 570 Z" fill="#8fd18f" opacity="0.55"/>
    <path d="M96 538 Q360 515 640 534 T984 528 L984 570 L96 570 Z" fill="#5cb85c" opacity="0.4"/>

    <!-- Elon/Muskie sticker presenting the report on the left -->
    ${muskieStickerSvg(stickerHref)}

    <!-- Score + Streak cleanly aligned on the right -->
    <text x="410" y="418" text-anchor="start" font-family="Geist, system-ui, -apple-system, sans-serif" font-size="124" font-weight="800" fill="#1b4965">${scoreInt}<tspan font-size="34" font-weight="600" fill="#3d8b40"> / 100</tspan></text>
    <text x="414" y="460" text-anchor="start" font-family="Geist, system-ui, -apple-system, sans-serif" font-size="25" font-weight="600" fill="#2d5a27">touchgrass score  ·  presented by Pip</text>

    <!-- Streak badge inside hero box -->
    <rect x="410" y="484" width="268" height="52" rx="26" fill="#ffffff" fill-opacity="0.92"/>
    ${flameBadgeSvg(446, 510, 1.1)}
    <text x="472" y="518" text-anchor="start" font-family="Geist, system-ui, -apple-system, sans-serif" font-size="24" font-weight="700" fill="#1b4965">${data.streak} day streak</text>
  </g>

  <!-- Symmetrically Centered Tree Grove Stage -->
  <g>
    <rect x="96" y="594" width="888" height="264" rx="36" fill="#f4fbf0" stroke="#d8f0c8" stroke-width="2"/>
    <ellipse cx="540" cy="776" rx="340" ry="22" fill="#d8f0c8"/>
    ${treeXs
      .map((x, i) => treeSvg(x, 774, 1.7 + (i % 2) * 0.15))
      .join("\n")}
    <text x="540" y="828" text-anchor="middle" font-family="Geist, system-ui, -apple-system, sans-serif" font-size="25" font-weight="700" fill="#1b4965">Saved ≈${data.co2SavedG.toFixed(2)} g CO₂e with smaller models  ·  ${data.smallPct}% simple asks</text>
  </g>

  <!-- 4 Symmetrically Aligned Footprint Stat Cards -->
  ${statCards
    .map(
      (c) => `
  <g>
    <rect x="${c.x}" y="884" width="204" height="236" rx="28" fill="${c.wash}"/>
    ${c.art}
    <text x="${c.cx}" y="1062" text-anchor="middle" font-family="Geist, system-ui, -apple-system, sans-serif" font-size="28" font-weight="800" fill="#1b4965">${c.value}</text>
    <text x="${c.cx}" y="1096" text-anchor="middle" font-family="Geist, system-ui, -apple-system, sans-serif" font-size="20" font-weight="500" fill="#71717a">${c.label}</text>
  </g>`,
    )
    .join("\n")}

  <!-- Footer -->
  <rect x="96" y="1148" width="888" height="64" rx="32" fill="#f4f4f5"/>
  <text x="540" y="1188" text-anchor="middle" font-family="Geist, system-ui, -apple-system, sans-serif" font-size="22" font-weight="600" fill="#1b4965">${plats}</text>

  <text x="540" y="1264" text-anchor="middle" font-family="Geist, system-ui, -apple-system, sans-serif" font-size="24" fill="#5fa8d3">touchgrass · local-first AI coach</text>
  <text x="540" y="1306" text-anchor="middle" font-family="Geist, system-ui, -apple-system, sans-serif" font-size="16" fill="#71717a">Estimates from Google (Aug 2025) and OpenAI (Jun 2025) per-prompt averages; not live metering.</text>
</svg>`;
}

function asciiEncode(s: string): Uint8Array {
  const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i) & 0xff;
  return out;
}

function concatBytes(chunks: Uint8Array[]): Uint8Array {
  const total = chunks.reduce((n, c) => n + c.length, 0);
  const out = new Uint8Array(total);
  let off = 0;
  for (const c of chunks) {
    out.set(c, off);
    off += c.length;
  }
  return out;
}

/**
 * Minimal PDF with one page and an embedded JPEG Image XObject.
 */
export function buildPdfFromPng(
  pngBytes: Uint8Array,
  width: number,
  height: number,
): Uint8Array {
  const isJpeg = pngBytes[0] === 0xff && pngBytes[1] === 0xd8;
  if (!isJpeg) {
    throw new Error(
      "PDF embed requires JPEG bytes (use canvas toDataURL image/jpeg)",
    );
  }

  const pageW = 612;
  const pageH = Math.round((pageW * height) / width);

  const objects: Uint8Array[] = [];
  const offsets: number[] = [];

  const pushObj = (body: string | Uint8Array) => {
    offsets.push(0);
    if (typeof body === "string") objects.push(asciiEncode(body));
    else objects.push(body);
  };

  pushObj("1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n");
  pushObj("2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n");
  pushObj(
    `3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pageW} ${pageH}] /Contents 4 0 R /Resources << /XObject << /Im0 5 0 R >> >> >>\nendobj\n`,
  );
  const content = `q\n${pageW} 0 0 ${pageH} 0 0 cm\n/Im0 Do\nQ\n`;
  pushObj(
    `4 0 obj\n<< /Length ${content.length} >>\nstream\n${content}endstream\nendobj\n`,
  );
  const imgHeader = `5 0 obj\n<< /Type /XObject /Subtype /Image /Width ${width} /Height ${height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${pngBytes.length} >>\nstream\n`;
  const imgTail = `\nendstream\nendobj\n`;
  pushObj(
    concatBytes([asciiEncode(imgHeader), pngBytes, asciiEncode(imgTail)]),
  );

  const header = asciiEncode("%PDF-1.4\n");
  const parts: Uint8Array[] = [header];
  let pos = header.length;
  for (let i = 0; i < objects.length; i++) {
    offsets[i] = pos;
    parts.push(objects[i]);
    pos += objects[i].length;
  }

  const xrefStart = pos;
  let xref = `xref\n0 ${objects.length + 1}\n`;
  xref += "0000000000 65535 f \n";
  for (const off of offsets) {
    xref += `${String(off).padStart(10, "0")} 00000 n \n`;
  }
  xref += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefStart}\n%%EOF\n`;
  parts.push(asciiEncode(xref));

  return concatBytes(parts);
}

/** Trigger a browser download from bytes. */
export function downloadBytes(
  bytes: Uint8Array,
  filename: string,
  mime: string,
): void {
  const blob = new Blob([bytes], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function downloadDataUrl(dataUrl: string, filename: string): void {
  const a = document.createElement("a");
  a.href = dataUrl;
  a.download = filename;
  a.click();
}

/** Render SVG string to a canvas, return JPEG data URL + raw bytes. */
export async function svgToJpeg(
  svg: string,
  width = REPORT_CARD_WIDTH,
  height = REPORT_CARD_HEIGHT,
  quality = 0.94,
): Promise<{ dataUrl: string; bytes: Uint8Array }> {
  const blob = new Blob([svg], { type: "image/svg+xml;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  try {
    const img = await loadImage(url);
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("canvas unavailable");
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, width, height);
    ctx.drawImage(img, 0, 0, width, height);
    const dataUrl = canvas.toDataURL("image/jpeg", quality);
    const bytes = dataUrlToBytes(dataUrl);
    return { dataUrl, bytes };
  } finally {
    URL.revokeObjectURL(url);
  }
}

export async function svgToPngDataUrl(
  svg: string,
  width = REPORT_CARD_WIDTH,
  height = REPORT_CARD_HEIGHT,
): Promise<string> {
  const blob = new Blob([svg], { type: "image/svg+xml;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  try {
    const img = await loadImage(url);
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("canvas unavailable");
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, width, height);
    ctx.drawImage(img, 0, 0, width, height);
    return canvas.toDataURL("image/png");
  } finally {
    URL.revokeObjectURL(url);
  }
}

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("image load failed"));
    img.src = url;
  });
}

function dataUrlToBytes(dataUrl: string): Uint8Array {
  const comma = dataUrl.indexOf(",");
  const b64 = comma >= 0 ? dataUrl.slice(comma + 1) : dataUrl;
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export async function exportReportPdf(data: ReportCardData): Promise<void> {
  const stickerHref =
    data.stickerHref ||
    (await resolveStickerDataUrl(data.score >= 70 ? "gotit" : "hello"));
  const svg = buildReportCardSvg({ ...data, stickerHref });
  const { bytes } = await svgToJpeg(svg);
  const pdf = buildPdfFromPng(bytes, REPORT_CARD_WIDTH, REPORT_CARD_HEIGHT);
  downloadBytes(pdf, `${reportFileBase(data.userName)}.pdf`, "application/pdf");
}

export async function exportReportPng(data: ReportCardData): Promise<void> {
  const stickerHref =
    data.stickerHref ||
    (await resolveStickerDataUrl(data.score >= 70 ? "gotit" : "hello"));
  const svg = buildReportCardSvg({ ...data, stickerHref });
  const dataUrl = await svgToPngDataUrl(svg);
  downloadDataUrl(dataUrl, `touchgrass-card-${slugifyName(data.userName)}.png`);
}
