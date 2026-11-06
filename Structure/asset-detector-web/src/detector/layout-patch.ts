import { isAllowedScale, isAllowedValue, isAllowedZIndex } from "./layout-schema";

const KEYS = new Set(["left", "top", "width", "height", "scaleX", "scaleY", "zIndex", "hidden"]);

/**
 * A scale-only element (a picture in the page flow) has no left/top to change, nothing to resize with width/height
 * and no stacking order: only the scale and hiding are accepted for it.
 */
export function patchAllowedFor(mode: "full" | "scale" | undefined, patch: Record<string, unknown>): boolean {
  if (mode !== "scale") return true;
  return Object.keys(patch).every((k) => k === "scaleX" || k === "scaleY" || k === "hidden");
}

/** A request body's patch: only known keys; lengths are plain CSS lengths; null removes a key. */
export function isOverridePatch(v: unknown): v is Record<string, string | number | boolean | null> {
  if (!v || typeof v !== "object" || Array.isArray(v)) return false;
  const entries = Object.entries(v as Record<string, unknown>);
  if (entries.length === 0) return false;
  return entries.every(([k, val]) => {
    if (!KEYS.has(k)) return false;
    if (val === null) return true;
    if (k === "zIndex") return isAllowedZIndex(val);
    if (k === "scaleX" || k === "scaleY") return isAllowedScale(val);
    if (k === "hidden") return typeof val === "boolean";
    return isAllowedValue(k as "left" | "top" | "width" | "height", val);
  });
}
