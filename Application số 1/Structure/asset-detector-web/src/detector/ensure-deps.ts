import { existsSync } from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";

// A live template ships with node_modules and the clone just links to it. A
// template re-extracted from a frozen snapshot has none (snapshots never
// contain dependencies), so install once from its lockfile. The result stays
// in the materialized folder and is reused by every later clone.
export async function ensureDependencies(repoPath: string): Promise<{ installed: boolean }> {
  if (existsSync(path.join(repoPath, "node_modules")) || !existsSync(path.join(repoPath, "package.json"))) {
    return { installed: false };
  }
  const cmd = existsSync(path.join(repoPath, "package-lock.json"))
    ? "npm ci --no-audit --no-fund"
    : existsSync(path.join(repoPath, "yarn.lock"))
      ? "yarn install --frozen-lockfile"
      : "npm install --no-audit --no-fund";

  // Same clean env as the preview spawn: this runs inside `next dev`, whose
  // private NEXT_*/NODE_ENV values break a child package manager/dev server.
  const env: NodeJS.ProcessEnv = { ...process.env };
  for (const key of Object.keys(env)) {
    if (/^(__NEXT|NEXT_|TURBOPACK|NODE_OPTIONS$|NODE_ENV$|PORT$)/i.test(key)) delete env[key];
  }
  await new Promise<void>((resolve, reject) => {
    let tail = "";
    const child = spawn(cmd, { cwd: repoPath, env, shell: true, windowsHide: true });
    const keep = (b: Buffer) => (tail = (tail + b.toString()).slice(-2000));
    child.stdout.on("data", keep);
    child.stderr.on("data", keep);
    child.on("error", reject);
    child.on("exit", (code) =>
      code === 0 ? resolve() : reject(new Error(`"${cmd}" thất bại (exit ${code}) trong ${repoPath}:\n${tail.trim()}`))
    );
  });
  return { installed: true };
}
