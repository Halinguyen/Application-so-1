import fg from "fast-glob";
import fs from "node:fs/promises";
import path from "node:path";

/**
 * Pages the clone does not carry (operator decision 2026-11-06: the /choigameN landing pages of
 * phuong-hoang-tru-tien and tuyetdinh-chiengioi). Matched by the FIRST path segment, so it is a
 * pattern list and not a per-game switch.
 */
export const EXCLUDED_ROUTE_SEGMENTS: RegExp[] = [/^choigame\d*$/i];

const isExcluded = (routePath: string) => {
  const first = routePath.split("/").filter(Boolean)[0] ?? "";
  return EXCLUDED_ROUTE_SEGMENTS.some((re) => re.test(first));
};

export interface PruneResult {
  routes: string[];
  files: string[];
  assets: string[];
}

const IGNORE = ["**/node_modules/**", "**/.next/**", "**/dist/**"];
const ASSET_EXT = /\.(png|jpe?g|webp|gif|svg|avif|mp4|webm|mp3|ogg|woff2?|ttf|otf)$/i;
const isGroup = (s: string) => /^\(.+\)$/.test(s);
const exists = (p: string) => fs.stat(p).then(() => true, () => false);

/**
 * Removes the excluded pages from a CLONE (never from the template):
 *  - react-router: the <Route path="/choigame1" element={<X />} /> line, the import of X, and X's file when nothing else imports it;
 *  - Next.js App Router: the app folders whose URL path is excluded (route groups do not count);
 *  - the local picture/video files that only those pages used (kept when anything left in src/ still names the file).
 */
export async function pruneExcludedRoutes(cloneDir: string): Promise<PruneResult> {
  const result: PruneResult = { routes: [], files: [], assets: [] };
  const removedSources: string[] = [];

  // ---- react-router (Vite) ----
  const sources = await fg(["src/**/*.{tsx,jsx}"], { cwd: cloneDir, ignore: IGNORE });
  const routeRe = /^[ \t]*<Route\b[^>\n]*\bpath=["']([^"']+)["'][^>\n]*\belement=\{<\s*([A-Za-z0-9_$]+)[^>\n]*\/?>\s*\}[^>\n]*\/>[ \t]*\r?\n?/gm;
  for (const rel of sources) {
    const abs = path.join(cloneDir, rel);
    const text = await fs.readFile(abs, "utf-8").catch(() => ""); // a page file removed earlier in this loop
    if (!text.includes("<Route")) continue;
    const dropped: string[] = [];
    let next = text.replace(routeRe, (line, routePath: string, comp: string) => {
      if (!isExcluded(routePath)) return line;
      result.routes.push(routePath);
      dropped.push(comp);
      return "";
    });
    if (next === text) continue;
    const importedFrom: string[] = [];
    for (const name of dropped) {
      const re = new RegExp("^import\\s+" + name + "\\s+from\\s+['\"]([^'\"]+)['\"];?[ \\t]*\\r?\\n", "m");
      next = next.replace(re, (_m, spec: string) => {
        importedFrom.push(path.resolve(path.dirname(abs), spec.replace(/\.(tsx|jsx)$/, "")));
        return "";
      });
    }
    await fs.writeFile(abs, next);
    for (const base of importedFrom) {
      for (const ext of [".tsx", ".jsx"]) {
        const file = base + ext;
        if (!(await exists(file))) continue;
        if (!(await isStillImported(cloneDir, file))) {
          removedSources.push(await fs.readFile(file, "utf-8"));
          await fs.rm(file);
          result.files.push(path.relative(cloneDir, file).split(path.sep).join("/"));
        }
        break;
      }
    }
  }

  // ---- Next.js App Router ----
  for (const appDir of ["src/app", "app"]) {
    if (!(await exists(path.join(cloneDir, appDir)))) continue;
    const dirs = await fg([`${appDir}/**/*`], { cwd: cloneDir, onlyDirectories: true, ignore: IGNORE });
    for (const d of dirs.sort((a, b) => a.length - b.length)) {
      const abs = path.join(cloneDir, d);
      if (!(await exists(abs))) continue; // inside a folder removed before
      const seg = d.slice(appDir.length + 1).split("/");
      if (isGroup(seg[seg.length - 1])) continue;
      const urlSegs = seg.filter((s) => !isGroup(s));
      if (!isExcluded("/" + urlSegs.join("/"))) continue;
      const files = await fg(["**/*.{tsx,jsx,ts,js}"], { cwd: abs });
      for (const f of files) removedSources.push(await fs.readFile(path.join(abs, f), "utf-8"));
      await fs.rm(abs, { recursive: true, force: true });
      result.routes.push("/" + urlSegs.join("/"));
      result.files.push(d);
    }
  }

  // ---- local assets only those pages used ----
  const specs = new Set<string>();
  for (const src of removedSources) {
    for (const m of src.matchAll(/["'`(]([^"'`()\s]+\.(?:png|jpe?g|webp|gif|svg|avif|mp4|webm|mp3|ogg|woff2?|ttf|otf))\b/gi)) {
      if (!/^https?:/i.test(m[1])) specs.add(m[1]);
    }
  }
  if (specs.size > 0) {
    const codeFiles = (await fg(["src/**/*", "app/**/*", "index.html"], { cwd: cloneDir, ignore: IGNORE, onlyFiles: true })).filter((f) => !ASSET_EXT.test(f));
    const remaining = (await Promise.all(codeFiles.map((f) => fs.readFile(path.join(cloneDir, f), "utf-8").catch(() => "")))).join("\n");
    const pub = await fg(["public/**/*"], { cwd: cloneDir, onlyFiles: true });
    for (const spec of specs) {
      const clean = spec.split(/[?#]/)[0];
      const base = path.posix.basename(clean);
      if (remaining.includes(base)) continue;
      const tail = "/" + clean.replace(/^\.?\/+/, "");
      for (const f of pub) {
        if (("/" + f.slice("public/".length)).endsWith(tail)) {
          await fs.rm(path.join(cloneDir, f), { force: true });
          result.assets.push(f);
        }
      }
    }
  }
  return result;
}

async function isStillImported(cloneDir: string, file: string): Promise<boolean> {
  const stem = path.basename(file).replace(/\.(tsx|jsx)$/, "");
  const sources = await fg(["src/**/*.{tsx,jsx,ts,js}"], { cwd: cloneDir, ignore: IGNORE });
  const re = new RegExp("from\\s+['\"][^'\"]*/" + stem + "(\\.(tsx|jsx))?['\"]");
  for (const rel of sources) {
    const abs = path.join(cloneDir, rel);
    if (abs === file) continue;
    if (re.test(await fs.readFile(abs, "utf-8"))) return true;
  }
  return false;
}
