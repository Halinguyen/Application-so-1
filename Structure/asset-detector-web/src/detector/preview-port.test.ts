import { describe, expect, it } from "vitest";
import net from "node:net";
import { BAD_PORTS, findFreePort, parsePortRange } from "./preview-port";

describe("parsePortRange", () => {
  it("reads START-END", () => {
    expect(parsePortRange("7000-7050")).toEqual([7000, 7050]);
    expect(parsePortRange(" 7000 - 7001 ")).toEqual([7000, 7001]);
  });
  it("refuses anything else", () => {
    for (const v of [undefined, "", "7000", "7050-7000", "80-90", "7000-70000", "a-b"]) expect(parsePortRange(v)).toBeNull();
  });
});

describe("browser-unsafe ports", () => {
  it("the list has the ports that bit this project and the usual ones", () => {
    for (const p of [6000, 6665, 6669, 6697, 5060, 10080, 2049]) expect(BAD_PORTS.has(p)).toBe(true);
    for (const p of [3000, 3100, 7000, 7050, 8080, 8099]) expect(BAD_PORTS.has(p)).toBe(false);
  });

  it("a range that starts on 6000 skips it (this was the 'preview does not open' bug)", async () => {
    const got = await findFreePort([6000, 6003]);
    expect(got).toBeGreaterThan(6000);
    expect(BAD_PORTS.has(got)).toBe(false);
  });

  it("says so when the whole range is unsafe", async () => {
    await expect(findFreePort([6665, 6669])).rejects.toThrow(/no free browser-safe preview port/);
  });
});

describe("findFreePort", () => {
  it("any free port without a range, never an unsafe one", async () => {
    for (let i = 0; i < 5; i++) expect(BAD_PORTS.has(await findFreePort(null))).toBe(false);
  });

  it("stays inside the range and skips a busy port", async () => {
    const base = await findFreePort(null);
    const busy = net.createServer();
    await new Promise<void>((r) => busy.listen(base, "0.0.0.0", () => r()));
    try {
      const got = await findFreePort([base, base + 20]);
      expect(got).toBeGreaterThan(base);
      expect(got).toBeLessThanOrEqual(base + 20);
    } finally {
      busy.close();
    }
  });
});
