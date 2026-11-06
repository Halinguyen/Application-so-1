// Packs the template sources for a server that cannot reach the company git (source.vtvlive.vn):
//   node scripts/pack-templates.mjs --per-game [--games a,b] [--out-dir ../demo-seed]   one <gameId>.tgz per game (for Vercel / TEMPLATE_SEED_BASE_URL)
//   node scripts/pack-templates.mjs [--games a,b] [--out ../demo-seed/templates-seed.tgz]  everything in one archive (for a Docker /data volume)
// An archive holds templates/<gameId>/<repoDir>/ without node_modules, .git, build output, logs, clones. The clone-schemas go in a second
// small archive next to it. Per game the archive is 5-70 MB; all games together are ~700 MB (too much for Vercel's /tmp).
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";

const APP = process.cwd();
const args = process.argv.slice(2);
const opt = (name) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : null; };
const perGame = args.includes("--per-game");
const only = opt("--games")?.split(",").map((s) => s.trim()).filter(Boolean) ?? null;
const outDir = resolve(opt("--out-dir") ?? join(APP, "..", "demo-seed"));
const out = resolve(opt("--out") ?? join(outDir, "templates-seed.tgz"));

// the template root of this machine: TEMPLATE_ROOT, else the sibling folder the tool grew up with
const root = resolve(process.env.TEMPLATE_ROOT || join(APP, "..", "game-template-repo"));
const schemas = resolve(process.env.CLONE_SCHEMAS_DIR || join(APP, "..", "clone-schemas"));
if (!existsSync(root)) throw new Error(`template root not found: ${root}`);

const registryDir = join(APP, "template-registry");
const games = readdirSync(registryDir).filter((f) => f.endsWith(".json")).map((f) => JSON.parse(readFileSync(join(registryDir, f), "utf8")));
const picked = games.filter((g) => !only || only.includes(g.gameId));
const found = [];
const missing = [];
for (const g of picked) {
  const rel = `${g.gameId}/${g.repoDir}`;
  if (existsSync(join(root, rel)) && statSync(join(root, rel)).isDirectory()) found.push({ gameId: g.gameId, rel });
  else missing.push(rel);
}
if (found.length === 0) throw new Error("nothing to pack (no template folder found)");
if (missing.length) console.warn("not on this machine, skipped:", missing.join(", "));

const excludes = ["node_modules", ".git", ".next", "dist", ".vite", "*.log", ".preview*", "bin", "obj"].flatMap((e) => ["--exclude", e]);
// --force-local: GNU tar would read "C:\..." as a remote host
function pack(file, rels) {
  mkdirSync(dirname(file), { recursive: true });
  execFileSync("tar", ["--force-local", "-czf", file, ...excludes, "--transform", "s,^,templates/,", "-C", root, ...rels], { stdio: "inherit" });
  return (statSync(file).size / 1048576).toFixed(1) + " MB";
}

if (perGame) {
  for (const f of found) console.log(`${f.gameId}.tgz`.padEnd(40), pack(join(outDir, `${f.gameId}.tgz`), [f.rel]));
  console.log("folder:", outDir);
} else {
  console.log("archive:", out, pack(out, found.map((f) => f.rel)));
  if (existsSync(schemas)) {
    const schemaOut = out.replace(/\.tgz$/, "-schemas.tgz");
    execFileSync("tar", ["--force-local", "-czf", schemaOut, "--transform", "s,^,clone-schemas/,", "-C", schemas, "."], { stdio: "inherit" });
    console.log("schemas:", schemaOut);
  }
}
