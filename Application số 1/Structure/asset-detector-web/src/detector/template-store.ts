import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import fg from "fast-glob";
import { MATERIALIZED_DIR, STORE_DIR } from "./paths";

// Frozen ("đóng băng") copies of the template repos. A snapshot is an
// immutable, content-addressed archive of one template's source (no
// node_modules / build output / .git) plus a manifest. Once a game's detect
// schema is verified against it, the live template folder can be deleted: the
// tool re-extracts the snapshot on demand (materializeTemplate) and every
// other module keeps reading a plain repoPath, unaware of where it came from.
//
//   <Structure>/template-store/<gameId>/v<N>/template.tgz   (binary, gitignored)
//   <Structure>/template-store/<gameId>/v<N>/manifest.json  (committed)
//   <Structure>/template-materialized/<gameId>/<repoDir>/   (extracted, cache)

export { STORE_DIR, MATERIALIZED_DIR };

const ARCHIVE_NAME = "template.tgz";
const MANIFEST_NAME = "manifest.json";
const HASH_MARKER = ".template-hash";

// Build output / dependencies are regenerated, never part of the template.
// .env* files ARE kept: the live clone flow reads them (base env, .env.development).
const IGNORE = [
  "**/node_modules/**",
  "**/.git/**",
  ".next/**",
  "dist/**",
  "bin/**",
  "obj/**",
  ".vs/**",
  ".cache/**",
  ".turbo/**",
  "coverage/**",
  "**/*.log",
  "**/tsconfig.tsbuildinfo",
  "**/.DS_Store",
  "**/Thumbs.db",
];

export interface TemplateRef {
  version: number;
  contentHash: string; // sha256 of the file tree (paths + content)
  archiveSha256: string; // sha256 of template.tgz itself
  repoDir: string; // folder name inside <gameId>/ (e.g. "home-page")
  sourceCommit?: string; // git HEAD of the live template when frozen
}

export interface TemplateManifest extends TemplateRef {
  schemaVersion: 1;
  gameId: string;
  fileCount: number;
  totalBytes: number;
  frozenAt: string;
}

function versionDir(gameId: string, version: number): string {
  return path.join(STORE_DIR, gameId, `v${version}`);
}

export function listFiles(root: string): string[] {
  return fg.sync("**/*", { cwd: root, ignore: IGNORE, dot: true, onlyFiles: true, followSymbolicLinks: false }).sort();
}

/** Hash of the file tree: stable across machines/mtimes, changes if any path or byte changes. */
export function hashTree(root: string, files: string[] = listFiles(root)): { hash: string; totalBytes: number } {
  const h = createHash("sha256");
  let totalBytes = 0;
  for (const rel of files) {
    const buf = readFileSync(path.join(root, rel));
    totalBytes += buf.byteLength;
    h.update(`${rel}\0${createHash("sha256").update(buf).digest("hex")}\n`);
  }
  return { hash: h.digest("hex"), totalBytes };
}

function sha256File(file: string): string {
  return createHash("sha256").update(readFileSync(file)).digest("hex");
}

// tar's argument parser is not Windows-path safe: it reads backslash sequences
// in "...\Temp\tv-x" as escapes (and "C:" as a remote host). Paths handed to
// it use forward slashes, which every tar on Windows accepts.
const posix = (p: string) => p.split(path.sep).join("/");

function tar(args: string[], cwd: string) {
  execFileSync("tar", args,{ cwd, stdio: ["ignore", "ignore", "pipe"], maxBuffer: 64 * 1024 * 1024 });
}

export function readManifest(gameId: string, version: number): TemplateManifest | null {
  try {
    return JSON.parse(readFileSync(path.join(versionDir(gameId, version), MANIFEST_NAME), "utf8"));
  } catch {
    return null;
  }
}

export function latestVersion(gameId: string): number {
  const dir = path.join(STORE_DIR, gameId);
  if (!existsSync(dir)) return 0;
  return readdirSync(dir)
    .map((n) => /^v(\d+)$/.exec(n))
    .filter((m): m is RegExpExecArray => !!m)
    .reduce((max, m) => Math.max(max, Number(m[1])), 0);
}

function gitHead(repoPath: string): string | undefined {
  try {
    return execFileSync("git", ["rev-parse", "HEAD"], { cwd: repoPath, stdio: ["ignore", "pipe", "ignore"] }).toString().trim();
  } catch {
    return undefined;
  }
}

/**
 * Archives the live template as the next version. If the tree is identical to
 * the latest snapshot nothing new is written (same version returned).
 */
export function freezeTemplate(gameId: string, repoPath: string): TemplateManifest {
  const files = listFiles(repoPath);
  if (files.length === 0) throw new Error(`Template rỗng: ${repoPath}`);
  const { hash, totalBytes } = hashTree(repoPath, files);

  const latest = latestVersion(gameId);
  const prev = latest ? readManifest(gameId, latest) : null;
  if (prev && prev.contentHash === hash) return prev;

  const version = latest + 1;
  const dir = versionDir(gameId, version);
  mkdirSync(dir, { recursive: true });
  const archive = path.join(dir, ARCHIVE_NAME);
  const listFile = path.join(dir, ".filelist.txt");
  writeFileSync(listFile, files.join("\n") + "\n");
  try {
    // Archive name is relative to cwd: GNU tar would read an absolute "D:\..." as host:file.
    tar(["-czf", ARCHIVE_NAME, "-C", posix(repoPath), "-T", ".filelist.txt"], dir);
  } finally {
    rmSync(listFile, { force: true });
  }

  const manifest: TemplateManifest = {
    schemaVersion: 1,
    gameId,
    version,
    contentHash: hash,
    archiveSha256: sha256File(archive),
    repoDir: path.basename(repoPath),
    sourceCommit: gitHead(repoPath),
    fileCount: files.length,
    totalBytes,
    frozenAt: new Date().toISOString(),
  };
  writeFileSync(path.join(dir, MANIFEST_NAME), JSON.stringify(manifest, null, 2) + "\n");
  return manifest;
}

/**
 * Extracts a snapshot and returns the repoPath of the extracted copy. Reuses
 * an earlier extraction of the same contentHash. The archive and the extracted
 * tree are both checked against the manifest, so a corrupted or tampered
 * snapshot fails loudly instead of cloning a subtly different site.
 *
 * `rootDir` defaults to template-materialized/ — the normal working location,
 * whose <gameId>/ folder also hosts that game's clone + uploads siblings, just
 * like game-template-repo/<gameId>/ does today. Verification passes a temp dir.
 */
export function materializeTemplate(gameId: string, ref: TemplateRef, rootDir: string = MATERIALIZED_DIR): string {
  const gameDir = path.join(rootDir, gameId);
  const target = path.join(gameDir, ref.repoDir);
  const marker = path.join(gameDir, HASH_MARKER);
  if (existsSync(target) && existsSync(marker) && readFileSync(marker, "utf8").trim() === ref.contentHash) {
    return target;
  }

  const archive = path.join(versionDir(gameId, ref.version), ARCHIVE_NAME);
  if (!existsSync(archive)) {
    throw new Error(`Không tìm thấy snapshot template ${gameId}@v${ref.version}: ${archive}`);
  }
  if (sha256File(archive) !== ref.archiveSha256) {
    throw new Error(`Snapshot ${gameId}@v${ref.version} bị hỏng hoặc bị sửa (sai sha256 của file nén).`);
  }

  rmSync(marker, { force: true });
  rmSync(target, { recursive: true, force: true });
  mkdirSync(target, { recursive: true });
  tar(["-xzf", ARCHIVE_NAME, "-C", posix(target)], path.dirname(archive));

  if (hashTree(target).hash !== ref.contentHash) {
    rmSync(target, { recursive: true, force: true });
    throw new Error(`Snapshot ${gameId}@v${ref.version} giải nén ra nội dung khác manifest — đã huỷ.`);
  }
  writeFileSync(marker, ref.contentHash);
  return target;
}
