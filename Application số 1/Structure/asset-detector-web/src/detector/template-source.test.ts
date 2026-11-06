import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { fetchGitTemplate, isCommitSha, isSafeGitUrl, listRegistry } from "./template-source";
import { GAME_REPO_MAP } from "./config";

const tmp = mkdtempSync(path.join(os.tmpdir(), "ve-tpl-"));
const origin = path.join(tmp, "origin");
let sha = "";
let fileUrl = "";

const git = (cwd: string, ...args: string[]) =>
  execFileSync("git", ["-c", "user.name=t", "-c", "user.email=t@t", "-C", cwd, ...args], { encoding: "utf8" }).trim();

beforeAll(() => {
  mkdirSync(origin, { recursive: true });
  git(origin, "init", "--quiet", "-b", "main");
  writeFileSync(path.join(origin, "index.html"), "<html>v1</html>");
  mkdirSync(path.join(origin, "src"));
  writeFileSync(path.join(origin, "src", "App.tsx"), "export default 1");
  git(origin, "add", "-A");
  git(origin, "commit", "--quiet", "-m", "v1");
  sha = git(origin, "rev-parse", "HEAD");
  // a second commit: the manifest must pin the FIRST one
  writeFileSync(path.join(origin, "index.html"), "<html>v2</html>");
  git(origin, "commit", "--quiet", "-am", "v2");
  fileUrl = pathToFileURL(origin).href;
});

afterAll(() => rmSync(tmp, { recursive: true, force: true }));

describe("the committed registry", () => {
  const entries = listRegistry();
  it("has a manifest for every game the tool knows, with the same folder name", () => {
    for (const [gameId, repoDir] of Object.entries(GAME_REPO_MAP)) {
      const e = entries.find((x) => x.gameId === gameId);
      expect(e, `manifest of ${gameId}`).toBeTruthy();
      expect(e!.repoDir).toBe(repoDir);
    }
  });
  it("each source is an https git address with a full commit, or null with the reason noted", () => {
    for (const e of entries) {
      if (e.source) {
        expect(isSafeGitUrl(e.source.url), e.gameId).toBe(true);
        expect(isCommitSha(e.source.commit), e.gameId).toBe(true);
      } else {
        expect(e.notes?.length ?? 0, `${e.gameId} has no source: say why`).toBeGreaterThan(0);
      }
    }
  });
});

describe("isSafeGitUrl / isCommitSha", () => {
  it("accepts https only (file only when asked), refuses options and spaces", () => {
    expect(isSafeGitUrl("https://source.vtvlive.vn/a/b.git")).toBe(true);
    expect(isSafeGitUrl("http://x/y.git")).toBe(false);
    expect(isSafeGitUrl("file:///tmp/x")).toBe(false);
    expect(isSafeGitUrl("file:///tmp/x", true)).toBe(true);
    expect(isSafeGitUrl("--upload-pack=evil")).toBe(false);
    expect(isSafeGitUrl("https://x/y z")).toBe(false);
    expect(isSafeGitUrl("ssh://git@x/y.git")).toBe(false);
  });
  it("a commit is exactly 40 hex characters", () => {
    expect(isCommitSha("9f8702794aaebd3deb33d0dc297221ac2f2a3981")).toBe(true);
    expect(isCommitSha("9f870279")).toBe(false);
    expect(isCommitSha("main")).toBe(false);
    expect(isCommitSha("--help")).toBe(false);
  });
});

describe("fetchGitTemplate", () => {
  it("checks out exactly the pinned commit, not the branch tip", async () => {
    const dest = path.join(tmp, "dest1");
    await fetchGitTemplate({ url: fileUrl, commit: sha }, dest, { allowFile: true });
    expect(readFileSync(path.join(dest, "index.html"), "utf8")).toBe("<html>v1</html>");
    expect(readFileSync(path.join(dest, "src", "App.tsx"), "utf8")).toBe("export default 1");
    expect(git(dest, "rev-parse", "HEAD")).toBe(sha);
  });

  it("does not write the credential into the repository", async () => {
    const dest = path.join(tmp, "dest2");
    await fetchGitTemplate({ url: fileUrl, commit: sha }, dest, { allowFile: true, token: "SECRET-TOKEN-123" });
    const config = readFileSync(path.join(dest, ".git", "config"), "utf8");
    expect(config).not.toContain("SECRET-TOKEN-123");
    expect(config).not.toMatch(/extraheader/i);
  });

  it("refuses a bad address or commit before running git", async () => {
    await expect(fetchGitTemplate({ url: "--evil", commit: sha }, path.join(tmp, "d3"))).rejects.toThrow(/địa chỉ/);
    await expect(fetchGitTemplate({ url: fileUrl, commit: sha }, path.join(tmp, "d4"))).rejects.toThrow(/địa chỉ/); // file:// not allowed by default
    await expect(fetchGitTemplate({ url: "https://x.invalid/a.git", commit: "main" }, path.join(tmp, "d5"))).rejects.toThrow(/40 ký tự/);
  });

  it("a failure never shows the token", async () => {
    let message = "";
    try {
      await fetchGitTemplate({ url: "https://127.0.0.1:9/none.git", commit: "a".repeat(40) }, path.join(tmp, "d6"), { token: "SECRET-TOKEN-123", user: "oauth2" });
    } catch (e) {
      message = e instanceof Error ? e.message : String(e);
    }
    expect(message).not.toBe("");
    expect(message).not.toContain("SECRET-TOKEN-123");
    expect(message).not.toContain(Buffer.from("oauth2:SECRET-TOKEN-123").toString("base64"));
  }, 60000);
});

describe("ensureTemplate", () => {
  const root = path.join(tmp, "root");
  const registry = path.join(tmp, "registry");
  const schemas = path.join(tmp, "schemas");
  let ensure: typeof import("./template-source").ensureTemplate;

  beforeAll(async () => {
    mkdirSync(registry, { recursive: true });
    mkdirSync(schemas, { recursive: true });
    const base = { schemaVersion: 1, generatedAt: "2026-01-01T00:00:00Z" };
    writeFileSync(path.join(registry, "phuong-hoang-tru-tien.json"), JSON.stringify({ ...base, gameId: "phuong-hoang-tru-tien", repoDir: "home-page", source: { type: "git", url: fileUrl, commit: sha } }));
    writeFileSync(path.join(registry, "than-ma-ao-hoa.json"), JSON.stringify({ ...base, gameId: "than-ma-ao-hoa", repoDir: "t018-than-ma-website", source: { type: "git", url: fileUrl, commit: "b".repeat(40) } }));
    writeFileSync(path.join(registry, "quy-mon-quan.json"), JSON.stringify({ ...base, gameId: "quy-mon-quan", repoDir: "homepage-va-conhan-web", source: null, notes: ["converted source"] }));
    vi.stubEnv("TEMPLATE_ROOT", root);
    vi.stubEnv("TEMPLATE_REGISTRY_DIR", registry);
    vi.stubEnv("CLONE_SCHEMAS_DIR", schemas);
    vi.resetModules();
    ensure = (await import("./template-source")).ensureTemplate;
  });
  afterAll(() => vi.unstubAllEnvs());

  it("fetches a missing template into TEMPLATE_ROOT/<game>/<repoDir>, then finds it there", async () => {
    const first = await ensure("phuong-hoang-tru-tien", { allowFile: true });
    expect(first.state).toBe("fetched");
    expect(first.repoPath).toBe(path.join(root, "phuong-hoang-tru-tien", "home-page"));
    expect(readFileSync(path.join(first.repoPath!, "index.html"), "utf8")).toBe("<html>v1</html>");
    expect((await ensure("phuong-hoang-tru-tien", { allowFile: true })).state).toBe("present");
  });

  it("leaves no half-built folder behind when the fetch fails", async () => {
    const r = await ensure("than-ma-ao-hoa", { allowFile: true });
    expect(r.state).toBe("failed");
    expect(r.message).toBeTruthy();
    const dir = path.join(root, "than-ma-ao-hoa");
    expect(existsSync(dir) ? readdirSync(dir) : []).toEqual([]);
  });

  it("explains a game that has no git source yet", async () => {
    const r = await ensure("quy-mon-quan", { allowFile: true });
    expect(r.state).toBe("no-source");
    expect(r.message).toMatch(/converted source/);
  });

  it("says so for a game it does not know", async () => {
    expect((await ensure("khong-co-game-nay")).state).toBe("unknown-game");
  });
});
