import { parse } from "@babel/parser";
import _traverse from "@babel/traverse";
import fg from "fast-glob";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import path from "node:path";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const traverse = (_traverse as any).default || _traverse;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;

/** One page of the site, and the source files that draw it (its entry file plus everything it imports). */
export interface RouteInfo {
  /** URL path as the router matches it: "/", "/rank", "/tintuc/:slug" */
  path: string;
  label: string;
  /** true when the path has a parameter the operator must fill in (:slug, *) */
  dynamic: boolean;
  /** the component / page file the route points at, relative to the project dir */
  file: string;
  /** every project file this page draws, relative, with forward slashes */
  files: string[];
}

const EXTS = [".tsx", ".ts", ".jsx", ".js"];
const MAX_FILES_PER_ROUTE = 600;

const toRel = (projectDir: string, abs: string) => path.relative(projectDir, abs).split(path.sep).join("/");

function resolveFile(base: string): string | null {
  const candidates = [base, ...EXTS.map((e) => base + e), ...EXTS.map((e) => path.join(base, "index" + e))];
  for (const c of candidates) {
    if (existsSync(c) && /\.(tsx|ts|jsx|js)$/.test(c)) return c;
  }
  return null;
}

/** Turns an import specifier into a project file (relative imports and the usual "@/" alias for src/). */
function resolveImport(projectDir: string, fromFile: string, spec: string): string | null {
  if (spec.startsWith(".")) return resolveFile(path.resolve(path.dirname(fromFile), spec));
  if (spec.startsWith("@/") || spec.startsWith("~/")) return resolveFile(path.join(projectDir, "src", spec.slice(2)));
  return null; // a package: not part of the project
}

const importCache = new Map<string, string[]>();

async function importsOf(projectDir: string, file: string): Promise<string[]> {
  const key = file;
  const hit = importCache.get(key);
  if (hit) return hit;
  let specs: string[] = [];
  try {
    const src = await readFile(file, "utf-8");
    const ast = parse(src, { sourceType: "module", plugins: ["jsx", "typescript"], errorRecovery: true });
    traverse(ast, {
      ImportDeclaration(p: Any) {
        specs.push(p.node.source.value);
      },
      ExportNamedDeclaration(p: Any) {
        if (p.node.source) specs.push(p.node.source.value);
      },
      ExportAllDeclaration(p: Any) {
        specs.push(p.node.source.value);
      },
      CallExpression(p: Any) {
        const n = p.node;
        if (n.callee.type === "Import" && n.arguments[0]?.type === "StringLiteral") specs.push(n.arguments[0].value);
      },
    });
  } catch {
    specs = [];
  }
  const files = specs.map((s) => resolveImport(projectDir, file, s)).filter((x): x is string => !!x);
  importCache.set(key, files);
  return files;
}

/** Entry file + everything it imports inside the project (bounded). */
export async function importClosure(projectDir: string, entryAbs: string, extra: string[] = []): Promise<string[]> {
  const seen = new Set<string>();
  const queue = [entryAbs, ...extra];
  while (queue.length && seen.size < MAX_FILES_PER_ROUTE) {
    const f = queue.shift()!;
    if (seen.has(f)) continue;
    seen.add(f);
    for (const dep of await importsOf(projectDir, f)) if (!seen.has(dep)) queue.push(dep);
  }
  return [...seen].map((f) => toRel(projectDir, f)).sort();
}

function labelOf(routePath: string): string {
  if (routePath === "/") return "Trang chủ";
  return routePath;
}

/** react-router: every <Route path="..." element={<Component />} /> and the file Component comes from. */
async function viteRoutes(projectDir: string): Promise<RouteInfo[]> {
  const files = await fg(["src/**/*.{tsx,jsx}"], { cwd: projectDir, ignore: ["**/node_modules/**"] });
  const out: RouteInfo[] = [];
  for (const rel of files) {
    const abs = path.join(projectDir, rel);
    let src: string;
    try {
      src = await readFile(abs, "utf-8");
    } catch {
      continue;
    }
    if (!src.includes("<Route")) continue;
    let ast: Any;
    try {
      ast = parse(src, { sourceType: "module", plugins: ["jsx", "typescript"], errorRecovery: true });
    } catch {
      continue;
    }
    // local name -> imported file
    const imported = new Map<string, string>();
    for (const node of ast.program.body as Any[]) {
      if (node.type !== "ImportDeclaration") continue;
      const target = resolveImport(projectDir, abs, node.source.value);
      if (!target) continue;
      for (const sp of node.specifiers) imported.set(sp.local.name, target);
    }
    traverse(ast, {
      JSXOpeningElement(p: Any) {
        const n = p.node;
        if (n.name.type !== "JSXIdentifier" || n.name.name !== "Route") return;
        const pathAttr = n.attributes.find((a: Any) => a.type === "JSXAttribute" && a.name?.name === "path");
        const isIndex = n.attributes.some((a: Any) => a.type === "JSXAttribute" && a.name?.name === "index");
        const routePath = pathAttr?.value?.type === "StringLiteral" ? (pathAttr.value.value as string) : isIndex ? "/" : null;
        if (routePath === null) return;
        const elAttr = n.attributes.find((a: Any) => a.type === "JSXAttribute" && a.name?.name === "element");
        const el = elAttr?.value?.type === "JSXExpressionContainer" ? elAttr.value.expression : null;
        const compName = el?.type === "JSXElement" && el.openingElement.name.type === "JSXIdentifier" ? (el.openingElement.name.name as string) : null;
        const entry = compName ? imported.get(compName) : undefined;
        if (!entry) return;
        out.push({ path: routePath.startsWith("/") ? routePath : "/" + routePath, label: "", dynamic: /[:*]/.test(routePath), file: toRel(projectDir, entry), files: [] });
      },
    });
  }
  return out;
}

/** Next.js App Router: app/**\/page.* ; layouts above a page are part of that page. */
async function nextRoutes(projectDir: string): Promise<{ routes: RouteInfo[]; layoutsFor: (file: string) => string[] }> {
  const base = existsSync(path.join(projectDir, "src/app")) ? "src/app" : "app";
  const pages = await fg([`${base}/**/page.{tsx,jsx,ts,js}`], { cwd: projectDir, ignore: ["**/node_modules/**"] });
  const routes: RouteInfo[] = pages.map((rel) => {
    const dir = path.posix.dirname(rel).slice(base.length);
    const segments = dir
      .split("/")
      .filter((s) => s && !/^\(.*\)$/.test(s) && !s.startsWith("@"))
      .map((s) => (s.startsWith("[...") ? "*" : s.startsWith("[") ? ":" + s.replace(/^\[+|\]+$/g, "") : s));
    const p = "/" + segments.join("/");
    return { path: p, label: "", dynamic: /[:*]/.test(p), file: rel, files: [] };
  });
  const layoutsFor = (file: string): string[] => {
    const out: string[] = [];
    let dir = path.posix.dirname(file);
    while (dir.length >= base.length) {
      for (const e of EXTS) {
        const cand = `${dir}/layout${e}`;
        if (existsSync(path.join(projectDir, cand))) out.push(cand);
      }
      if (dir === base) break;
      dir = path.posix.dirname(dir);
    }
    return out;
  };
  return { routes, layoutsFor };
}

/**
 * The pages of a project and, for each, the files that draw it. Lets the editor open any page and tell which
 * page an editable element belongs to (shared components belong to several). Only Vite + react-router and
 * Next.js App Router are understood; anything else gives a single "/" page with no file list.
 */
export async function discoverRoutes(projectDir: string, framework: string): Promise<RouteInfo[]> {
  importCache.clear();
  let routes: RouteInfo[] = [];
  let layoutsFor: (f: string) => string[] = () => [];
  if (framework === "vite-spa") routes = await viteRoutes(projectDir);
  else if (framework === "nextjs") ({ routes, layoutsFor } = await nextRoutes(projectDir));

  // one entry per URL path (a path declared twice keeps the first)
  const seen = new Set<string>();
  routes = routes.filter((r) => (seen.has(r.path) ? false : (seen.add(r.path), true)));
  for (const r of routes) {
    const extra = layoutsFor(r.file).map((f) => path.join(projectDir, f));
    r.files = await importClosure(projectDir, path.join(projectDir, r.file), extra);
    r.label = labelOf(r.path);
  }
  if (routes.length === 0) routes = [{ path: "/", label: "Trang chủ", dynamic: false, file: "", files: [] }];
  return routes.sort((a, b) => (a.path === "/" ? -1 : b.path === "/" ? 1 : a.path.localeCompare(b.path)));
}

export { fillRoute, routesOfFile } from "./route-path";
