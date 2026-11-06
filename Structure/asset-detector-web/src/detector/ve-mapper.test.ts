import { describe, it, expect } from "vitest";
import mapper from "../../public/ve/mapper.js";

const near = (a: number, b: number, eps = 1e-9) => expect(Math.abs(a - b)).toBeLessThan(eps);

describe("parseTransform", () => {
  it("none -> identity", () => expect(mapper.parseTransform("none")).toEqual([1, 0, 0, 1, 0, 0]));
  it("matrix()", () => expect(mapper.parseTransform("matrix(0.5, 0, 0, 0.5, 10, 20)")).toEqual([0.5, 0, 0, 0.5, 10, 20]));
  it("matrix3d() keeps the 2D part", () => {
    const m3 = "matrix3d(2,0,0,0, 0,3,0,0, 0,0,1,0, 7,8,0,1)";
    expect(mapper.parseTransform(m3)).toEqual([2, 0, 0, 3, 7, 8]);
  });
  it("rejects what it cannot read", () => {
    expect(() => mapper.parseTransform("rotate(10deg)")).toThrow();
    expect(() => mapper.parseTransform("matrix(1,2,3)")).toThrow();
  });
});

describe("compose / invert", () => {
  it("invert undoes a matrix", () => {
    const m = [0.75, 0.1, -0.2, 0.9, 30, -12];
    const p = mapper.applyToPoint(mapper.multiply(mapper.invert(m), m), { x: 41, y: 17 });
    near(p.x, 41);
    near(p.y, 17);
  });
  it("nested scales multiply", () => {
    const m = mapper.compose([[0.5, 0, 0, 0.5, 0, 0], [0.5, 0, 0, 0.5, 0, 0]]);
    expect(m.slice(0, 4)).toEqual([0.25, 0, 0, 0.25]);
  });
  it("a flat chain is identity", () => expect(mapper.compose([])).toEqual([1, 0, 0, 1, 0, 0]));
  it("throws on a singular matrix", () => expect(() => mapper.invert([0, 0, 0, 0, 0, 0])).toThrow());
});

describe("dragToOverride (ScaleLayout: 1440px viewport on a 1920 design = scale 0.75)", () => {
  const scale = [0.75, 0, 0, 0.75, 0, 0];
  const parent = { width: 1920, height: 1000 };

  it("a 75px pointer move is 100 design px", () => {
    const r = mapper.dragToOverride({ left: 100, top: 50 }, 75, 0, scale, parent);
    expect(r.left).toBe(((200 / 1920) * 100).toFixed(3).replace(/0+$/, "").replace(/\.$/, "") + "%");
    expect(r.top).toBe("5%");
  });

  it("is independent of translation (transform-origin / offsets cancel)", () => {
    const a = mapper.dragToOverride({ left: 0, top: 0 }, 30, 30, [0.75, 0, 0, 0.75, 0, 0], parent);
    const b = mapper.dragToOverride({ left: 0, top: 0 }, 30, 30, [0.75, 0, 0, 0.75, 500, -300], parent);
    expect(a).toEqual(b);
  });

  it("nested transforms: scale 0.75 inside scale 0.5", () => {
    const chain = mapper.compose([[0.5, 0, 0, 0.5, 0, 0], [0.75, 0, 0, 0.75, 0, 0]]);
    const r = mapper.dragToOverride({ left: 0, top: 0 }, 37.5, 0, chain, { width: 100, height: 100 });
    expect(r.left).toBe("100%");
  });

  it("mobile base 768 at a 375px viewport", () => {
    const s = 375 / 768;
    const r = mapper.dragToOverride({ left: 0, top: 0 }, 37.5, 0, [s, 0, 0, s, 0, 0], { width: 768, height: 1000 });
    // 37.5 / s = 76.8 design px = exactly 10% of 768
    expect(r.left).toBe("10%");
  });

  it("error stays under 2 design px over many moves", () => {
    for (let i = 1; i <= 200; i++) {
      const dx = (i * 7.3) % 400;
      const dy = (i * 3.1) % 200;
      const r = mapper.dragToOverride({ left: 10, top: 10 }, dx, dy, scale, parent);
      const leftPx = (parseFloat(r.left) / 100) * parent.width;
      const topPx = (parseFloat(r.top) / 100) * parent.height;
      expect(Math.abs(leftPx - (10 + dx / 0.75))).toBeLessThan(2);
      expect(Math.abs(topPx - (10 + dy / 0.75))).toBeLessThan(2);
    }
  });
});

// ---- shared browser code must agree with the server-side compiler ----
import { BREAKPOINT_MEDIA, compileLayoutCss } from "./layout-compile";
import protocol from "../../public/ve/protocol.js";
import { emptyLayout } from "./layout-schema";

describe("browser/server parity", () => {
  it("breakpoint media queries are identical", () => {
    expect(mapper.BREAKPOINT_MEDIA).toEqual(BREAKPOINT_MEDIA);
  });
  it("breakpointOf matches the media ranges", () => {
    expect(mapper.breakpointOf(1440)).toBe("desktop");
    expect(mapper.breakpointOf(769)).toBe("desktop");
    expect(mapper.breakpointOf(768)).toBe("tablet");
    expect(mapper.breakpointOf(481)).toBe("tablet");
    expect(mapper.breakpointOf(480)).toBe("mobile");
    expect(mapper.breakpointOf(375)).toBe("mobile");
  });
  it("live declarations equal the compiled ones", () => {
    const o = { left: "46%", top: "18%", width: "22%", height: "10%", zIndex: 5, hidden: true };
    const layout = emptyLayout("g");
    layout.elements["a.b"] = { overrides: { desktop: o } };
    const css = compileLayoutCss(layout);
    expect(css).toContain(mapper.overrideDeclarations(o).join("; "));
  });
  it("scale is compiled as the CSS scale property, never as transform", () => {
    const layout = emptyLayout("g");
    layout.elements["a.b"] = { overrides: { desktop: { scaleX: 1.5, scaleY: 0.8 } } };
    const css = compileLayoutCss(layout);
    expect(css).toContain("scale: 1.5 0.8");
    expect(css).not.toMatch(/transform|translate/);
    expect(css).toContain(mapper.overrideDeclarations({ scaleX: 1.5, scaleY: 0.8 }).join("; "));
  });
  it("one scale axis alone keeps the other at 1", () => {
    const layout = emptyLayout("g");
    layout.elements["a.b"] = { overrides: { desktop: { scaleX: 2 } } };
    expect(compileLayoutCss(layout)).toContain("scale: 2 1");
    expect(mapper.overrideDeclarations({ scaleX: 2 })).toContain("scale: 2 1");
  });
  it("scale property parses", () => {
    expect(mapper.parseScaleProperty("none")).toEqual([1, 0, 0, 1, 0, 0]);
    expect(mapper.parseScaleProperty("0.9")).toEqual([0.9, 0, 0, 0.9, 0, 0]);
    expect(mapper.parseScaleProperty("0.5 2")).toEqual([0.5, 0, 0, 2, 0, 0]);
    expect(() => mapper.parseScaleProperty("1 2 3")).toThrow();
  });
});

describe("protocol", () => {
  const ok = (type: string, payload: unknown, dir = "toInspector") =>
    protocol.validate(protocol.make(type, payload), dir).ok;

  it("accepts the whitelisted commands", () => {
    expect(ok("INIT", { editMode: true })).toBe(true);
    expect(ok("SELECT", { editId: "banner.logo" })).toBe(true);
    expect(ok("UPDATE_LAYOUT", { editId: "banner.logo", breakpoint: "desktop", override: { left: "5%" } })).toBe(true);
    expect(ok("LAYOUT_CHANGED", { editId: "banner.logo", breakpoint: "mobile", override: { top: "1%" } }, "toEditor")).toBe(true);
  });
  it("RELOAD_MEDIA only takes URL paths", () => {
    expect(ok("RELOAD_MEDIA", { paths: ["/assets/a.png"] })).toBe(true);
    expect(ok("RELOAD_MEDIA", { paths: [] })).toBe(false);
    expect(ok("RELOAD_MEDIA", { paths: ["assets/a.png"] })).toBe(false); // must start with a slash
    expect(ok("RELOAD_MEDIA", { paths: ["/../etc/passwd"] })).toBe(false);
    expect(ok("RELOAD_MEDIA", { paths: [1] })).toBe(false);
    expect(ok("RELOAD_MEDIA", { paths: Array(21).fill("/a.png") })).toBe(false);
    expect(ok("RELOAD_MEDIA", { paths: ["/a.png"] }, "toEditor")).toBe(false); // editor -> inspector only
  });
  it("STATE exists for the editor (so INIT never has to be answered with READY)", () => {
    expect(ok("STATE", { editIds: ["banner.logo"] }, "toEditor")).toBe(true);
    expect(ok("STATE", { editIds: ["banner.logo"] })).toBe(false);
  });
  it("rejects unknown commands, wrong direction, bad payloads and other protocol versions", () => {
    expect(ok("EVAL", { code: "alert(1)" })).toBe(false);
    expect(ok("LAYOUT_CHANGED", { editId: "banner.logo", breakpoint: "desktop", override: {} })).toBe(false); // editor->inspector only knows UPDATE_LAYOUT
    expect(ok("UPDATE_LAYOUT", { editId: "x\"]{}", breakpoint: "desktop", override: {} })).toBe(false);
    expect(ok("UPDATE_LAYOUT", { editId: "a.b", breakpoint: "desktop", override: { left: "1px; x" } })).toBe(false);
    expect(ok("UPDATE_LAYOUT", { editId: "a.b", breakpoint: "desktop", override: { color: "red" } })).toBe(false);
    expect(protocol.validate({ ...protocol.make("INIT", { editMode: true }), protocolVersion: 99 }, "toInspector").ok).toBe(false);
    expect(protocol.validate({ ...protocol.make("INIT", { editMode: true }), channel: "other" }, "toInspector").ok).toBe(false);
    expect(protocol.validate(null, "toInspector").ok).toBe(false);
  });
});

// ---- operator limits ----
import { LIMITS, isAllowedScale, isAllowedValue, isAllowedZIndex, validateLayout as validate } from "./layout-schema";
import { isOverridePatch } from "./layout-patch";

describe("clampDelta: the element stays inside its container", () => {
  const container = { left: 0, top: 0, right: 1000, bottom: 500 };
  const box = { left: 400, top: 100, right: 500, bottom: 200 };

  it("lets small moves through", () => expect(mapper.clampDelta(box, container, 50, -20)).toEqual({ x: 50, y: -20 }));
  it("stops at the right/bottom edge", () => expect(mapper.clampDelta(box, container, 9999, 9999)).toEqual({ x: 500, y: 300 }));
  it("stops at the left/top edge", () => expect(mapper.clampDelta(box, container, -9999, -9999)).toEqual({ x: -400, y: -100 }));

  it("never forces a move on something already sticking out, but cannot go further out", () => {
    const out = { left: -30, top: 10, right: 70, bottom: 60 };
    expect(mapper.clampDelta(out, container, 0, 0)).toEqual({ x: 0, y: 0 });
    expect(mapper.clampDelta(out, container, -50, 0).x).toBe(0);
    expect(mapper.clampDelta(out, container, 40, 0).x).toBe(40);
    expect(mapper.clampDelta(out, container, 9999, 0).x).toBe(930);
  });
  it("leaves an axis free when the box is larger than the container", () => {
    const wide = { left: -100, top: 100, right: 1200, bottom: 200 };
    expect(mapper.clampDelta(wide, container, 77, 0).x).toBe(77);
  });
});

describe("resizeBox: 8 handles", () => {
  const box = { left: 200, top: 100, right: 400, bottom: 200 }; // 200 x 100
  const container = { left: 0, top: 0, right: 1000, bottom: 500 };
  const o = { container, minPx: 18, keepRatio: true };
  const free = { ...o, keepRatio: false };

  it("an edge changes one side only and never moves the opposite edge", () => {
    expect(mapper.resizeBox(box, "e", 50, 99, o)).toEqual({ left: 200, top: 100, right: 450, bottom: 200 });
    expect(mapper.resizeBox(box, "w", -50, 99, o)).toEqual({ left: 150, top: 100, right: 400, bottom: 200 });
    expect(mapper.resizeBox(box, "s", 99, 40, o)).toEqual({ left: 200, top: 100, right: 400, bottom: 240 });
    expect(mapper.resizeBox(box, "n", 99, -40, o)).toEqual({ left: 200, top: 60, right: 400, bottom: 200 });
  });

  it("a corner keeps the ratio by default and anchors the opposite corner", () => {
    const se = mapper.resizeBox(box, "se", 100, 3, o);
    expect(se.left).toBe(200);
    expect(se.top).toBe(100);
    near((se.right - se.left) / (se.bottom - se.top), 2, 1e-9);
    const nw = mapper.resizeBox(box, "nw", -60, -2, o);
    expect(nw.right).toBe(400);
    expect(nw.bottom).toBe(200);
    near((nw.right - nw.left) / (nw.bottom - nw.top), 2, 1e-9);
  });

  it("a corner is free when the ratio lock is off (Shift)", () => {
    expect(mapper.resizeBox(box, "se", 100, 3, free)).toEqual({ left: 200, top: 100, right: 500, bottom: 203 });
    expect(mapper.resizeBox(box, "ne", 20, -50, free)).toEqual({ left: 200, top: 50, right: 420, bottom: 200 });
  });

  it("never smaller than the minimum side (an already smaller box may not shrink further)", () => {
    const e = mapper.resizeBox(box, "e", -5000, 0, free);
    expect(e.right - e.left).toBe(18);
    const w = mapper.resizeBox(box, "w", 5000, 0, free);
    expect(w.right).toBe(400);
    expect(w.right - w.left).toBe(18);
    const tiny = { left: 0, top: 0, right: 10, bottom: 10 };
    const t2 = mapper.resizeBox(tiny, "se", -5, -5, o);
    expect(t2.right - t2.left).toBe(10);
  });

  it("an edge cannot grow past the container", () => {
    expect(mapper.resizeBox(box, "e", 9999, 0, free).right).toBe(1000);
    expect(mapper.resizeBox(box, "w", -9999, 0, free).left).toBe(0);
    expect(mapper.resizeBox(box, "s", 0, 9999, free).bottom).toBe(500);
    expect(mapper.resizeBox(box, "n", 0, -9999, free).top).toBe(0);
  });

  it("a proportional corner stops at the tightest edge", () => {
    // room to the right: 600 (x3 -> 3x), room below: 300 (x4)... se is limited by the right side
    const se = mapper.resizeBox(box, "se", 9999, 0, o);
    expect(se.right).toBe(1000);
    near((se.right - se.left) / (se.bottom - se.top), 2, 1e-9);
    // nw corner: left room 200 + width 200 -> scale 2 at most horizontally, top room 100+100 -> 2
    const nw = mapper.resizeBox(box, "nw", -9999, 0, o);
    expect(nw.left).toBe(0);
    expect(nw.top).toBe(0);
  });

  it("a box already past the container is not forced back, but cannot grow further out", () => {
    const out = { left: 900, top: 100, right: 1100, bottom: 200 };
    expect(mapper.resizeBox(out, "e", 100, 0, free).right).toBe(1100);
    expect(mapper.resizeBox(out, "e", -50, 0, free).right).toBe(1050);
    expect(mapper.resizeBox(out, "se", 500, 0, o).right).toBe(1100);
  });
});

describe("scaleAboutCenter: a picture in the page flow is zoomed about its centre", () => {
  const box = { left: 450, top: 275, right: 550, bottom: 325 }; // 100 x 50, centre (500, 300)
  const container = { left: 0, top: 0, right: 1000, bottom: 600 };
  const o = { container, minPx: 18, keepRatio: true };

  it("an edge changes one axis, the other stays 1", () => {
    const r = mapper.scaleAboutCenter(box, "e", 50, 0, o);
    expect(r.sx).toBeCloseTo(1.5, 9);
    expect(r.sy).toBe(1);
    const s = mapper.scaleAboutCenter(box, "s", 0, 25, o);
    expect(s.sx).toBe(1);
    expect(s.sy).toBeCloseTo(1.5, 9);
  });

  it("a corner keeps the ratio by default and is free without the lock", () => {
    const r = mapper.scaleAboutCenter(box, "se", 100, 3, o);
    expect(r.sx).toBeCloseTo(r.sy, 9);
    expect(r.sx).toBeCloseTo(2, 9);
    const f = mapper.scaleAboutCenter(box, "se", 100, 25, { ...o, keepRatio: false });
    expect(f.sx).toBeCloseTo(2, 9);
    expect(f.sy).toBeCloseTo(1.5, 9);
  });

  it("never smaller than the minimum side", () => {
    const r = mapper.scaleAboutCenter(box, "e", -5000, 0, o);
    expect(r.sx * 100).toBeCloseTo(18, 6);
  });

  it("cannot zoom out of the container, measured from the centre", () => {
    const r = mapper.scaleAboutCenter(box, "se", 99999, 0, o);
    // from the centre: 500 each side of a 100-wide box allows x10, 300 each side of a 50-high box allows x12: the tighter one wins
    expect(r.sx).toBeCloseTo(10, 9);
    expect(r.sy).toBeCloseTo(10, 9);
  });

  it("near an edge the room is the nearer side", () => {
    const left = { left: 10, top: 275, right: 110, bottom: 325 }; // centre x = 60
    const r = mapper.scaleAboutCenter(left, "e", 99999, 0, o);
    expect(r.sx).toBeCloseTo(1.2, 9); // 2*60/100
  });

  it("an element already outside the container may stay, not grow further out", () => {
    const out = { left: -50, top: 275, right: 50, bottom: 325 }; // centre x = 0
    const r = mapper.scaleAboutCenter(out, "e", 200, 0, o);
    expect(r.sx).toBe(1);
  });
});

describe("value limits (server and browser agree)", () => {
  it("both sides share the same numbers", () => expect(protocol.LIMITS).toEqual(LIMITS));

  const cases: [string, "left" | "top" | "width" | "height", string][] = [
    ["ok", "left", "46%"], ["ok", "left", "-50%"], ["ok", "left", "150%"], ["no", "left", "151%"], ["no", "left", "-51%"],
    ["ok", "top", "12.5%"], ["no", "top", "999%"],
    ["ok", "width", "200%"], ["no", "width", "201%"], ["no", "width", "0%"], ["no", "width", "-5%"], ["no", "height", "0"],
    ["ok", "left", "300px"], ["ok", "left", "-300px"], ["no", "left", "10001px"], ["no", "width", "50000px"],
    ["no", "left", "5; color:red"],
  ];
  for (const [verdict, key, value] of cases) {
    it(`${key}: ${value} -> ${verdict}`, () => {
      const expected = verdict === "ok";
      expect(isAllowedValue(key, value)).toBe(expected);
      expect(protocol.lengthOk(key, value)).toBe(expected);
    });
  }

  it("scale range is enforced on both sides", () => {
    for (const [v, ok] of [[0.1, true], [1, true], [5, true], [0.09, false], [5.01, false], [0, false], [-1, false], [Number.NaN, false]] as [number, boolean][]) {
      expect(isAllowedScale(v)).toBe(ok);
      const msg = protocol.make("UPDATE_LAYOUT", { editId: "a.b", breakpoint: "desktop", override: { scaleX: v } });
      expect(protocol.validate(msg, "toInspector").ok).toBe(ok);
      expect(isOverridePatch({ scaleY: v })).toBe(ok);
    }
    expect(isOverridePatch({ scaleX: "2" })).toBe(false);
  });

  it("z-index range is enforced on both sides", () => {
    for (const [z, ok] of [[-10, true], [999, true], [0, true], [-11, false], [1000, false], [1.5, false]] as [number, boolean][]) {
      expect(isAllowedZIndex(z)).toBe(ok);
      expect(protocol.validate(protocol.make("UPDATE_LAYOUT", { editId: "a.b", breakpoint: "desktop", override: { zIndex: z } }), "toInspector").ok).toBe(ok);
    }
  });

  it("an out-of-range layout or patch is rejected", () => {
    const layout = { schemaVersion: 1, gameId: "g", elements: { "a.b": { overrides: { desktop: { left: "400%", zIndex: 5000 } } } } };
    expect(validate(layout).length).toBe(2);
    expect(isOverridePatch({ left: "400%" })).toBe(false);
    expect(isOverridePatch({ zIndex: 5000 })).toBe(false);
    expect(isOverridePatch({ left: "40%", zIndex: 5 })).toBe(true);
  });

  it("warnings in LAYOUT_CHANGED are optional, bounded strings", () => {
    const base = { editId: "a.b", breakpoint: "desktop", override: { left: "1%" } };
    const ok = (p: object) => protocol.validate(protocol.make("LAYOUT_CHANGED", p), "toEditor").ok;
    expect(ok(base)).toBe(true);
    expect(ok({ ...base, warnings: ["Đè lên x"] })).toBe(true);
    expect(ok({ ...base, warnings: [1] })).toBe(false);
    expect(ok({ ...base, warnings: Array(11).fill("x") })).toBe(false);
  });
});
