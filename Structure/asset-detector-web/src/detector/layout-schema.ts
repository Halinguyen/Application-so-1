/**
 * Visual-editing layout (see Structure/14-PLAN-visual-editing.md).
 * The layout is stored apart from the template source and compiled into one
 * CSS override file, so the template itself is never edited.
 */
export const LAYOUT_SCHEMA_VERSION = 1;

export type LayoutBreakpoint = "desktop" | "tablet" | "mobile";
export const LAYOUT_BREAKPOINTS: LayoutBreakpoint[] = ["desktop", "tablet", "mobile"];

/** Values are CSS strings so % (preferred, parent-relative) and px both work. */
export interface ElementOverride {
  left?: string;
  top?: string;
  width?: string;
  height?: string;
  /** 1 = the template's own size. Scales the element and everything in it (CSS `scale`). */
  scaleX?: number;
  scaleY?: number;
  zIndex?: number;
  hidden?: boolean;
}

export interface LayoutElement {
  assetId?: string;
  overrides: Partial<Record<LayoutBreakpoint, ElementOverride>>;
}

export interface LayoutFile {
  schemaVersion: number;
  gameId: string;
  templateRef?: { version?: string; contentHash?: string };
  elements: Record<string, LayoutElement>;
}

/** One editable unit found in the clone (written by the injector). */
export interface EditManifestEntry {
  editId: string;
  sourcePath: string;
  slot: string;
  assets: string[];
  editable: true;
  /**
   * "full" (default): positioned element, can be moved, scaled, restacked and hidden.
   * "scale": a picture in the page flow (no left/top to change): it can only be scaled and hidden.
   */
  mode?: "full" | "scale";
  /**
   * "api": the picture comes from data (an API response, a CMS value), so its place and size can be edited
   * but its content cannot: there is no file to replace. Absent for pictures that are files in the repo.
   */
  source?: "api";
}

export interface EditManifest {
  schemaVersion: number;
  gameId: string;
  entries: EditManifestEntry[];
  /** Slots the injector refused, with the reason — shown to the operator, never guessed. */
  skipped: { sourcePath: string; line: number; assetPath: string; reason: string }[];
}

// Slot ids: lowercase words joined by . - _ and an optional ~N duplicate suffix.
const EDIT_ID = /^[a-z0-9][a-z0-9._-]*(~\d+)?$/;
// Only plain lengths: this string goes into generated CSS, so nothing else may pass.
const LENGTH = /^-?\d+(\.\d+)?(%|px|vw|vh|rem|em)?$/;

export function emptyLayout(gameId: string): LayoutFile {
  return { schemaVersion: LAYOUT_SCHEMA_VERSION, gameId, elements: {} };
}

export function isValidEditId(id: string): boolean {
  return EDIT_ID.test(id);
}

export function isValidLength(v: string): boolean {
  return LENGTH.test(v.trim());
}

/** Operator limits. public/ve/protocol.js holds the same numbers (a test keeps them equal). */
export const LIMITS = { zMin: -10, zMax: 999, pctMin: -50, pctMax: 150, sizePctMax: 200, absMax: 10000, scaleMin: 0.1, scaleMax: 5 };

export function isAllowedScale(v: unknown): boolean {
  return typeof v === "number" && Number.isFinite(v) && v >= LIMITS.scaleMin && v <= LIMITS.scaleMax;
}

/** A plain length that is also inside the allowed range; width/height must be positive. */
export function isAllowedValue(key: "left" | "top" | "width" | "height", v: unknown): boolean {
  if (typeof v !== "string" || !isValidLength(v)) return false;
  const n = parseFloat(v);
  const unit = v.trim().replace(/^-?[0-9.]+/, "");
  const size = key === "width" || key === "height";
  if (size && !(n > 0)) return false;
  if (unit === "%") return n <= (size ? LIMITS.sizePctMax : LIMITS.pctMax) && (size || n >= LIMITS.pctMin);
  return Math.abs(n) <= LIMITS.absMax;
}

export function isAllowedZIndex(z: unknown): boolean {
  return Number.isInteger(z) && (z as number) >= LIMITS.zMin && (z as number) <= LIMITS.zMax;
}

/** Returns a list of problems; empty means the layout is safe to compile. */
export function validateLayout(layout: unknown): string[] {
  const errors: string[] = [];
  const l = layout as LayoutFile;
  if (!l || typeof l !== "object") return ["layout is not an object"];
  if (l.schemaVersion !== LAYOUT_SCHEMA_VERSION) errors.push(`unsupported schemaVersion ${String(l.schemaVersion)}`);
  if (!l.elements || typeof l.elements !== "object") return [...errors, "elements missing"];

  for (const [id, el] of Object.entries(l.elements)) {
    if (!isValidEditId(id)) errors.push(`invalid edit id: ${id}`);
    for (const [bp, o] of Object.entries(el?.overrides ?? {})) {
      if (!LAYOUT_BREAKPOINTS.includes(bp as LayoutBreakpoint)) errors.push(`${id}: unknown breakpoint ${bp}`);
      for (const key of ["left", "top", "width", "height"] as const) {
        const v = (o as ElementOverride)[key];
        if (v !== undefined && !isAllowedValue(key, v)) errors.push(`${id}.${bp}.${key}: bad or out-of-range length ${String(v)}`);
      }
      for (const key of ["scaleX", "scaleY"] as const) {
        const v = (o as ElementOverride)[key];
        if (v !== undefined && !isAllowedScale(v)) errors.push(`${id}.${bp}.${key}: must be a number from ${LIMITS.scaleMin} to ${LIMITS.scaleMax}`);
      }
      const z = (o as ElementOverride).zIndex;
      if (z !== undefined && !isAllowedZIndex(z)) errors.push(`${id}.${bp}.zIndex: must be an integer from ${LIMITS.zMin} to ${LIMITS.zMax}`);
      const h = (o as ElementOverride).hidden;
      if (h !== undefined && typeof h !== "boolean") errors.push(`${id}.${bp}.hidden: not a boolean`);
    }
  }
  return errors;
}

export interface LayoutConflicts {
  /** Layout entries whose editId no longer exists in the clone: never applied. */
  missing: string[];
  /** The template changed since the layout was made. */
  templateChanged: boolean;
}

/** A layout made for another template version, or pointing at vanished ids, must not apply silently. */
export function checkLayoutConflicts(
  layout: LayoutFile,
  manifest: EditManifest,
  currentContentHash?: string
): LayoutConflicts {
  const known = new Set(manifest.entries.map((e) => e.editId));
  const missing = Object.keys(layout.elements).filter((id) => !known.has(id));
  const saved = layout.templateRef?.contentHash;
  return { missing, templateChanged: !!saved && !!currentContentHash && saved !== currentContentHash };
}

/** Drops entries that conflict, so only still-valid overrides reach the CSS. */
export function applicableLayout(layout: LayoutFile, conflicts: LayoutConflicts): LayoutFile {
  if (conflicts.templateChanged) return { ...layout, elements: {} };
  const gone = new Set(conflicts.missing);
  return { ...layout, elements: Object.fromEntries(Object.entries(layout.elements).filter(([id]) => !gone.has(id))) };
}
