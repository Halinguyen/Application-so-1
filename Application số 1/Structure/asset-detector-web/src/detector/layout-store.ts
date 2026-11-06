import fs from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import {
  applicableLayout,
  checkLayoutConflicts,
  emptyLayout,
  validateLayout,
  type EditManifest,
  type ElementOverride,
  type LayoutBreakpoint,
  type LayoutConflicts,
  type LayoutFile,
} from "./layout-schema";
import { compileLayoutCss } from "./layout-compile";
import type { EditSlot } from "./asset-match";
import type { RouteInfo } from "./routes";

const MAX_HISTORY = 20;

/** Lives next to the template, like home-page-uploads: it survives every wipe + rebuild of the clone. */
export function getLayoutDir(repoPath: string): string {
  return path.join(path.dirname(repoPath), "home-page-layout");
}
const layoutFile = (repoPath: string) => path.join(getLayoutDir(repoPath), "layout.json");
const manifestFile = (repoPath: string) => path.join(getLayoutDir(repoPath), "manifest.json");
const historyDir = (repoPath: string) => path.join(getLayoutDir(repoPath), "history");
const slotsFile = (repoPath: string) => path.join(getLayoutDir(repoPath), "slots.json");
const routesFile = (repoPath: string) => path.join(getLayoutDir(repoPath), "routes.json");

async function readJson<T>(file: string): Promise<T | null> {
  try {
    return JSON.parse(await fs.readFile(file, "utf-8")) as T;
  } catch {
    return null;
  }
}

export async function readLayout(repoPath: string): Promise<LayoutFile | null> {
  return readJson<LayoutFile>(layoutFile(repoPath));
}

export async function readManifest(repoPath: string): Promise<EditManifest | null> {
  return readJson<EditManifest>(manifestFile(repoPath));
}

/** The asset slots found when the clone was built: what the preview editor may replace (nothing else is writable). */
export async function readSlots(repoPath: string): Promise<EditSlot[]> {
  return (await readJson<EditSlot[]>(slotsFile(repoPath))) ?? [];
}

export async function writeSlots(repoPath: string, slots: EditSlot[]): Promise<void> {
  await fs.mkdir(getLayoutDir(repoPath), { recursive: true });
  await fs.writeFile(slotsFile(repoPath), JSON.stringify(slots, null, 2));
}

/** The pages of the site and the files each draws (so the editor can open any page). */
export async function readRoutes(repoPath: string): Promise<RouteInfo[]> {
  return (await readJson<RouteInfo[]>(routesFile(repoPath))) ?? [];
}

export async function writeRoutes(repoPath: string, routes: RouteInfo[]): Promise<void> {
  await fs.mkdir(getLayoutDir(repoPath), { recursive: true });
  await fs.writeFile(routesFile(repoPath), JSON.stringify(routes, null, 2));
}

export async function writeManifest(repoPath: string, manifest: EditManifest): Promise<void> {
  await fs.mkdir(getLayoutDir(repoPath), { recursive: true });
  await fs.writeFile(manifestFile(repoPath), JSON.stringify(manifest, null, 2));
}

/** Validates, snapshots the previous version (rollback), then writes. */
export async function writeLayout(repoPath: string, layout: LayoutFile): Promise<void> {
  const errors = validateLayout(layout);
  if (errors.length) throw new Error(`Invalid layout: ${errors.join("; ")}`);
  await fs.mkdir(getLayoutDir(repoPath), { recursive: true });
  const prev = layoutFile(repoPath);
  if (existsSync(prev)) {
    await fs.mkdir(historyDir(repoPath), { recursive: true });
    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    await fs.copyFile(prev, path.join(historyDir(repoPath), `${stamp}.json`));
    const old = (await fs.readdir(historyDir(repoPath))).sort();
    for (const f of old.slice(0, Math.max(0, old.length - MAX_HISTORY))) {
      await fs.rm(path.join(historyDir(repoPath), f), { force: true });
    }
  }
  await fs.writeFile(prev, JSON.stringify(layout, null, 2));
}

export async function listHistory(repoPath: string): Promise<string[]> {
  try {
    return (await fs.readdir(historyDir(repoPath))).filter((f) => f.endsWith(".json")).sort().reverse();
  } catch {
    return [];
  }
}

export async function restoreHistory(repoPath: string, name: string): Promise<LayoutFile> {
  if (!/^[\w-]+\.json$/.test(name)) throw new Error("bad history name");
  const layout = await readJson<LayoutFile>(path.join(historyDir(repoPath), name));
  if (!layout) throw new Error("history entry not found");
  await writeLayout(repoPath, layout);
  return layout;
}

/** Merges one element's override for one breakpoint; a `null` value removes that property. */
export function mergeOverride(
  layout: LayoutFile,
  editId: string,
  breakpoint: LayoutBreakpoint,
  patch: { [K in keyof ElementOverride]?: ElementOverride[K] | null },
  templateRef?: LayoutFile["templateRef"]
): LayoutFile {
  const next: LayoutFile = structuredClone(layout);
  if (templateRef) next.templateRef = templateRef;
  const el = (next.elements[editId] ??= { overrides: {} });
  const cur: Record<string, unknown> = { ...(el.overrides[breakpoint] ?? {}) };
  for (const [k, v] of Object.entries(patch)) {
    if (v === null || v === undefined) delete cur[k];
    else cur[k] = v;
  }
  if (Object.keys(cur).length) el.overrides[breakpoint] = cur as ElementOverride;
  else delete el.overrides[breakpoint];
  if (Object.keys(el.overrides).length === 0) delete next.elements[editId];
  return next;
}

export function removeElement(layout: LayoutFile, editId?: string): LayoutFile {
  if (!editId) return { ...layout, elements: {} };
  const next = structuredClone(layout);
  delete next.elements[editId];
  return next;
}

export interface CssResult {
  css: string;
  conflicts: LayoutConflicts;
}

/** Layout -> CSS with conflicting entries dropped (never applied silently). */
export function buildCss(layout: LayoutFile | null, manifest: EditManifest | null, gameId: string, contentHash?: string): CssResult {
  const l = layout ?? emptyLayout(gameId);
  const conflicts = manifest ? checkLayoutConflicts(l, manifest, contentHash) : { missing: [], templateChanged: false };
  return { css: compileLayoutCss(applicableLayout(l, conflicts)), conflicts };
}
