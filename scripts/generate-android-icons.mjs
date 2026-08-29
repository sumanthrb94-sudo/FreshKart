/**
 * Renders the Android launcher icons: the 🛒 emblem from the sign-in screen
 * (see `BrandAuthScreen`) on the brand green tile, so the launcher icon is the
 * same cart users meet when they open the app.
 *
 * The emoji is drawn from the system colour-emoji font rather than traced by
 * hand, which is why this is a build step and not a checked-in PNG.
 *
 * Three shapes come out of it:
 *   - ic_launcher            legacy square icon, rounded corners
 *   - ic_launcher_round      legacy round icon, circle-masked
 *   - ic_launcher_foreground adaptive foreground, drawn edge-to-edge with the
 *                            cart inside the 66/108dp safe zone the launcher
 *                            mask is guaranteed not to clip
 *
 * Usage: npm run icons:android
 */
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import sharp from "sharp";

const RES = join(process.cwd(), "android", "app", "src", "main", "res");

// Brand green, matching the sign-in screen's gradient.
const GRADIENT = `
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#10b981"/>
      <stop offset="100%" stop-color="#047857"/>
    </linearGradient>
  </defs>`;

const EMOJI_FONT = "C:/Windows/Fonts/seguiemj.ttf";

const DENSITIES = [
  { dir: "mipmap-mdpi", legacy: 48, foreground: 108 },
  { dir: "mipmap-hdpi", legacy: 72, foreground: 162 },
  { dir: "mipmap-xhdpi", legacy: 96, foreground: 216 },
  { dir: "mipmap-xxhdpi", legacy: 144, foreground: 324 },
  { dir: "mipmap-xxxhdpi", legacy: 192, foreground: 432 },
];

const tile = (size, radius) =>
  Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}">${GRADIENT}` +
      `<rect width="${size}" height="${size}" rx="${radius}" ry="${radius}" fill="url(#bg)"/></svg>`,
  );

const circleMask = (size) =>
  Buffer.from(
    `<svg width="${size}" height="${size}"><circle cx="${size / 2}" cy="${size / 2}" r="${size / 2}" fill="#fff"/></svg>`,
  );

/** The cart emblem, rendered in colour and scaled to `box` px wide. */
async function cart(box) {
  return sharp({
    text: {
      text: "🛒",
      font: "Segoe UI Emoji",
      fontfile: EMOJI_FONT,
      width: box,
      height: box,
      rgba: true,
    },
  })
    .png()
    .toBuffer();
}

/** Cart centred on a green tile. */
async function compose(size, radius, coverage) {
  const emblem = await cart(Math.round(size * coverage));
  const { width, height } = await sharp(emblem).metadata();
  return sharp(tile(size, radius))
    .composite([
      {
        input: emblem,
        left: Math.round((size - width) / 2),
        top: Math.round((size - height) / 2),
      },
    ])
    .png()
    .toBuffer();
}

for (const { dir, legacy, foreground } of DENSITIES) {
  // Legacy icons own their corners; 22% matches Android's own rounding.
  const square = await compose(legacy, Math.round(legacy * 0.22), 0.72);
  writeFileSync(join(RES, dir, "ic_launcher.png"), square);

  writeFileSync(
    join(RES, dir, "ic_launcher_round.png"),
    await sharp(await compose(legacy, 0, 0.72))
      .composite([{ input: circleMask(legacy), blend: "dest-in" }])
      .png()
      .toBuffer(),
  );

  // Adaptive foreground: square tile, cart kept inside the safe zone.
  writeFileSync(
    join(RES, dir, "ic_launcher_foreground.png"),
    await compose(foreground, 0, 0.55),
  );

  console.log(`${dir}: ${legacy}px legacy, ${foreground}px foreground`);
}
