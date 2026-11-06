import net from "node:net";

/**
 * Where the preview servers may listen. On a laptop any free port will do (the default). On a server behind Docker or a firewall only
 * a published range is reachable from the operator's browser, so PREVIEW_PORT_RANGE="6000-6050" restricts the choice to it.
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

/** A free port: the first free one inside the configured range, or any free port when there is no range. */
export async function findFreePort(range: [number, number] | null = parsePortRange(process.env.PREVIEW_PORT_RANGE)): Promise<number> {
  if (!range) {
    const any = await tryListen(0);
    if (any === null) throw new Error("no free port");
    return any;
  }
  for (let p = range[0]; p <= range[1]; p++) {
    const ok = await tryListen(p);
    if (ok !== null) return ok;
  }
  throw new Error(`no free preview port in ${range[0]}-${range[1]} (stop a preview or widen PREVIEW_PORT_RANGE)`);
}
