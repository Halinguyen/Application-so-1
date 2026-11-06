import type { ChildProcess } from "node:child_process";

/**
 * Shared across the clone and preview routes (single in-memory slot, fine
 * for a single-operator internal tool). Regenerating a clone while its own
 * preview dev server is still running fails with EBUSY on Windows (the
 * running Vite process holds the directory) — the clone route calls
 * stopPreview() before wiping, instead of leaving the user to manually
 * kill it first.
 */
let previewProcess: ChildProcess | null = null;
let previewPort: number | null = null;
let previewGameId: string | null = null;

export function getPreview() {
  return { previewProcess, previewPort, previewGameId };
}

export function setPreview(proc: ChildProcess | null, port: number | null, gameId: string | null = null) {
  previewProcess = proc;
  previewPort = port;
  previewGameId = gameId;
}

export async function stopPreview(): Promise<void> {
  const pid = previewProcess?.pid;
  previewProcess = null;
  previewPort = null;
  previewGameId = null;
  if (!pid) return;

  // spawn() with shell:true on Windows returns cmd.exe's PID, not the
  // actual npm/node/vite process it launches — plain process.kill(pid)
  // only kills the empty shell wrapper and leaves vite (and its port/dir
  // lock) running. taskkill's /T kills the whole process tree instead.
  if (process.platform === "win32") {
    const { exec } = await import("node:child_process");
    await new Promise<void>((resolve) => {
      exec(`taskkill /F /T /PID ${pid}`, () => resolve());
    });
  } else {
    try {
      process.kill(-pid, "SIGTERM"); // negative pid targets the process group (detached:true)
    } catch {
      // already gone — fine.
    }
  }
}

/**
 * Also stops dev servers started OUTSIDE this tool (a terminal, a demo script)
 * whose command line points into `dir` — otherwise regenerating the clone
 * fails with EBUSY because they hold the directory. Only node/cmd processes
 * that reference the exact directory are touched.
 */
export async function stopProcessesUsingDir(dir: string): Promise<void> {
  if (process.platform !== "win32") return;
  const { execFile } = await import("node:child_process");
  const needle = dir.replace(/'/g, "''");
  const script =
    `Get-CimInstance Win32_Process | Where-Object { $_.Name -in 'node.exe','cmd.exe' -and $_.CommandLine -and $_.CommandLine.Contains('${needle}') -and $_.ProcessId -ne ${process.pid} } | ForEach-Object { taskkill /F /T /PID $_.ProcessId | Out-Null }`;
  await new Promise<void>((resolve) => {
    execFile("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", script], { windowsHide: true }, () => resolve());
  });
}
