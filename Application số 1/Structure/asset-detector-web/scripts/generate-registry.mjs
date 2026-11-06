// Writes template-registry/<gameId>.json for every game in GAME_REPO_MAP: the git address and the exact commit of the
// template as it stands in TEMPLATE_ROOT. Run it where the templates are checked out (a developer machine), commit the
// result, and the deployed tool can fetch the same sources from git instead of storing them.
//
//   node scripts/generate-registry.mjs            write the manifests, print what differs from git
//   node scripts/generate-registry.mjs --check    write nothing, exit 1 when a manifest is out of date
//
// A template that was converted by the tool itself (the "-web" folders) has no git home yet: its manifest has
// source: null and says which repo it was derived from. A working copy that differs from its commit is reported:
// the manifest pins the COMMIT, so uncommitted changes would not reach a deployed tool.
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

const APP = process.cwd();
// same rule as src/detector/paths.ts: env, else the old sibling folder if it exists, else ./data/templates
const sibling = path.join(APP, "..", "game-template-repo");
const TEMPLATE_ROOT = path.resolve(process.env.TEMPLATE_ROOT || (existsSync(sibling) ? sibling : path.join(process.env.APP_DATA_DIR || path.join(APP, "data"), "templates")));
const REGISTRY_DIR = path.resolve(process.env.TEMPLATE_REGISTRY_DIR || path.join(APP, "template-registry"));
const check = process.argv.includes("--check");

// GAME_REPO_MAP lives in TypeScript: read it as text (one "game": "dir" pair per line).
const config = readFileSync(path.join(APP, "src", "detector", "config.ts"), "utf8");
const block = /export const GAME_REPO_MAP[^{]*\{([\s\S]*?)\n\};/.exec(config);
if (!block) throw new Error("GAME_REPO_MAP not found in src/detector/config.ts");
const map = {};
for (const m of block[1].matchAll(/^\s*"([^"]+)":\s*"([^"]+)",/gm)) map[m[1]] = m[2];

const git = (dir, ...args) => {
  try {
    return execFileSync("git", ["-C", dir, ...args], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
  } catch {
    return null;
  }
};

// Same rule as src/detector/framework-detector.ts for the two frameworks the clone flow supports.
function frameworkOf(dir) {
  try {
    const pkg = JSON.parse(readFileSync(path.join(dir, "package.json"), "utf8"));
    if (pkg.dependencies?.next) return "nextjs";
    if ({ ...pkg.dependencies, ...pkg.devDependencies }.vite) return "vite-spa";
  } catch {
    /* no package.json */
  }
  return undefined;
}

function describeRepo(dir) {
  if (!existsSync(path.join(dir, ".git"))) return null;
  const url = git(dir, "config", "--get", "remote.origin.url");
  const commit = git(dir, "rev-parse", "HEAD");
  if (!url || !commit) return null;
  const tracked = (git(dir, "status", "--porcelain", "--untracked-files=no") || "").split("\n").filter(Boolean).length;
  const untracked = (git(dir, "status", "--porcelain") || "").split("\n").filter((l) => l.startsWith("??")).length;
  return { url, commit, ref: git(dir, "rev-parse", "--abbrev-ref", "HEAD") || undefined, tracked, untracked };
}

mkdirSync(REGISTRY_DIR, { recursive: true });
let stale = 0;
const report = [];
for (const [gameId, repoDir] of Object.entries(map)) {
  const dir = path.join(TEMPLATE_ROOT, gameId, repoDir);
  const notes = [];
  let source = null;
  const own = describeRepo(dir);
  if (own) {
    source = { type: "git", url: own.url, commit: own.commit, ...(own.ref && own.ref !== "HEAD" ? { ref: own.ref } : {}) };
    if (own.tracked > 0) notes.push(`working copy had ${own.tracked} tracked file(s) modified that are NOT in commit ${own.commit.slice(0, 8)}`);
    if (own.untracked > 0) notes.push(`${own.untracked} untracked file(s) not in the commit`);
  } else if (existsSync(dir)) {
    // converted by the tool from a sibling repo: no git home of its own
    const base = repoDir.replace(/-web$/, "");
    const parent = base !== repoDir ? describeRepo(path.join(TEMPLATE_ROOT, gameId, base)) : null;
    notes.push("converted source (no git repository): push it to git, then put its url and commit here");
    if (parent) notes.push(`derived from ${parent.url} @ ${parent.commit.slice(0, 8)}`);
  } else {
    notes.push("template folder not found on this machine: manifest not generated");
    report.push(`${gameId}: SKIPPED (no folder ${dir})`);
    continue;
  }

  const file = path.join(REGISTRY_DIR, `${gameId}.json`);
  let previous = null;
  try {
    previous = JSON.parse(readFileSync(file, "utf8"));
  } catch {
    /* new */
  }
  const framework = frameworkOf(dir);
  const entry = { schemaVersion: 1, gameId, repoDir, ...(framework ? { framework } : {}), source, ...(notes.length ? { notes } : {}), generatedAt: previous?.generatedAt ?? new Date().toISOString() };
  const same = previous && JSON.stringify({ ...previous, generatedAt: 0 }) === JSON.stringify({ ...entry, generatedAt: 0 });
  if (!same) {
    stale++;
    entry.generatedAt = new Date().toISOString();
    if (!check) writeFileSync(file, JSON.stringify(entry, null, 2) + "\n");
  }
  report.push(`${gameId.padEnd(24)} ${source ? source.commit.slice(0, 8) : "no source "}  ${same ? "unchanged" : check ? "OUT OF DATE" : "written"}${notes.length ? "  !! " + notes[0] : ""}`);
}
console.log(report.join("\n"));
if (check && stale > 0) {
  console.error(`\n${stale} manifest(s) out of date: run node scripts/generate-registry.mjs`);
  process.exit(1);
}
