import { mkdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const source = fileURLToPath(new URL("../../logo.png", import.meta.url));
const destination = fileURLToPath(new URL("../assets/icon.png", import.meta.url));

// Preserve the existing mark; crop only transparent source margins.
const { data, info } = await sharp(source)
  .ensureAlpha()
  .raw()
  .toBuffer({ resolveWithObject: true });
let left = info.width;
let top = info.height;
let right = -1;
let bottom = -1;
for (let y = 0; y < info.height; y++) {
  for (let x = 0; x < info.width; x++) {
    if (data[(y * info.width + x) * info.channels + info.channels - 1] === 0) continue;
    left = Math.min(left, x);
    top = Math.min(top, y);
    right = Math.max(right, x);
    bottom = Math.max(bottom, y);
  }
}
if (right < left || bottom < top) throw new Error("The source logo is fully transparent");

// Chrome's square-icon guide: artwork inside 96 × 96, with 16 transparent
// pixels on every side, for a true 128 × 128 RGBA PNG. Two stages keep the
// resampling filter from bleeding into the exact outer transparent padding.
const artwork = await sharp(source)
  .extract({ left, top, width: right - left + 1, height: bottom - top + 1 })
  .resize(96, 96, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
  .png()
  .toBuffer();
await mkdir(new URL("../assets/", import.meta.url), { recursive: true });
await sharp(artwork)
  .extend({ top: 16, bottom: 16, left: 16, right: 16, background: { r: 0, g: 0, b: 0, alpha: 0 } })
  .png()
  .toFile(destination);
console.log("Prepared assets/icon.png: 128 × 128 with 16 px transparent padding");
