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
  trees: number;
  smallPct: number;
  energyWh: number;
  waterL: number;
  co2g: number;
  platforms: string[];
  dateLabel: string;
};

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
    <rect x="-3" y="-18" width="6" height="18" rx="2" fill="#8b5a2b"/>
    <circle cx="0" cy="-28" r="14" fill="#5cb85c"/>
    <circle cx="-7" cy="-24" r="9" fill="#3d8b40"/>
    <circle cx="7" cy="-25" r="8" fill="#8fd18f"/>
    <circle cx="-4" cy="-28" r="2" fill="#2d5a27"/>
    <circle cx="4" cy="-28" r="2" fill="#2d5a27"/>
    <path d="M-4 -22 Q0 -18 5 -22" fill="none" stroke="#2d5a27" stroke-width="1.5" stroke-linecap="round"/>
  </g>`;
}

function boltSvg(cx: number, cy: number, scale: number): string {
  return `
  <g transform="translate(${cx} ${cy}) scale(${scale})">
    <circle cx="0" cy="0" r="28" fill="#fff3c4"/>
    <path d="M4 -20 L-14 2 H-2 L-6 22 L18 -2 H6 Z" fill="#f5c400" stroke="#8a5a00" stroke-width="1.5" stroke-linejoin="round"/>
  </g>`;
}

function dropSvg(cx: number, cy: number, scale: number): string {
  return `
  <g transform="translate(${cx} ${cy}) scale(${scale})">
    <circle cx="0" cy="0" r="28" fill="#d6f0ff"/>
    <path d="M0 -18 C0 -18 -14 2 -14 12 C-14 22 -8 28 0 28 C8 28 14 22 14 12 C14 2 0 -18 0 -18 Z" fill="#2ba4e0" stroke="#0b4f74" stroke-width="1.5"/>
  </g>`;
}

function cloudSvg(cx: number, cy: number, scale: number): string {
  return `
  <g transform="translate(${cx} ${cy}) scale(${scale})">
    <circle cx="0" cy="0" r="28" fill="#eef1f4"/>
    <ellipse cx="-6" cy="4" rx="16" ry="11" fill="#c5cdd4"/>
    <ellipse cx="8" cy="2" rx="13" ry="10" fill="#8e99a4"/>
    <ellipse cx="0" cy="-6" rx="11" ry="9" fill="#c5cdd4"/>
  </g>`;
}

function pipSvg(cx: number, cy: number, scale: number): string {
  // Simplified muskie blob so the card stays self-contained (no external PNG).
  return `
  <g transform="translate(${cx} ${cy}) scale(${scale})">
    <ellipse cx="0" cy="8" rx="36" ry="28" fill="#5fa8d3"/>
    <ellipse cx="-6" cy="0" rx="22" ry="20" fill="#62b6cb"/>
    <circle cx="-10" cy="-2" r="4" fill="#1b4965"/>
    <circle cx="8" cy="-2" r="4" fill="#1b4965"/>
    <circle cx="-9" cy="-3" r="1.4" fill="#ffffff"/>
    <circle cx="9" cy="-3" r="1.4" fill="#ffffff"/>
    <path d="M-8 10 Q0 16 10 9" fill="none" stroke="#1b4965" stroke-width="2.2" stroke-linecap="round"/>
    <ellipse cx="-18" cy="18" rx="10" ry="6" fill="#bee9e8" opacity="0.9"/>
  </g>`;
}

/** Full-bleed SVG achievement card (1080×1350). */
export function buildReportCardSvg(data: ReportCardData): string {
  const name = escapeXml(data.userName.trim() || "Friend");
  const rank = escapeXml(rankForScore(data.score));
  const date = escapeXml(data.dateLabel);
  const plats = data.platforms.slice(0, 6).map(escapeXml).join(" · ") || "No platforms yet";
  const treeCount = Math.min(5, Math.max(1, Math.round(data.trees) || 1));
  const treeOffsets = [-160, -80, 0, 80, 160].slice(0, treeCount);

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${REPORT_CARD_WIDTH}" height="${REPORT_CARD_HEIGHT}" viewBox="0 0 ${REPORT_CARD_WIDTH} ${REPORT_CARD_HEIGHT}">
  <defs>
    <linearGradient id="sky" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#cae9ff"/>
      <stop offset="55%" stop-color="#e8f6df"/>
      <stop offset="100%" stop-color="#e4f5d8"/>
    </linearGradient>
    <linearGradient id="hill" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#8fd18f"/>
      <stop offset="100%" stop-color="#5cb85c"/>
    </linearGradient>
  </defs>
  <rect width="100%" height="100%" fill="url(#sky)"/>
  <path d="M0 980 Q270 900 540 960 T1080 940 L1080 1350 L0 1350 Z" fill="url(#hill)" opacity="0.85"/>
  <path d="M0 1040 Q360 980 720 1030 T1080 1010 L1080 1350 L0 1350 Z" fill="#3d8b40" opacity="0.35"/>

  <!-- card frame -->
  <rect x="48" y="48" width="984" height="1254" rx="48" fill="#ffffff" fill-opacity="0.92" stroke="#1b4965" stroke-opacity="0.12" stroke-width="3"/>

  <text x="540" y="130" text-anchor="middle" font-family="Georgia, serif" font-size="36" fill="#1b4965">Touchgrass Passport</text>
  <text x="540" y="190" text-anchor="middle" font-family="system-ui, sans-serif" font-size="48" font-weight="700" fill="#1b4965">${name}'s Report</text>
  <text x="540" y="235" text-anchor="middle" font-family="system-ui, sans-serif" font-size="22" fill="#71717a">${date}</text>

  <!-- rank badge -->
  <rect x="300" y="260" width="480" height="56" rx="28" fill="#e8f6df"/>
  <text x="540" y="297" text-anchor="middle" font-family="system-ui, sans-serif" font-size="26" font-weight="600" fill="#3d8b40">${rank}</text>

  ${pipSvg(540, 420, 2.2)}

  <!-- score -->
  <text x="540" y="560" text-anchor="middle" font-family="system-ui, sans-serif" font-size="120" font-weight="700" fill="#1b4965">${Math.round(data.score)}</text>
  <text x="540" y="600" text-anchor="middle" font-family="system-ui, sans-serif" font-size="28" fill="#71717a">/ 100 touchgrass score</text>

  <!-- streak pill -->
  <rect x="390" y="630" width="300" height="52" rx="26" fill="#fff3c4"/>
  <text x="540" y="665" text-anchor="middle" font-family="system-ui, sans-serif" font-size="24" font-weight="600" fill="#8a5a00">${data.streak} day streak</text>

  <!-- forest -->
  ${treeOffsets.map((ox, i) => treeSvg(540 + ox, 820, 1.6 + (i % 3) * 0.15)).join("\n")}

  <!-- stats row -->
  ${boltSvg(220, 980, 1.1)}
  ${dropSvg(420, 980, 1.1)}
  ${cloudSvg(620, 980, 1.1)}
  ${treeSvg(820, 1000, 1.3)}

  <text x="220" y="1045" text-anchor="middle" font-family="system-ui, sans-serif" font-size="22" font-weight="600" fill="#1b4965">${data.energyWh.toFixed(1)} Wh</text>
  <text x="420" y="1045" text-anchor="middle" font-family="system-ui, sans-serif" font-size="22" font-weight="600" fill="#1b4965">${data.waterL.toFixed(2)} L</text>
  <text x="620" y="1045" text-anchor="middle" font-family="system-ui, sans-serif" font-size="22" font-weight="600" fill="#1b4965">${data.co2g.toFixed(1)} g</text>
  <text x="820" y="1045" text-anchor="middle" font-family="system-ui, sans-serif" font-size="22" font-weight="600" fill="#1b4965">${data.trees.toFixed(1)} trees</text>

  <text x="540" y="1110" text-anchor="middle" font-family="system-ui, sans-serif" font-size="26" fill="#1b4965">Planted ${data.trees.toFixed(1)} virtual saplings</text>
  <text x="540" y="1150" text-anchor="middle" font-family="system-ui, sans-serif" font-size="22" fill="#71717a">${data.smallPct}% smart-routed to small models</text>

  <text x="540" y="1220" text-anchor="middle" font-family="system-ui, sans-serif" font-size="20" fill="#71717a">${plats}</text>
  <text x="540" y="1265" text-anchor="middle" font-family="Georgia, serif" font-size="22" fill="#5fa8d3">touch grass · share freely</text>
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
 * Minimal PDF with one page and an embedded JPEG/PNG (Image XObject).
 * Prefer PNG from canvas; fall back path still works for JPEG.
 */
export function buildPdfFromPng(
  pngBytes: Uint8Array,
  width: number,
  height: number,
): Uint8Array {
  // Convert PNG → raw RGB via a tiny approach: embed as XObject with Flate? 
  // Chrome canvas toDataURL('image/jpeg') is more reliable for PDF Image/DCTDecode.
  // Callers should pass JPEG bytes when possible. Detect format by magic.
  const isJpeg = pngBytes[0] === 0xff && pngBytes[1] === 0xd8;
  const isPng =
    pngBytes[0] === 0x89 &&
    pngBytes[1] === 0x50 &&
    pngBytes[2] === 0x4e &&
    pngBytes[3] === 0x47;

  if (!isJpeg && !isPng) {
    throw new Error("Expected JPEG or PNG bytes for PDF embed");
  }

  // PDF page size in points (1 pt = 1/72"). Match portrait card aspect.
  const pageW = 612; // letter width
  const pageH = Math.round((pageW * height) / width);

  const filter = isJpeg ? "/DCTDecode" : "/FlateDecode";
  // PNG as FlateDecode of raw file won't render as a bitmap correctly.
  // Require JPEG for reliable offline PDF without a decoder.
  if (!isJpeg) {
    throw new Error("PDF embed requires JPEG bytes (use canvas toDataURL image/jpeg)");
  }

  const objects: Uint8Array[] = [];
  const offsets: number[] = [];

  const pushObj = (body: string | Uint8Array) => {
    offsets.push(0); // filled later
    if (typeof body === "string") objects.push(asciiEncode(body));
    else objects.push(body);
  };

  // 1: Catalog
  pushObj("1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n");
  // 2: Pages
  pushObj("2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n");
  // 3: Page
  pushObj(
    `3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pageW} ${pageH}] /Contents 4 0 R /Resources << /XObject << /Im0 5 0 R >> >> >>\nendobj\n`,
  );
  // 4: Content stream — draw image full page
  const content = `q\n${pageW} 0 0 ${pageH} 0 0 cm\n/Im0 Do\nQ\n`;
  pushObj(
    `4 0 obj\n<< /Length ${content.length} >>\nstream\n${content}endstream\nendobj\n`,
  );
  // 5: Image XObject
  const imgHeader = `5 0 obj\n<< /Type /XObject /Subtype /Image /Width ${width} /Height ${height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter ${filter} /Length ${pngBytes.length} >>\nstream\n`;
  const imgTail = `\nendstream\nendobj\n`;
  pushObj(concatBytes([asciiEncode(imgHeader), pngBytes, asciiEncode(imgTail)]));

  // Assemble with correct offsets
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
  quality = 0.92,
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
  const svg = buildReportCardSvg(data);
  const { bytes } = await svgToJpeg(svg);
  const pdf = buildPdfFromPng(bytes, REPORT_CARD_WIDTH, REPORT_CARD_HEIGHT);
  downloadBytes(pdf, `${reportFileBase(data.userName)}.pdf`, "application/pdf");
}

export async function exportReportPng(data: ReportCardData): Promise<void> {
  const svg = buildReportCardSvg(data);
  const dataUrl = await svgToPngDataUrl(svg);
  downloadDataUrl(dataUrl, `touchgrass-card-${slugifyName(data.userName)}.png`);
}
