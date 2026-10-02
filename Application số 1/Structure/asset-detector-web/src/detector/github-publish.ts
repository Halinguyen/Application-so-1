import fs from "node:fs/promises";
import { existsSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFile } from "node:child_process";

// Publishes a generated clone to a NEW private repo in a GitHub organization.
// Permissions used are deliberately minimal: create a repo in the org, and a
// plain (never forced) `git push`. No delete, no settings, no other API.

export const PROJECT_NAME_RE = /^[a-z][0-9]{3}-[a-z0-9]+(-[a-z0-9]+)*$/;

const SKIP_DIRS = new Set(["node_modules", ".git", ".next", ".idea", ".vs", ".vscode", "bin", "obj", "dist", "coverage"]);
const SKIP_FILES = [
  // every .env* file holds real values (.env.development, .env.production,
  // .env.local…); only the .env.example template is pushed.
  /^\.env(?!\.example$)(\..+)?$/,
  /\.log$/,
  /^tsconfig\.tsbuildinfo$/,
  /^\.DS_Store$/,
  /^Thumbs\.db$/,
];
const MAX_FILE_BYTES = 95 * 1024 * 1024; // GitHub rejects files over 100 MB
const MAX_TOTAL_BYTES = 300 * 1024 * 1024;

export interface PublishableFile {
  rel: string;
  bytes: number;
}

export interface Publishable {
  files: PublishableFile[];
  totalBytes: number;
  skipped: { dirs: string[]; files: number };
}

export async function listPublishable(root: string): Promise<Publishable> {
  const files: PublishableFile[] = [];
  const skippedDirs = new Set<string>();
  let skippedFiles = 0;
  let totalBytes = 0;

  async function walk(dir: string, relDir: string) {
    for (const entry of await fs.readdir(dir, { withFileTypes: true })) {
      const rel = relDir ? `${relDir}/${entry.name}` : entry.name;
      if (entry.isDirectory()) {
        if (SKIP_DIRS.has(entry.name)) {
          skippedDirs.add(rel);
          continue;
        }
        await walk(path.join(dir, entry.name), rel);
      } else if (entry.isFile()) {
        if (SKIP_FILES.some((re) => re.test(entry.name))) {
          skippedFiles++;
          continue;
        }
        const { size } = await fs.stat(path.join(dir, entry.name));
        files.push({ rel, bytes: size });
        totalBytes += size;
      }
    }
  }

  await walk(root, "");
  return { files, totalBytes, skipped: { dirs: [...skippedDirs], files: skippedFiles } };
}

export function checkLimits(p: Publishable): string | null {
  const big = p.files.find((f) => f.bytes > MAX_FILE_BYTES);
  if (big) return `File ${big.rel} quá lớn (${Math.round(big.bytes / 1048576)} MB) — GitHub từ chối file trên 100 MB.`;
  if (p.totalBytes > MAX_TOTAL_BYTES) {
    return `Bản clone quá nặng để đẩy (${Math.round(p.totalBytes / 1048576)} MB, giới hạn ${MAX_TOTAL_BYTES / 1048576} MB).`;
  }
  return null;
}

// Secret-looking keys with a real value in files that would be pushed. Values
// are never returned, only file + key name.
const TEXT_EXT = /\.(env|example|ya?ml|json|ts|tsx|js|jsx|mjs|cjs|cs|config|txt|md|sh|properties)$|^\.env/i;
const CODE_EXT = /\.(ts|tsx|js|jsx|mjs|cjs|cs)$/i;
const SECRET_RE = /([A-Za-z0-9_.-]*(?:SECRET|PASSWORD|PASSWD|PRIVATE_?KEY|API_?KEY|ACCESS_?TOKEN|AUTH_?TOKEN)[A-Za-z0-9_.-]*)["']?\s*[=:]\s*["']?([^\s"'#,}]{8,})/i;

export async function scanSecrets(root: string, files: PublishableFile[]): Promise<{ file: string; key: string }[]> {
  const hits: { file: string; key: string }[] = [];
  for (const f of files) {
    if (f.bytes > 1024 * 1024 || !TEXT_EXT.test(path.basename(f.rel))) continue;
    let text: string;
    try {
      text = await fs.readFile(path.join(root, f.rel), "utf-8");
    } catch {
      continue;
    }
    // In source code an unquoted right-hand side is a variable reference
    // (client_secret: client_secret), not a secret — only a long quoted string
    // literal counts there. Config/env-style files are checked as key=value.
    const isCode = CODE_EXT.test(f.rel);
    for (const line of text.split(/\r?\n/)) {
      const t = line.trim();
      if (t.startsWith("#") || t.startsWith("//")) continue;
      const m = t.match(SECRET_RE);
      if (!m || /process\.env|import\.meta\.env|\$\{|KEY_ENV/i.test(m[2])) continue;
      if (isCode && !/["']?\s*[=:]\s*["'][^"']{16,}["']/.test(t)) continue;
      hits.push({ file: f.rel, key: m[1] });
      break; // one hit per file is enough to block
    }
  }
  return hits;
}

function scrub(text: string, token: string): string {
  return token ? text.split(token).join("***") : text;
}

function git(args: string[], cwd: string, env: NodeJS.ProcessEnv): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile("git", args, { cwd, env, maxBuffer: 64 * 1024 * 1024 }, (err, stdout, stderr) => {
      if (err) reject(new Error(`git ${args[0]} lỗi: ${(stderr || stdout || err.message).toString().trim()}`));
      else resolve(stdout.toString());
    });
  });
}

export type CreateRepoResult = { created: boolean; htmlUrl: string; cloneUrl: string };

export async function createOrgRepo(org: string, name: string, token: string): Promise<CreateRepoResult> {
  const res = await fetch(`https://api.github.com/orgs/${encodeURIComponent(org)}/repos`, {
    method: "POST",
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${token}`,
      "X-GitHub-Api-Version": "2022-11-28",
      "Content-Type": "application/json",
      "User-Agent": "asset-detector-web",
    },
    body: JSON.stringify({ name, private: true, auto_init: false, description: `Website clone ${name}` }),
  });
  const body = (await res.json().catch(() => ({}))) as {
    html_url?: string;
    clone_url?: string;
    message?: string;
    errors?: { message?: string }[];
  };
  if (res.status === 201 && body.html_url && body.clone_url) {
    return { created: true, htmlUrl: body.html_url, cloneUrl: body.clone_url };
  }
  const already = res.status === 422 && (body.errors ?? []).some((e) => /already exists/i.test(e.message ?? ""));
  if (already) {
    return {
      created: false,
      htmlUrl: `https://github.com/${org}/${name}`,
      cloneUrl: `https://github.com/${org}/${name}.git`,
    };
  }
  // GitHub says which permission the endpoint needs and whether the token is
  // tied to the org — surfaced so a 403 can be diagnosed without guessing.
  const needs = res.headers.get("x-accepted-github-permissions");
  const reqId = res.headers.get("x-github-request-id");
  const detail = [needs ? `quyền endpoint yêu cầu: ${needs}` : "", reqId ? `request id: ${reqId}` : ""]
    .filter(Boolean)
    .join("; ");
  const hint =
    res.status === 401
      ? "Token không hợp lệ hoặc đã hết hạn."
      : res.status === 403
        ? "Token thiếu quyền tạo repo trong organization (cần Administration: write) hoặc organization chưa duyệt token."
        : res.status === 404
          ? "Không tìm thấy organization, hoặc token không có quyền với organization này."
          : "";
  throw new Error(
    scrub(`GitHub trả ${res.status}: ${body.message ?? "lỗi không rõ"}. ${hint}${detail ? ` (${detail})` : ""}`.trim(), token)
  );
}

export interface PushResult {
  branch: string;
  commit: string;
  fileCount: number;
  updatedExisting: boolean;
}

/**
 * Copies the publishable files to a temp dir, commits them on top of whatever
 * the remote branch already has (so a re-publish is a normal fast-forward,
 * never a force push) and pushes. `token` is passed through git's env config
 * so it never appears in a URL, argv or .git/config.
 */
export async function pushClone(opts: {
  sourceDir: string;
  files: PublishableFile[];
  remoteUrl: string;
  token?: string;
  branch: string;
  message: string;
}): Promise<PushResult> {
  const work = await fs.mkdtemp(path.join(os.tmpdir(), "clone-publish-"));
  const env: NodeJS.ProcessEnv = { ...process.env, GIT_TERMINAL_PROMPT: "0", GIT_ASKPASS: "echo" };
  if (opts.token) {
    const basic = Buffer.from(`x-access-token:${opts.token}`).toString("base64");
    env.GIT_CONFIG_COUNT = "1";
    env.GIT_CONFIG_KEY_0 = "http.extraheader";
    env.GIT_CONFIG_VALUE_0 = `AUTHORIZATION: basic ${basic}`;
  }
  const token = opts.token ?? "";
  try {
    await git(["init", "-q", "-b", opts.branch], work, env);
    await git(["remote", "add", "origin", opts.remoteUrl], work, env);
    let updatedExisting = false;
    try {
      await git(["fetch", "-q", "origin", opts.branch], work, env);
      await git(["reset", "-q", "--soft", "FETCH_HEAD"], work, env);
      updatedExisting = true;
    } catch {
      // empty remote / branch does not exist yet -> first commit
    }
    for (const f of opts.files) {
      const dest = path.join(work, f.rel);
      await fs.mkdir(path.dirname(dest), { recursive: true });
      await fs.copyFile(path.join(opts.sourceDir, f.rel), dest);
    }
    await git(["add", "-A"], work, env);
    const status = await git(["status", "--porcelain"], work, env);
    if (updatedExisting && status.trim() === "") {
      const head = (await git(["rev-parse", "HEAD"], work, env)).trim();
      return { branch: opts.branch, commit: head, fileCount: opts.files.length, updatedExisting };
    }
    await git(
      ["-c", "user.name=asset-detector-web", "-c", "user.email=asset-detector-web@users.noreply.github.com", "commit", "-q", "-m", opts.message],
      work,
      env
    );
    await git(["push", "-q", "origin", `HEAD:refs/heads/${opts.branch}`], work, env);
    const commit = (await git(["rev-parse", "HEAD"], work, env)).trim();
    return { branch: opts.branch, commit, fileCount: opts.files.length, updatedExisting };
  } catch (e) {
    throw new Error(scrub(e instanceof Error ? e.message : String(e), token));
  } finally {
    await fs.rm(work, { recursive: true, force: true }).catch(() => {});
  }
}

export function cloneDirExists(dir: string): boolean {
  return existsSync(dir);
}
