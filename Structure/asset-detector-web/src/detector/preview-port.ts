import net from "node:net";

/**
 * Ports that browsers (Chrome, Firefox: ERR_UNSAFE_PORT) and Node's fetch refuse to connect to — the WHATWG Fetch "bad ports" list. A
 * preview server on one of them cannot be opened in the operator's browser; a Next.js game's `next dev` even exits at once (code 1, empty
 * log) because it fetches itself. 6000 (X11) is the one that bit this project: the range 6000-6050 started on it. Never use them.
 */
export const BAD_PORTS = new Set([
  1, 7, 9, 11, 13, 15, 17, 19, 20, 21, 22, 23, 25, 37, 42, 43, 53, 69, 77, 79, 87, 95, 101, 102, 103, 104, 109, 110, 111, 113, 115, 117,
  119, 123, 135, 137, 139, 143, 161, 179, 389, 427, 465, 512, 513, 514, 515, 526, 530, 531, 532, 540, 548, 554, 556, 563, 587, 601, 636,
  989, 990, 993, 995, 1719, 1720, 1723, 2049, 3659, 4045, 4190, 5060, 5061, 6000, 6566, 6665, 6666, 6667, 6668, 6669, 6679, 6697, 10080,
]);

/**
 * Where the preview servers may listen. On a laptop any free port will do (the default). On a server behind Docker or a firewall only
 * a published range is reachable from the operator's browser, so PREVIEW_PORT_RANGE="7000-7050" restricts the choice to it.
 */
export function parsePortRange(value: string | undefined): [number, number] | null {
  const m = /^\s*(\d{2,5})\s*-\s*(\d{2,5})\s*$/.exec(value ?? "");
  if (!m) return null;
  const a = Number(m[1]);
  const b = Number(m[2]);
  if (a < 1024 || b > 65535 || a > b) return null;
  return [a, b];
}

function tryListen(port: number): Promise<number | null> {
  return new Promise((resolve) => {
    const srv = net.createServer();
    srv.unref();
    srv.once("error", () => resolve(null));
    srv.listen(port, "0.0.0.0", () => {
      const address = srv.address();
      const got = typeof address === "object" && address ? address.port : null;
      srv.close(() => resolve(got));
    });
  });
}

/** A free, browser-safe port: the first one inside the configured range, or any free one when there is no range. */
export async function findFreePort(range: [number, number] | null = parsePortRange(process.env.PREVIEW_PORT_RANGE)): Promise<number> {
  if (!range) {
    // the OS picks at random: ask again if it hands out a port the browser would refuse
    for (let i = 0; i < 20; i++) {
      const any = await tryListen(0);
      if (any === null) throw new Error("no free port");
      if (!BAD_PORTS.has(any)) return any;
    }
    throw new Error("no browser-safe free port");
  }
  for (let p = range[0]; p <= range[1]; p++) {
    if (BAD_PORTS.has(p)) continue;
    const ok = await tryListen(p);
    if (ok !== null) return ok;
  }
  throw new Error(`no free browser-safe preview port in ${range[0]}-${range[1]} (stop a preview or widen PREVIEW_PORT_RANGE)`);
}
