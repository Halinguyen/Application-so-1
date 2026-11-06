import { AssetReference } from './types';
import fg from 'fast-glob';
import { readFile } from 'fs/promises';
import path from 'path';

const IGNORE_PATTERNS = [
  '**/bin/**',
  '**/obj/**',
  '**/.vs/**',
  '**/node_modules/**',
  '**/wwwroot/lib/**',
];

// Verified against 7 real repos (giang-ho-ky-ngo, huyen-anh-volam,
// quy-mon-quan, samkok-tamquoc, ta-la-hac-ngokhong, thao-tung-tamquoc,
// thoi-khong-chi-mong) — Razor Pages repos use Pages/Shared/_Footer.cshtml,
// MVC repos embed the footer SDK elsewhere (no dedicated file), so both the
// filename and folder forms are needed, same idea as layer1's FOOTER_PATTERNS.
function isFooterFile(filePath: string): boolean {
  return /[/\\]footer[/\\]|[/\\]sdk[/\\]|_?Footer\.cshtml$|_?SdkFooter\.cshtml$/i.test(filePath);
}

// Same "Conhan" out-of-scope module layer1-filesystem.ts excludes at the
// asset level — mirrored here so its Views/Controllers/Models/Settings
// source files aren't scanned as reference sources either (harmless if
// scanned since their assets are already gone from layer1, but wasted work
// and noisy `references` with no matching asset). `Jobs/` (huyen-anh-volam's
// background worker folder) is unrelated backend logic, never asset-bearing
// today, excluded per the same user directive.
function isOutOfScopeFile(filePath: string): boolean {
  return /conhan|[/\\]jobs[/\\]/i.test(filePath);
}

export interface Layer2Result {
  references: AssetReference[];
  footerFilesSkipped: number;
  outOfScopeFilesSkipped: number;
  filesScanned: number;
}

/**
 * .NET MVC / Razor Pages counterpart to layer2-vite.ts / layer2-nextjs.ts.
 * No AST parser exists for Razor's mixed C#/HTML syntax the way babel covers
 * JS/TSX, so this scans raw text with regex instead — same "detect by
 * extension, not by one dominant syntax shape" strategy as layer2-nextjs.ts,
 * because the 7 real repos surveyed mix Razor Pages (Pages/) and MVC
 * (Views/+Controllers/) freely and reference assets via `~/`, `Url.Content`,
 * plain root-relative `/folder/assets/x.png` (the actual majority — 1215
 * <img> tags surveyed, most this shape, not `~/` or Url.Content), and
 * relative-to-page paths — trying to special-case each syntax form misses
 * the common case.
 */
export async function layer2ScanDotNet(repoPath: string): Promise<Layer2Result> {
  const codeFiles = await fg(
    [
      '**/*.cshtml', '**/*.razor', '**/*.cs', '**/*.css', '**/*.scss', 'appsettings*.json',
      // giang-ho-ky-ngo's whole homepage is plain static HTML under
      // wwwroot/home/ (index.html + js/index.js + css/), not a single
      // .cshtml references — Razor Pages there just serve/redirect to it.
      // 3 other repos embed a *built* Vite/React bundle the same way
      // (wwwroot/<Section>/index.html + assets/main-<hash>.js) — but that's
      // the out-of-scope Conhan module (see isOutOfScopeFile), excluded
      // below rather than not-scanned, since another repo could legitimately
      // reuse this same static-wwwroot-page shape for in-scope content.
      '**/wwwroot/**/*.html', '**/wwwroot/**/*.js',
    ],
    { cwd: repoPath, ignore: IGNORE_PATTERNS, absolute: true }
  );

  const references: AssetReference[] = [];
  let footerFilesSkipped = 0;
  let outOfScopeFilesSkipped = 0;

  for (const file of codeFiles) {
    const relativePath = path.relative(repoPath, file).replace(/\\/g, '/');

    if (isFooterFile(relativePath)) {
      footerFilesSkipped++;
      continue;
    }

    if (isOutOfScopeFile(relativePath)) {
      outOfScopeFilesSkipped++;
      continue;
    }

    const content = await readFile(file, 'utf-8');
    const ext = path.extname(file);

    if (ext === '.cshtml' || ext === '.razor') {
      references.push(...scanRazor(relativePath, content));
    } else if (ext === '.cs') {
      references.push(...scanCSharp(relativePath, content));
    } else if (ext === '.css' || ext === '.scss') {
      references.push(...scanCss(relativePath, content));
    } else if (ext === '.html') {
      references.push(...scanRazor(relativePath, content));
    } else if (ext === '.js') {
      references.push(...scanBundledJs(relativePath, content));
    } else if (relativePath.match(/appsettings.*\.json$/i)) {
      references.push(...scanJsonConfig(relativePath, content));
    }
  }

  return { references, footerFilesSkipped, outOfScopeFilesSkipped, filesScanned: codeFiles.length };
}

function lineOf(content: string, index: number): number {
  return content.substring(0, index).split('\n').length;
}

// A reference that isn't rooted (`/...`, `~/...`) or absolute (`http(s)://`)
// is relative to the FILE THAT REFERENCES IT, not to the repo root — found
// via a real miss: ta-la-hac-ngokhong's wwwroot/css/index.css has
// `url(../img/bg-download.png)`, which only resolves correctly relative to
// wwwroot/css/. matchesAsset() in layer4-merge.ts does suffix matching, so
// leaving the unresolved `../` in place breaks the match (the extra ".."
// segment never lines up with the real path). Resolving here — where the
// referencing file's own location is known — is more correct than trying to
// strip ".." generically later with no path context.
//
// BUT this "relative to the referencing file" rule only holds when that file
// itself lives under wwwroot/ — there, its disk location mirrors the URL the
// browser resolves the relative path against. A Razor Page/View source file
// (Pages/*.cshtml, Views/*.cshtml) does NOT live at the URL route it renders
// at (e.g. Pages/Landing.cshtml routes to "/landing", not "/Pages/Landing"),
// so joining its on-disk folder ("Pages/") onto the relative path produces a
// path that can never match a real asset — found via a real miss:
// giang-ho-ky-ngo's Pages/Landing.cshtml has `src="landing/img/x.png"`, which
// this used to resolve to the bogus "Pages/landing/img/x.png" instead of the
// real "wwwroot/landing/img/x.png". Left un-prefixed instead, matchesAsset()'s
// suffix matching (Case 1) still finds it — no route knowledge required.
function resolveRelative(refFile: string, assetPath: string): string {
  if (/^(https?:)?\/\//i.test(assetPath)) return assetPath;
  if (/^[/~]/.test(assetPath)) return assetPath;
  if (assetPath.startsWith('@') || assetPath.startsWith('data:')) return assetPath;
  const normalizedRefFile = refFile.replace(/\\/g, '/');
  if (!/(^|\/)wwwroot\//i.test(normalizedRefFile)) return assetPath;
  const dir = path.posix.dirname(normalizedRefFile);
  return path.posix.normalize(path.posix.join(dir, assetPath));
}

// `Url.Content("~/img/x.webp")` — wraps the same tilde-rooted path
// `src`/`href` also use, but as a C# call rather than an attribute value, so
// it needs its own regex (the attribute scan below wouldn't see inside it).
const URL_CONTENT_RE = /Url\.Content\(\s*["']([^"']+)["']\s*\)/g;

// Deliberately not gated to a fixed attribute-name allowlist (src/href/...):
// samkok-tamquoc keys its character-swap images off custom JS-hook
// attributes (`data-char="img/art-2.png"`, `data-name="img/name-2.png"`),
// and there's no reason another repo won't invent yet another attribute
// name for the same purpose. isAssetPath already discriminates a real asset
// from an app route (`href="/cms/configs"`) or a mailto:/tel: link, so any
// attribute is safe to scan — the extension check is what actually matters,
// same principle as layer2-nextjs.ts's ObjectProperty visitor.
const ATTR_RE = /[a-zA-Z][a-zA-Z0-9-]*\s*=\s*"([^"]*)"/g;

// `style="...url(/path/x.png)..."` inline on a Razor element — quotes around
// the url() argument are optional; one confirmed repo (quy-mon-quan) uses
// url(/Conhan/assets/x.png) with no quotes at all.
const INLINE_STYLE_URL_RE = /url\(\s*['"]?([^'")]+)['"]?\s*\)/g;

function scanRazor(file: string, content: string): AssetReference[] {
  const refs: AssetReference[] = [];

  for (const match of content.matchAll(URL_CONTENT_RE)) {
    const value = match[1];
    if (isAssetPath(value)) {
      refs.push({
        file,
        line: lineOf(content, match.index ?? 0),
        type: 'razor-url-content',
        assetPath: value,
        usage: 'Url.Content',
        confidence: 1.0,
      });
    }
  }

  for (const match of content.matchAll(ATTR_RE)) {
    const value = match[1];
    if (!value || !isAssetPath(value)) continue;
    // A value still containing a Razor expression (`@Model.X`,
    // `@ViewData["y"]`) alongside a literal asset-looking prefix is only
    // partially known statically (e.g. `src="/images/@ViewBag.Skin/logo.png"`)
    // — flag for manual review instead of treating as a confirmed match.
    const isDynamic = value.includes('@');
    refs.push({
      file,
      line: lineOf(content, match.index ?? 0),
      type: isDynamic ? 'razor-dynamic-attr' : 'razor-attr',
      assetPath: isDynamic ? value : resolveRelative(file, value),
      usage: 'attribute',
      confidence: isDynamic ? 0.3 : 1.0,
    });
  }

  for (const match of content.matchAll(INLINE_STYLE_URL_RE)) {
    const value = match[1];
    if (isAssetPath(value)) {
      refs.push({
        file,
        line: lineOf(content, match.index ?? 0),
        type: 'inline-style-url',
        assetPath: resolveRelative(file, value),
        usage: 'style',
        confidence: 1.0,
      });
    }
  }

  return refs;
}

// C# string literals (Controllers/Models/Services) — `"~/images/logo.png"`
// or a plain relative path assigned to a view-model property. Interpolated
// literals with a placeholder (`$"top-{rank}.png"`) don't match (no static
// full path to record) and are left for manual discovery — rare in practice
// (1 hit across 7 repos) and not worth a partial-match heuristic.
const CSHARP_STRING_RE = /"([^"\n]*\.(?:jpg|jpeg|png|gif|svg|webp|avif|ico|mp4|webm|mov|mp3|wav|woff2?|ttf|otf))"/gi;

function scanCSharp(file: string, content: string): AssetReference[] {
  const refs: AssetReference[] = [];
  for (const match of content.matchAll(CSHARP_STRING_RE)) {
    const value = match[1];
    if (isAssetPath(value)) {
      refs.push({
        file,
        line: lineOf(content, match.index ?? 0),
        type: 'csharp-string',
        assetPath: value,
        usage: 'code',
        confidence: 0.9,
      });
    }
  }
  return refs;
}

// Minified Vite/React build output — no attributes to key off, just
// whatever quoting style the bundler emitted (double or single quotes are
// both common). The build has already resolved every asset to its final
// root-relative URL by this point, so a plain quoted-string scan is enough;
// no need for the attribute/Url.Content distinctions scanRazor makes.
const JS_STRING_RE = /["']([^"'\n]*\.(?:jpg|jpeg|png|gif|svg|webp|avif|ico|mp4|webm|mov|mp3|wav|woff2?|ttf|otf))["']/gi;

function scanBundledJs(file: string, content: string): AssetReference[] {
  const refs: AssetReference[] = [];
  for (const match of content.matchAll(JS_STRING_RE)) {
    const value = match[1];
    if (isAssetPath(value)) {
      refs.push({
        file,
        line: lineOf(content, match.index ?? 0),
        type: 'bundled-js-string',
        assetPath: value,
        usage: 'built-spa-bundle',
        confidence: 0.9,
      });
    }
  }
  return refs;
}

function scanCss(file: string, content: string): AssetReference[] {
  const refs: AssetReference[] = [];
  for (const match of content.matchAll(INLINE_STYLE_URL_RE)) {
    const value = match[1];
    if (isAssetPath(value)) {
      refs.push({
        file,
        line: lineOf(content, match.index ?? 0),
        type: 'css-url',
        assetPath: resolveRelative(file, value),
        usage: 'css',
        confidence: 1.0,
      });
    }
  }
  return refs;
}

// Surveyed all 4 appsettings*.json across the 7 repos — none currently hold
// an asset path (config there is API base URLs/secrets, not images), so this
// has no real hits today. Kept anyway (cheap, generic) since it's explicitly
// in the original Phase 5 spec and another .NET repo added later may use it.
function scanJsonConfig(file: string, content: string): AssetReference[] {
  const refs: AssetReference[] = [];
  const re = /"((?:[^"\\]|\\.)*\.(?:jpg|jpeg|png|gif|svg|webp|avif|ico|mp4|webm|mov))"/gi;
  for (const match of content.matchAll(re)) {
    const value = match[1];
    if (isAssetPath(value)) {
      refs.push({
        file,
        line: lineOf(content, match.index ?? 0),
        type: 'json-config',
        assetPath: value,
        usage: 'appsettings',
        confidence: 0.9,
      });
    }
  }
  return refs;
}

function isAssetPath(str: string): boolean {
  if (!str) return false;
  if (/^(https?:)?\/\//i.test(str)) return false; // external CDN URL, not a local repo asset
  if (/^(mailto|tel|javascript):/i.test(str)) return false;
  return /\.(jpg|jpeg|png|gif|svg|webp|avif|ico|mp4|webm|mov|mp3|wav|woff2?|ttf|otf)(\?|$)/i.test(str);
}
