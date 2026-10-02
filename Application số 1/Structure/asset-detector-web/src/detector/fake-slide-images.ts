import sharp from "sharp";
import fs from "node:fs/promises";
import path from "node:path";

/**
 * NewsMainSlider's <img> is `object-contain aspect-560/450` with NO width
 * class — it renders at the SOURCE image's own intrinsic pixel size, not
 * stretched to fill its 560px container. The real CMS presumably always
 * uploads ~560x450 slide images, so this never mattered in production.
 * FAKE_SLIDES borrowing unrelated assets (a 1920px-wide banner, a
 * leaderboard background, etc.) broke that assumption, visibly mismatching
 * the fixed-size news panel next to it. Generating correctly-dimensioned
 * placeholder images fixes the actual cause instead of touching the real
 * component's CSS (which would affect production, not just this preview).
 */
const DEFAULT_SIZE = { width: 560, height: 450 };
const COLORS = ["#b3272a", "#93691a", "#29804f"]; // accent / gold / good — distinct, on-brand

export async function generateFakeSlideImages(
  cloneDir: string,
  size: { width: number; height: number } = DEFAULT_SIZE
): Promise<string[]> {
  const WIDTH = size.width;
  const HEIGHT = size.height;
  const dir = path.join(cloneDir, "public", "assets", "_fake");
  await fs.mkdir(dir, { recursive: true });

  const publicPaths: string[] = [];
  for (let i = 0; i < 3; i++) {
    const label = `SLIDE DEMO ${i + 1}`;
    const color = COLORS[i % COLORS.length];
    const svg = `
      <svg width="${WIDTH}" height="${HEIGHT}" xmlns="http://www.w3.org/2000/svg">
        <rect width="100%" height="100%" fill="${color}"/>
        <rect x="8" y="8" width="${WIDTH - 16}" height="${HEIGHT - 16}" fill="none" stroke="#ffffff" stroke-opacity="0.35" stroke-width="2"/>
        <text x="50%" y="48%" font-family="Arial, sans-serif" font-size="34" font-weight="700" fill="#ffffff" text-anchor="middle">${label}</text>
        <text x="50%" y="60%" font-family="Arial, sans-serif" font-size="16" fill="#ffffff" fill-opacity="0.85" text-anchor="middle">${WIDTH}×${HEIGHT} placeholder — not real content</text>
      </svg>`;
    const fileName = `slide-${i + 1}.png`;
    const destPath = path.join(dir, fileName);
    await sharp(Buffer.from(svg)).png().toFile(destPath);
    publicPaths.push(`/assets/_fake/${fileName}`);
  }
  return publicPaths;
}
