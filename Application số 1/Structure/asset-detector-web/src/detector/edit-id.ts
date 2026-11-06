import { parse } from "@babel/parser";
import _traverse from "@babel/traverse";
import fg from "fast-glob";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import type { AssetReference } from "./types";
import { LAYOUT_SCHEMA_VERSION, type EditManifest, type EditManifestEntry } from "./layout-schema";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const traverse = (_traverse as any).default || _traverse;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;

const BREAKPOINT_DIR = /^(375|480|768|1024|1280|1440|1920|2560|mobile|tablet|desktop)$/i;

/**
 * Slot name for an asset: its last two path segments with breakpoint folders,
 * `${}` template holes and the extension removed. Same asset at 768 and 1920
 * therefore gets the same slot — it is one slot with per-breakpoint files.
 *   "${}/banner/1920/logo-duatop.png" -> "banner.logo-duatop"
 */
export function slotFromAssetPath(assetPath: string): string {
  const clean = assetPath.split(/[?#]/)[0].replace(/\$\{[^}]*\}/g, "");
  const parts = clean
    .split("/")
    .filter((p) => p && !BREAKPOINT_DIR.test(p) && !/^https?:$/.test(p));
  const last = (parts.pop() ?? "").replace(/\.[a-z0-9]+$/i, "");
  const dir = parts.pop();
  const raw = [dir, last].filter(Boolean).join(".");
  return raw.toLowerCase().replace(/[^a-z0-9._-]+/g, "-").replace(/^[^a-z0-9]+/, "") || "asset";
}

/**
 * Short name of the file an element lives in: "src/components/Banner.tsx" -> "banner",
 * "src/app/rank/page.tsx" -> "rank", "src/app/bao-danh/[slug]/page.tsx" -> "slug".
 * Used as the id prefix so the same asset used on two pages gets two distinct, readable ids.
 */
export function fileStem(relPath: string): string {
  const parts = relPath.replace(/\\/g, "/").split("/");
  let base = (parts.pop() ?? "").replace(/\.[a-z0-9]+$/i, "");
  if (/^(page|index|layout)$/i.test(base)) base = parts.pop() ?? base;
  const stem = base.replace(/[[\]()]/g, "").replace(/([a-z0-9])([A-Z])/g, "$1-$2").toLowerCase().replace(/[^a-z0-9-]+/g, "-").replace(/^-+|-+$/g, "");
  return stem || "file";
}

function classText(opening: Any): string {
  for (const a of opening.attributes as Any[]) {
    if (a.type === "JSXAttribute" && a.name?.name === "className") return JSON.stringify(a.value ?? {});
  }
  return "";
}

/** Positioned by its own className (absolute/fixed): the only elements that can be moved with left/top. */
function isPositioned(opening: Any): boolean {
  return /\babsolute\b|\bfixed\b/.test(classText(opening));
}

/**
 * True when a src expression reads data (a variable, a property): slide.image, imageArt, cfg?.logo || "...".
 * A call like handleConcatPathImage({ path: "/a.png" }) only holds fixed strings: its function name and the
 * object keys are not data, so it is a file, not an API picture.
 */
function readsData(ex: Any): boolean {
  let found = false;
  const walk = (n: Any): void => {
    if (!n || typeof n !== "object" || found) return;
    if (n.type === "Identifier") {
      found = true;
      return;
    }
    for (const k of Object.keys(n)) {
      if (k === "loc" || k === "start" || k === "end" || k === "extra") continue;
      if (n.type === "CallExpression" && k === "callee" && n.callee.type === "Identifier") continue;
      if (n.type === "ObjectProperty" && k === "key" && !n.computed) continue;
      const c = n[k];
      if (Array.isArray(c)) c.forEach(walk);
      else if (c && typeof c === "object") walk(c);
    }
  };
  walk(ex);
  return found;
}

/**
 * Name for a picture whose src is an expression (slide.image, imageArt, siteConfig?.site_logo_url || "..."):
 * the property of the first member access, else the first identifier. "tab.image" -> "data-image".
 */
export function dataSlotFromExpression(ex: Any): string {
  let member: string | null = null;
  let ident: string | null = null;
  const walk = (n: Any): void => {
    if (!n || typeof n !== "object" || member) return;
    if ((n.type === "MemberExpression" || n.type === "OptionalMemberExpression") && n.property?.type === "Identifier" && !n.computed) {
      member = n.property.name;
      return;
    }
    if (n.type === "Identifier" && !ident) ident = n.name;
    for (const k of Object.keys(n)) {
      if (k === "loc" || k === "start" || k === "end" || k === "extra") continue;
      const c = n[k];
      if (Array.isArray(c)) c.forEach(walk);
      else if (c && typeof c === "object") walk(c);
    }
  };
  walk(ex);
  const raw = (member ?? ident ?? "image") as string;
  const kebab = raw.replace(/([a-z0-9])([A-Z])/g, "$1-$2").replace(/_/g, "-").toLowerCase().replace(/[^a-z0-9-]+/g, "-").replace(/^-+|-+$/g, "");
  return "data-" + (kebab || "image");
}

/**
 * A picture that flows in the page (no absolute/fixed element around it) cannot be moved with left/top, but it
 * can be scaled. Finds the <img> to tag: the img itself, or for a <source> the <img> of the same <picture>
 * (an inline <picture> is not transformable, its <img> is). A <video> (or the <video> of a <source>) is tagged the same way. Full-width
 * section backgrounds are tagged too (2026-11-06): the operator may zoom or hide them; Reset puts them back.
 */
function flowTarget(elementPath: Any): { opening?: Any; reason?: string } {
  const node = elementPath.node;
  const tag = node.openingElement.name?.name;
  const parent = elementPath.parentPath?.node;
  const inVideo = parent?.type === "JSXElement" && parent.openingElement.name?.name === "video";
  if (tag === "video") return { opening: node.openingElement };
  if (tag === "source" && inVideo) return { opening: parent.openingElement };
  const inPicture = parent?.type === "JSXElement" && parent.openingElement.name?.name === "picture";
  let img: Any = null;
  if (tag === "img") {
    img = node.openingElement;
  } else if (tag === "source" && inPicture) {
    img = parent.children.find((c: Any) => c.type === "JSXElement" && c.openingElement.name?.name === "img")?.openingElement ?? null;
  }
  if (!img) return { reason: "not an <img> in the page flow" };
  return { opening: img };
}

function isDomTag(opening: Any): boolean {
  return opening.name.type === "JSXIdentifier" && /^[a-z]/.test(opening.name.name);
}

/**
 * A reference to inject for. `alias` is set for a picture imported through a barrel file
 * (import { bannerPC } from "../assets/banner"): the JSX never spells the file name, only the
 * identifier, so the attribute is matched by that identifier and not by line/file name.
 */
export type EditRef = Pick<AssetReference, "line" | "attribute" | "assetPath"> & { alias?: string };

function mentionsIdentifier(text: string, name: string): boolean {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp("(?<![\\w$])" + escaped + "(?![\\w$])").test(text);
}

/**
 * Adds `data-edit-id` to the positioned element that holds each detected asset
 * reference. Works on the CLONE only. A reference is skipped (and reported) when
 * its asset is not inside any absolute/fixed element: such an image flows in the
 * page and cannot be moved safely.
 *
 * `usedIds` is shared across files so ids stay unique per clone.
 */
export function injectEditIds(
  source: string,
  relPath: string,
  refs: EditRef[],
  usedIds: Set<string> = new Set()
): { code: string; entries: EditManifestEntry[]; skipped: EditManifest["skipped"] } {
  const ast = parse(source, { sourceType: "module", plugins: ["jsx", "typescript"], errorRecovery: true });
  const rel = relPath.replace(/\\/g, "/");

  // unit start offset -> entry; several assets may share one positioned element
  const units = new Map<number, { nameEnd: number; line: number; entry: EditManifestEntry | null }>();
  const skipped: EditManifest["skipped"] = [];

  const ordered = [...refs].sort((a, b) => a.line - b.line);

  traverse(ast, {
    JSXAttribute(p: Any) {
      const attr = p.node;
      const first = attr.loc?.start.line;
      const last = attr.loc?.end.line;
      if (first == null || last == null) return;
      // The detector reports the line of the asset string, which for a multi-line attribute such as
      //   src={handleConcatPathImage({
      //     path: "/assets/a.png",      <- reported line
      //   })}
      // is NOT the line the attribute starts on. So match by line range AND by the asset's file name
      // appearing in the attribute's own text (keeps two attributes sharing a line apart).
      const text = source.slice(attr.start, attr.end);
      const matches: EditRef[] = ordered.filter((r) => {
        if (r.alias) return false;
        if (r.line < first || r.line > last) return false;
        const base = (r.assetPath.split(/[?#]/)[0].split("/").pop() ?? "").trim();
        return base !== "" && text.includes(base);
      });
      // A picture whose src is an expression has no asset path for the detector to report: it is data
      // (an API response, a CMS value). Its place and size can still be edited, its content cannot.
      if (matches.length === 0 && ["src", "srcSet", "poster"].includes(attr.name?.name)) {
        for (const r of ordered) {
          if (r.alias && mentionsIdentifier(text, r.alias)) matches.push({ ...r, line: first });
        }
      }
      let items: { line: number; assetPath: string; slot?: string; dynamic?: boolean }[] = matches;
      if (matches.length === 0) {
        const opening = p.parent;
        const tag = opening?.name?.name;
        const v = attr.value;
        if (!["src", "srcSet", "poster"].includes(attr.name?.name) || !["img", "video", "source"].includes(tag)) return;
        if (!v || v.type !== "JSXExpressionContainer") return;
        const ex = v.expression;
        if (!readsData(ex)) return;
        items = [{ line: first, assetPath: "{" + source.slice(v.start + 1, v.end - 1).replace(/s+/g, " ").trim().slice(0, 70) + "}", slot: dataSlotFromExpression(ex), dynamic: true }];
      }

      // climb to the nearest DOM element that positions itself
      let host: Any = null;
      let path: Any = p.parentPath?.parentPath; // JSXElement owning this attribute
      while (path) {
        if (path.node.type === "JSXElement" && isDomTag(path.node.openingElement) && isPositioned(path.node.openingElement)) {
          host = path.node.openingElement;
          break;
        }
        path = path.parentPath;
      }

      // no positioned element around it: it may still be an ordinary picture we can scale (not move)
      const flow = host ? null : flowTarget(p.parentPath.parentPath);

      for (const ref of items) {
        const target: Any = host ?? flow?.opening;
        if (!target) {
          skipped.push({ sourcePath: rel, line: ref.line, assetPath: ref.assetPath, reason: flow?.reason ?? "not inside an absolute/fixed element (flows in the page)" });
          continue;
        }
        const key = target.start as number;
        let unit = units.get(key);
        if (!unit) {
          unit = { nameEnd: target.name.end as number, line: target.loc.start.line, entry: null };
          units.set(key, unit);
        }
        const slot = ref.slot ?? slotFromAssetPath(ref.assetPath);
        if (!unit.entry) {
          // "banner.logo" in Banner.tsx stays "banner.logo"; on another page it becomes "<page>.banner.logo"
          const stem = fileStem(rel);
          const base = slot.startsWith(stem + ".") ? slot : stem + "." + slot;
          let id = base;
          for (let n = 2; usedIds.has(id); n++) id = `${base}~${n}`;
          usedIds.add(id);
          unit.entry = { editId: id, sourcePath: rel, slot, assets: [], editable: true, ...(host ? {} : { mode: "scale" as const }), ...(ref.dynamic ? { source: "api" as const } : {}) };
        }
        if (ref.dynamic) continue; // nothing to list: the content is data
        // a real file in the same element: it is not purely data any more
        delete unit.entry.source;
        if (!unit.entry.assets.includes(ref.assetPath)) unit.entry.assets.push(ref.assetPath);
      }
    },
  });

  const inserts: { pos: number; text: string }[] = [];
  const entries: EditManifestEntry[] = [];
  for (const unit of [...units.values()].sort((a, b) => a.line - b.line)) {
    if (!unit.entry) continue;
    entries.push(unit.entry);
    inserts.push({
      pos: unit.nameEnd,
      text: ` data-edit-id="${unit.entry.editId}"${unit.entry.mode === "scale" ? ' data-edit-mode="scale"' : ""}${unit.entry.source === "api" ? ' data-edit-source="api"' : ""}`,
    });
  }

  let code = source;
  for (const { pos, text } of inserts.sort((a, b) => b.pos - a.pos)) {
    code = code.slice(0, pos) + text + code.slice(pos);
  }
  return { code, entries, skipped };
}

const IGNORE = ["**/node_modules/**", "**/*footer*", "**/*Footer*", "**/sdk/**", "**/.next/**"];

/**
 * Runs the injector over every source file of the clone that has detected asset
 * references, and returns the manifest. Unparsable files are left untouched.
 */
export async function injectEditIdsInDir(
  cloneDir: string,
  gameId: string,
  references: Pick<AssetReference, "file" | "line" | "attribute" | "assetPath" | "type">[]
): Promise<EditManifest> {
  const byFile = new Map<string, (Pick<AssetReference, "file" | "line" | "attribute" | "assetPath"> & { alias?: string })[]>();
  for (const r of references) {
    const f = r.file.replace(/\\/g, "/");
    if (!/\.(tsx|jsx)$/.test(f)) continue;
    byFile.set(f, [...(byFile.get(f) ?? []), r]);
  }
  const allowed = new Set(await fg(["src/**/*.{tsx,jsx}", "app/**/*.{tsx,jsx}", "pages/**/*.{tsx,jsx}"], { cwd: cloneDir, ignore: IGNORE }));
  for (const [file, refs] of await barrelAliasRefs(cloneDir, references, allowed)) byFile.set(file, [...(byFile.get(file) ?? []), ...refs]);

  const usedIds = new Set<string>();
  const manifest: EditManifest = { schemaVersion: LAYOUT_SCHEMA_VERSION, gameId, entries: [], skipped: [] };
  for (const [file, refs] of [...byFile.entries()].sort(([a], [b]) => a.localeCompare(b))) {
    if (!allowed.has(file)) continue;
    const abs = path.join(cloneDir, file);
    const src = await readFile(abs, "utf-8");
    if (src.includes("data-edit-id=")) continue; // already injected: keep ids as they are
    try {
      const r = injectEditIds(src, file, refs, usedIds);
      manifest.skipped.push(...r.skipped);
      if (r.entries.length === 0) continue;
      await writeFile(abs, r.code);
      manifest.entries.push(...r.entries);
    } catch {
      // unparsable file: leave it exactly as it is
    }
  }
  return manifest;
}

/**
 * Pictures imported through a barrel file (src/assets/banner/index.ts does `import bannerPC from "./1920/banner.png"`
 * and re-exports it; a component does `import { bannerPC } from "../assets/banner"`). The detector reports those
 * references in the barrel, where nothing can be tagged, so for every component that imports from a barrel we
 * synthesize one reference per imported name, carrying that name as `alias`.
 */
type AliasRef = Pick<AssetReference, "file" | "line" | "attribute" | "assetPath"> & { alias: string };

async function barrelAliasRefs(
  cloneDir: string,
  references: Pick<AssetReference, "file" | "line" | "attribute" | "assetPath" | "type">[],
  componentFiles: Set<string>
): Promise<Map<string, AliasRef[]>> {
  // barrel module (no extension, no /index) -> imported name -> asset path relative to the clone root
  const barrels = new Map<string, Map<string, string>>();
  for (const r of references) {
    const f = r.file.split("\\").join("/");
    const m = /^(.*)\/index\.(?:ts|js)$/.exec(f);
    if (!m || r.type !== "import") continue;
    const names = barrels.get(m[1]) ?? new Map<string, string>();
    barrels.set(m[1], names);
    const text = await readFile(path.join(cloneDir, f), "utf-8").catch(() => "");
    const line = text.split(/\r?\n/)[r.line - 1] ?? "";
    const id = /import\s+([\w$]+)\s+from/.exec(line)?.[1];
    if (id) names.set(id, path.posix.normalize(path.posix.join(m[1], r.assetPath)));
  }
  const out = new Map<string, AliasRef[]>();
  if (barrels.size === 0) return out;
  for (const file of componentFiles) {
    const text = await readFile(path.join(cloneDir, file), "utf-8").catch(() => "");
    for (const imp of text.matchAll(/import\s*\{([^}]*)\}\s*from\s*["'](\.[^"']*)["']/g)) {
      const mod = path.posix.normalize(path.posix.join(path.posix.dirname(file), imp[2].replace(/\/index$/, "")));
      const names = barrels.get(mod);
      if (!names) continue;
      for (const part of imp[1].split(",")) {
        const [imported, local] = part.trim().split(/\s+as\s+/);
        const assetPath = imported ? names.get(imported) : undefined;
        if (!assetPath) continue;
        out.set(file, [...(out.get(file) ?? []), { file, line: 0, attribute: "src", assetPath, alias: local ?? imported }]);
      }
    }
  }
  return out;
}
