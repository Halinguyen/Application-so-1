import { describe, expect, it } from "vitest";
import net from "node:net";
import { findFreePort, parsePortRange } from "./preview-port";

describe("parsePortRange", () => {
  it("reads START-END", () => {
    expect(parsePortRange("6000-6050")).toEqual([6000, 6050]);
    expect(parsePortRange(" 6000 - 6001 ")).toEqual([6000, 6001]);
  });
  it("refuses anything else", () => {
    for (const v of [undefined, "", "6000", "6050-6000", "80-90", "6000-70000", "a-b"]) expect(parsePortRange(v)).toBeNull();
  });
});

describe("findFreePort", () => {
  it("any free port without a range", async () => {
    expect(await findFreePort(null)).toBeGreaterThan(0);
  });

  it("stays inside the range and skips a busy port", async () => {
    // find two neighbouring free ports to build a range around
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

  it("says so when the whole range is busy", async () => {
    const base = await findFreePort(null);
    const busy = net.createServer();
    await new Promise<void>((r) => busy.listen(base, "0.0.0.0", () => r()));
    try {
      await expect(findFreePort([base, base])).rejects.toThrow(/no free preview port/);
    } finally {
      busy.close();
    }
  });
});
