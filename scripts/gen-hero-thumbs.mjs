/**
 * Generates portrait thumbnails for hero cards.
 * Input:  public/heroes/<class>.png   (640×1024 full portrait)
 * Output: public/heroes/<class>@thumb.webp  (360×360, cropped top, WebP)
 *
 * At a 180px CSS card width on a 2× device the thumb renders at exactly
 * 360 physical pixels — a perfect 1:1 hit, no scaling artifacts.
 *
 * Run: node scripts/gen-hero-thumbs.mjs
 */
import sharp from 'sharp';
import { readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const heroDir = path.join(__dirname, '../apps/web/public/heroes');

const files = (await readdir(heroDir)).filter(
  (f) => f.endsWith('.png') && !f.includes('@'),
);

for (const file of files) {
  const src = path.join(heroDir, file);
  const stem = file.replace(/\.png$/, '');
  const dst = path.join(heroDir, `${stem}@thumb.webp`);

  // Crop the top 40% of the portrait (the face/torso area in AI art)
  // then resize to 360×400 with Lanczos resampling.
  const meta = await sharp(src).metadata();
  const cropHeight = Math.round((meta.height ?? 1024) * 0.42);

  await sharp(src)
    .extract({ left: 0, top: 0, width: meta.width ?? 640, height: cropHeight })
    .resize(360, 400, { fit: 'cover', position: 'top', kernel: 'lanczos3' })
    .webp({ quality: 88 })
    .toFile(dst);

  console.log(`✓ ${stem}@thumb.webp`);
}
console.log('Done.');
