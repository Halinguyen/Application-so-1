import { NextRequest, NextResponse } from "next/server";
import { spawn } from "node:child_process";
import net from "node:net";
import { existsSync, openSync, closeSync } from "node:fs";
import path from "node:path";
import { getCloneDir } from "../route";
import { resolveGame } from "@/detector/config";
import { detectFramework } from "@/detector/framework-detector";
import { getPreview, setPreview, stopPreview } from "@/detector/preview-process";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function findFreePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.unref();
    srv.on("error", reject);
    srv.listen(0, () => {
      const address = srv.address();
      const port = typeof address === "object" && address ? address.port : null;
      srv.close(() => (port ? resolve(port) : reject(new Error("no port"))));
    });
  });
}

function waitForPort(port: number, timeoutMs: number, hasExited: () => boolean = () => false): Promise<boolean> {
  const start = Date.now();
  return new Promise((resolve) => {
    const tryConnect = () => {
      if (hasExited()) return resolve(false);
      const socket = net.createConnection({ port, host: "127.0.0.1" }, () => {
        socket.end();
        resolve(true);
      });
      socket.on("error", () => {
        socket.destroy();
        if (Date.now() - start > timeoutMs) resolve(false);
        else setTimeout(tryConnect, 400);
      });
    };
    tryConnect();
  });
}

export async function POST(request: NextRequest) {
  const { gameId, repoPath } = resolveGame(request.nextUrl.searchParams.get("game"));
  const CLONE_DIR = getCloneDir(repoPath);
  if (!existsSync(CLONE_DIR)) {
    return NextResponse.json(
      { error: "No clone found yet — click 'Generate Clone' first." },
      { status: 400 }
    );
  }

  const { previewPort: existingPort, previewGameId: existingGameId } = getPreview();
  if (existingPort && existingGameId === gameId) {
    const alive = await waitForPort(existingPort, 500);
    if (alive) {
      return NextResponse.json({ gameId, port: existingPort, url: `http://localhost:${existingPort}`, alreadyRunning: true });
    }
  } else if (existingPort) {
    // A preview for a DIFFERENT game is running — the single in-memory slot
    // (preview-process.ts) can't track two at once, so switching games has
    // to stop the old one first, same as regenerating a clone does. Without
    // this, requesting game B's preview while game A's is still up silently
    // returned game A's port/URL as "alreadyRunning" — found piloting
    // than-ma-ao-hoa while a Vite game's preview was still up.
    await stopPreview();
  }

  try {
    const port = await findFreePort();
    // --strictPort is a Vite flag with no Next.js equivalent — `next dev`
    // rejects unknown options and exits immediately (silently, since stdio
    // is "ignore" below), so the spawned process never actually comes up.
    // Found piloting than-ma-ao-hoa: worked instantly run by hand
    // (`npm run dev -- --port X --strictPort` from a shell), failed every
    // time through this exact spawn — the CLI arg mismatch, not a timing
    // issue. Without strictPort, `next dev` would just fall back to a
    // different port on conflict instead of failing — a non-issue here
    // since findFreePort() already hands it a genuinely free one.
    const { framework } = await detectFramework(repoPath);
    const devArgs =
      framework === "nextjs"
        ? ["run", "dev", "--", "--port", String(port)]
        : ["run", "dev", "--", "--port", String(port), "--strictPort"];
    // Log to a file instead of discarding output — a silent crash (wrong
    // CLI flag, missing dependency, a runtime error on first compile) was
    // previously undiagnosable since stdio:"ignore" threw the only evidence
    // away. The log lives in CLONE_DIR itself so it's wiped along with the
    // clone on the next regenerate, same lifecycle as everything else there.
    const logPath = path.join(CLONE_DIR, ".preview.log");
    const logFd = openSync(logPath, "a");
    // shell:true is required on Windows to resolve npm.cmd via PATH.
    // This route runs inside a `next dev` server, whose env carries private
    // Next/Turbopack/PORT/NODE_ENV values; a child `next dev` that inherits
    // them exits silently (empty log) instead of starting. Give the clone a
    // clean env so it behaves like a server started from a terminal.
    const childEnv: NodeJS.ProcessEnv = { ...process.env };
    for (const key of Object.keys(childEnv)) {
      if (/^(__NEXT|NEXT_|TURBOPACK|NODE_OPTIONS$|NODE_ENV$|PORT$)/i.test(key)) delete childEnv[key];
    }
    let childExited = false;
    const child = spawn("npm", devArgs, {
      env: childEnv,
      cwd: CLONE_DIR,
      shell: true,
      detached: true,
      stdio: ["ignore", logFd, logFd],
      windowsHide: true,
    });
    // A raw fd passed to stdio isn't auto-closed by child_process when the
    // child exits (unlike 'pipe') — this server process opened it, so it
    // must close it itself, or the fd leaks for the server's whole lifetime.
    // Found the hard way: after enough preview cycles across different
    // games, the accumulated open handles on old .preview.log files started
    // EPERM-blocking fs.rm() when regenerating THOSE games' clones, with no
    // process obviously still running to explain it — only a server restart
    // (which force-closes all its fds) cleared it.
    child.on("exit", () => {
      childExited = true;
      try {
        closeSync(logFd);
      } catch {
        // already closed — fine.
      }
    });
    child.unref();
    setPreview(child, port, gameId);

    // Next.js games take ~20s to boot, so 15s was too short; and a child
    // that already died must not be reported as "ready".
    const ready = await waitForPort(port, framework === "nextjs" ? 90000 : 30000, () => childExited);
    if (!ready) {
      return NextResponse.json(
        {
          error: childExited
            ? "Preview server exited right after starting — see the log for the reason."
            : "Preview server didn't come up in time — it may still be starting. Try opening the URL in a moment, or run it manually.",
          port,
          url: `http://localhost:${port}`,
          manualCommand: `cd "${CLONE_DIR}" && npm run dev -- ${devArgs.slice(3).join(" ")}`,
          logPath,
        },
        { status: 202 }
      );
    }

    return NextResponse.json({ gameId, port, url: `http://localhost:${port}`, ready: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json(
      {
        error: message,
        manualCommand: `cd "${CLONE_DIR}" && npm run dev`,
      },
      { status: 500 }
    );
  }
}
