import sharp from "sharp";

/**
 * A node rendered by Figma comes back trimmed to what is visible: a 94x99 button group whose text is narrower than the box
 * is a 62x92 picture. The slot it replaces is the whole 94x99 box, so squeezing the trimmed picture into it (cover) enlarges
 * it and cuts the text off. This puts the picture back in the node's own frame: native scale, centred, transparent around.
 * A render that already fills the frame (use_absolute_bounds) is returned untouched.
 */
export async function padToNodeFrame(png: Buffer, node: { w: number; h: number }): Promise<Buffer> {
  const { width, height } = await sharp(png).metadata();
  if (!width || !height || !node.w || !node.h) return png;

  // The render is at scale 1 or 2 (the route asks for 2; renders cached earlier were 1): the smallest scale whose frame holds it.
  const scale = [1, 2].find((s) => width <= node.w * s + 1 && height <= node.h * s + 1) ?? 2;
  const frameW = Math.round(node.w * scale);
  const frameH = Math.round(node.h * scale);
  if (width >= frameW - 1 && height >= frameH - 1) return png;

  const left = Math.max(0, Math.floor((frameW - width) / 2));
  const top = Math.max(0, Math.floor((frameH - height) / 2));
  return sharp(png)
    .extend({ left, top, right: Math.max(0, frameW - width - left), bottom: Math.max(0, frameH - height - top), background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toBuffer();
}
