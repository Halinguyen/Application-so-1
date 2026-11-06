import { describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import fs from "node:fs/promises";
import http from "node:http";
import type { AddressInfo } from "node:net";
import os from "node:os";
import path from "node:path";
import { fetchSeedTemplate, seedUrlFor } from "./template-seed";

describe("seedUrlFor", () => {
  it("builds <base>/<gameId>.tgz for https and local addresses only", () => {
    expect(seedUrlFor("https://blob.example/seed/", "than-ma-ao-hoa")).toBe("https://blob.example/seed/than-ma-ao-hoa.tgz");
    expect(seedUrlFor("http://127.0.0.1:9000", "a-b")).toBe("http://127.0.0.1:9000/a-b.tgz");
    for (const base of [undefined, "", "http://evil.example/x", "ftp://x/y", "file:///etc"]) expect(seedUrlFor(base, "a")).toBeNull();
    expect(seedUrlFor("https://x.example", "../etc")).toBeNull();
  });
});

async function serve(files: Record<string, Buffer>, needToken?: string) {
  const seen: { auth?: string }[] = [];
  const server = http.createServer((req, res) => {
    seen.push({ auth: req.headers.authorization });
    if (needToken && req.headers.authorization !== `Bearer ${needToken}`) {
      res.writeHead(401).end();
      return;
    }
    const body = files[(req.url ?? "").replace(/^\//, "")];
    if (!body) res.writeHead(404).end();
    else res.writeHead(200, { "content-type": "application/gzip" }).end(body);
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", () => r()));
  return { base: `http://127.0.0.1:${(server.address() as AddressInfo).port}`, seen, close: () => server.close() };
}

async function makeArchive(root: string, gameId: string, repoDir: string): Promise<Buffer> {
  const src = path.join(root, "src-tree");
  await fs.mkdir(path.join(src, gameId, repoDir, "public"), { recursive: true });
  await fs.writeFile(path.join(src, gameId, repoDir, "package.json"), "{}");
  await fs.writeFile(path.join(src, gameId, repoDir, "public", "a.png"), "x");
  const out = path.join(root, "seed.tgz");
  execFileSync("tar", ["--force-local", "-czf", out.split(path.sep).join("/"), "--transform", "s,^,templates/,", "-C", src.split(path.sep).join("/"), gameId]);
  return fs.readFile(out);
}

describe("fetchSeedTemplate", () => {
  it("downloads, unpacks and places the template as root/<gameId>/<repoDir>", async () => {
    const work = await fs.mkdtemp(path.join(os.tmpdir(), "seed-"));
    const srv = await serve({ "g1.tgz": await makeArchive(work, "g1", "home-page") });
    try {
      const root = path.join(work, "templates");
      await fetchSeedTemplate("g1", "home-page", root, { base: srv.base });
      expect(await fs.readFile(path.join(root, "g1", "home-page", "package.json"), "utf-8")).toBe("{}");
      expect((await fs.readdir(root)).filter((n) => n.startsWith(".seed"))).toEqual([]); // no leftovers
    } finally {
      srv.close();
      await fs.rm(work, { recursive: true, force: true });
    }
  });

  it("sends the token as a Bearer header, and says so when it is refused", async () => {
    const work = await fs.mkdtemp(path.join(os.tmpdir(), "seed-"));
    const srv = await serve({ "g1.tgz": await makeArchive(work, "g1", "home-page") }, "s3cret");
    try {
      const root = path.join(work, "templates");
      await expect(fetchSeedTemplate("g1", "home-page", root, { base: srv.base })).rejects.toThrow(/401/);
      await fetchSeedTemplate("g1", "home-page", root, { base: srv.base, token: "s3cret" });
      expect(srv.seen.at(-1)?.auth).toBe("Bearer s3cret");
    } finally {
      srv.close();
      await fs.rm(work, { recursive: true, force: true });
    }
  });

  it("fails clearly for a missing archive or a wrong layout, leaving nothing behind", async () => {
    const work = await fs.mkdtemp(path.join(os.tmpdir(), "seed-"));
    const srv = await serve({ "g1.tgz": await makeArchive(work, "g1", "other-dir") });
    try {
      const root = path.join(work, "templates");
      await expect(fetchSeedTemplate("nope", "home-page", root, { base: srv.base })).rejects.toThrow(/404/);
      await expect(fetchSeedTemplate("g1", "home-page", root, { base: srv.base })).rejects.toThrow(/không chứa/);
      expect((await fs.readdir(root)).filter((n) => n !== "g1" && !n.startsWith("."))).toEqual([]);
      await expect(fs.access(path.join(root, "g1", "home-page"))).rejects.toThrow();
    } finally {
      srv.close();
      await fs.rm(work, { recursive: true, force: true });
    }
  });
});
