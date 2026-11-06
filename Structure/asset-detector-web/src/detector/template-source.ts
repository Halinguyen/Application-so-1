import { execFile } from "node:child_process";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { DEFAULT_GAME_ID, GAME_REPO_MAP } from "./config";
import { readCloneSchema } from "./clone-schema";
import { REGISTRY_DIR, TEMPLATE_ROOT } from "./paths";
import { fetchSeedTemplate } from "./template-seed";

const run = promisify(execFile);

/**
 * How a template is obtained when it is not on disk: one small manifest per game (template-registry/<game>.json)
 * with the git address and the exact commit. The sources themselves are NOT stored with the tool.
 */
export interface RegistryEntry {
  schemaVersion: 1;
  gameId: string;
  /** folder of the template inside TEMPLATE_ROOT/<gameId>/ (the same names as GAME_REPO_MAP) */
  repoDir: string;
  /** so the game list needs no template on disk to know what a game is */
  framework?: "nextjs" | "vite-spa" | "dotnet-mvc";
  /** null when the template has no git home yet (see notes) */
  source: { type: "git"; url: string; commit: string; ref?: string } | null;
  /** why there is no source, or how the working copy differed from the pinned commit when the manifest was made */
  notes?: string[];
  generatedAt: string;
}

export function readRegistryEntry(gameId: string): RegistryEntry | null {
  try {
    return JSON.parse(readFileSync(path.join(REGISTRY_DIR, `${gameId}.json`), "utf-8")) as RegistryEntry;
  } catch {
    return null;
  }
}

export function listRegistry(): RegistryEntry[] {
  try {
    return readdirSync(REGISTRY_DIR)
      .filter((f) => f.endsWith(".json"))
      .map((f) => readRegistryEntry(f.replace(/\.json$/, "")))
      .filter((e): e is RegistryEntry => !!e)
      .sort((a, b) => a.gameId.localeCompare(b.gameId));
  } catch {
    return [];
  }
}

export const isCommitSha = (s: unknown): s is string => typeof s === "string" && /^[0-9a-f]{40}$/.test(s);

/** The registry is committed and trusted, but a bad value must never reach `git` as an option or a local path. */
export function isSafeGitUrl(url: unknown, allowFile = false): url is string {
  if (typeof url !== "string" || /\s/.test(url) || url.startsWith("-")) return false;
  return /^https:\/\/[^/]+\/.+/.test(url) || (allowFile && /^file:\/\/\/.+/.test(url));
}

export interface GitFetchOptions {
  token?: string;
  user?: string;
  /** tests fetch from a local repository */
  allowFile?: boolean;
}

/** Removes the credential from any text that is about to be shown (a git error echoes its command line). */
function redactor(token?: string, user = "oauth2"): (s: string) => string {
  const basic = token ? Buffer.from(`${user}:${token}`).toString("base64") : "";
  return (s) => {
    let out = s;
    if (token) out = out.split(token).join("***");
    if (basic) out = out.split(basic).join("***");
    return out;
  };
}

/**
 * Puts the pinned commit of a repository into `dest` (a fresh folder): init, fetch just that commit, check it out.
 * The credential is passed per command (never written into the remote URL or the repo config).
 */
export async function fetchGitTemplate(source: { url: string; commit: string }, dest: string, opts: GitFetchOptions = {}): Promise<void> {
  if (!isSafeGitUrl(source.url, opts.allowFile)) throw new Error("địa chỉ git không hợp lệ (chỉ nhận https://)");
  if (!isCommitSha(source.commit)) throw new Error("commit phải là mã 40 ký tự");
  const redact = redactor(opts.token, opts.user);
  const auth = opts.token && source.url.startsWith("https://")
    ? ["-c", `http.extraHeader=Authorization: Basic ${Buffer.from(`${opts.user || "oauth2"}:${opts.token}`).toString("base64")}`]
    : [];
  const env = { ...process.env, GIT_TERMINAL_PROMPT: "0", GIT_ASKPASS: "echo" };
  const git = async (args: string[], withAuth = false) => {
    try {
      return await run("git", [...(withAuth ? auth : []), "-C", dest, ...args], { env, maxBuffer: 64 * 1024 * 1024, timeout: 15 * 60 * 1000 });
    } catch (e) {
      const err = e as { stderr?: string; message?: string };
      throw new Error(redact(`git ${args[0]} lỗi: ${(err.stderr || err.message || "").trim().slice(0, 600)}`));
    }
  };

  await fs.mkdir(dest, { recursive: true });
  await git(["init", "--quiet"]);
  await git(["remote", "add", "origin", source.url]);
  try {
    await git(["fetch", "--quiet", "--depth", "1", "origin", source.commit], true);
  } catch {
    // some servers do not serve an arbitrary commit by itself: take the history, the commit is in it
    await git(["fetch", "--quiet", "origin"], true);
  }
  await git(["checkout", "--quiet", "--detach", source.commit]);
  const head = (await git(["rev-parse", "HEAD"])).stdout.trim();
  if (head !== source.commit) throw new Error(`đã lấy ${head.slice(0, 8)} thay vì ${source.commit.slice(0, 8)}`);
}

/**
 * For the routes and pages that need a template: makes it available and returns null, or returns the reason it cannot be
 * (to show the operator). An unknown id behaves like resolveGame: it means the default game.
 */
export async function requireTemplate(gameId?: string | null): Promise<string | null> {
  const id = gameId && GAME_REPO_MAP[gameId] ? gameId : DEFAULT_GAME_ID;
  const r = await ensureTemplate(id);
  if (r.state === "failed" || r.state === "no-source") return r.message ?? "template chưa sẵn sàng";
  return null;
}

export type EnsureState = "present" | "snapshot" | "fetched" | "no-source" | "unknown-game" | "failed";
export interface EnsureResult {
  gameId: string;
  repoPath: string | null;
  state: EnsureState;
  message?: string;
}

const inflight = new Map<string, Promise<EnsureResult>>();

/**
 * Makes sure the template of a game is on disk: already there, or a frozen snapshot exists, or it is fetched from git
 * at the commit pinned in its manifest. Safe to call on every request (cheap when present; one fetch at a time per game).
 * A failure is reported, never thrown: the caller decides what to show.
 */
export function ensureTemplate(gameId: string, opts: { allowFile?: boolean } = {}): Promise<EnsureResult> {
  const running = inflight.get(gameId);
  if (running) return running;
  const p = doEnsure(gameId, opts).finally(() => inflight.delete(gameId));
  inflight.set(gameId, p);
  return p;
}

async function doEnsure(gameId: string, opts: { allowFile?: boolean }): Promise<EnsureResult> {
  const repoDir = GAME_REPO_MAP[gameId];
  if (!repoDir) return { gameId, repoPath: null, state: "unknown-game" };
  const repoPath = path.join(TEMPLATE_ROOT, gameId, repoDir);
  if (existsSync(repoPath)) return { gameId, repoPath, state: "present" };
  // A host without git / the company git (Vercel): the template comes as one archive per game (scripts/pack-templates.mjs --per-game).
  if (process.env.TEMPLATE_SEED_BASE_URL) {
    try {
      await fetchSeedTemplate(gameId, repoDir, TEMPLATE_ROOT, { base: process.env.TEMPLATE_SEED_BASE_URL, token: process.env.TEMPLATE_SEED_TOKEN });
      return { gameId, repoPath, state: "fetched" };
    } catch (e) {
      return { gameId, repoPath: null, state: "failed", message: e instanceof Error ? e.message : String(e) };
    }
  }
  if (readCloneSchema(gameId)?.status === "frozen") return { gameId, repoPath: null, state: "snapshot" };

  const entry = readRegistryEntry(gameId);
  if (!entry?.source) {
    return {
      gameId,
      repoPath: null,
      state: "no-source",
      message: `"${gameId}" chưa có nguồn git trong template-registry (${(entry?.notes ?? []).join("; ") || "chưa có manifest"}). Đẩy mã lên git rồi cập nhật manifest.`,
    };
  }
  const partial = `${repoPath}.partial-${process.pid}`;
  try {
    await fs.rm(partial, { recursive: true, force: true });
    await fetchGitTemplate(entry.source, partial, { token: process.env.TEMPLATE_GIT_TOKEN, user: process.env.TEMPLATE_GIT_USER, allowFile: opts.allowFile });
    await fs.mkdir(path.dirname(repoPath), { recursive: true });
    await fs.rename(partial, repoPath); // appears whole or not at all
    return { gameId, repoPath, state: "fetched" };
  } catch (e) {
    await fs.rm(partial, { recursive: true, force: true }).catch(() => {});
    return { gameId, repoPath: null, state: "failed", message: e instanceof Error ? e.message : String(e) };
  }
}
