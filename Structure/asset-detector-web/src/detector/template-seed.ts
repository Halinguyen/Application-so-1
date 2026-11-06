import { execFile } from "node:child_process";
import { createWriteStream } from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { promisify } from "node:util";

const run = promisify(execFile);

/**
 * Template sources for a host that has no `git` and no access to the company git (Vercel): one archive per game, made by
 * `scripts/pack-templates.mjs --per-game`, is downloaded from TEMPLATE_SEED_BASE_URL/<gameId>.tgz and unpacked into the template
 * root on first use. The archive holds `templates/<gameId>/<repoDir>/...`. It carries company sources: serve it from an address
 * that needs a token (TEMPLATE_SEED_TOKEN is sent as a Bearer header) or an unguessable one.
 */
export function seedUrlFor(base: string | undefined, gameId: string): string | null {
  if (!base) return null;
  const trimmed = base.trim().replace(/\/+$/, "");
  // https only, except a local server (tests, a LAN file server)
  if (!/^https:\/\//i.test(trimmed) && !/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?(\/|$)/i.test(trimmed)) return null;
  if (!/^[a-z0-9-]+$/i.test(gameId)) return null;
  return `${trimmed}/${gameId}.tgz`;
}

/** GNU tar reads a backslash in a Windows path as an escape (\t = tab): hand it forward slashes (a no-op on Linux). */
const toPosix = (p: string) => p.split(path.sep).join("/");

export interface SeedOptions {
  base: string | undefined;
  token?: string;
}

/** Downloads and unpacks one game's template into `root/<gameId>/<repoDir>`; the folder appears whole or not at all. */
export async function fetchSeedTemplate(gameId: string, repoDir: string, root: string, opts: SeedOptions): Promise<void> {
  const url = seedUrlFor(opts.base, gameId);
  if (!url) throw new Error("TEMPLATE_SEED_BASE_URL không hợp lệ (cần https://…)");
  await fs.mkdir(root, { recursive: true });
  const tag = `${gameId}-${process.pid}`;
  const archive = path.join(root, `.seed-${tag}.tgz`);
  const partial = path.join(root, `.seed-${tag}.partial`);
  try {
    let res: Response;
    try {
      res = await fetch(url, { headers: opts.token ? { Authorization: `Bearer ${opts.token}` } : undefined });
    } catch (e) {
      throw new Error(`không tải được ${url.replace(/\?.*$/, "")}: ${e instanceof Error ? e.message : String(e)}`);
    }
    if (!res.ok || !res.body) throw new Error(`tải ${url.replace(/\?.*$/, "")} lỗi ${res.status}`);
    await pipeline(Readable.fromWeb(res.body as never), createWriteStream(archive));

    await fs.rm(partial, { recursive: true, force: true });
    await fs.mkdir(partial, { recursive: true });
    try {
      // --force-local: a Windows path with "C:" would be read as a remote host
      await run("tar", ["--force-local", "-xzf", toPosix(archive), "--strip-components=1", "-C", toPosix(partial)], { maxBuffer: 16 * 1024 * 1024 });
    } catch (e) {
      throw new Error(`giải nén ${gameId}.tgz lỗi: ${(e as { stderr?: string; message?: string }).stderr || (e as Error).message}`.slice(0, 400));
    }
    const unpacked = path.join(partial, gameId, repoDir);
    await fs.access(unpacked).catch(() => {
      throw new Error(`${gameId}.tgz không chứa templates/${gameId}/${repoDir}`);
    });
    await fs.mkdir(path.join(root, gameId), { recursive: true });
    await fs.rename(unpacked, path.join(root, gameId, repoDir));
  } finally {
    await fs.rm(archive, { force: true }).catch(() => {});
    await fs.rm(partial, { recursive: true, force: true }).catch(() => {});
  }
}
