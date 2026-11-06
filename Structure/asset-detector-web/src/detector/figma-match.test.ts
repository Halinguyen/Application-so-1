import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { existsSync } from "node:fs";
import { matchSlots, type FigmaNode, type MatchSlot } from "./figma-match";
import { readSlotContext } from "./figma-context";

const GAME = "phuong-hoang-tru-tien";
const dir = path.join(process.cwd(), "src/detector/figma-snapshots");
const snapshot = JSON.parse(readFileSync(path.join(dir, `${GAME}.json`), "utf8")) as {
  frameBySection: Record<string, string>;
  nodes: FigmaNode[];
};
const truth = JSON.parse(readFileSync(path.join(dir, `${GAME}.ground-truth.json`), "utf8")) as { pairs: Record<string, string | null> };
const schema = JSON.parse(readFileSync(path.join(process.cwd(), "..", "clone-schemas", `${GAME}.json`), "utf8"));

// Every image slot the wizard could list (the matcher sees all of them, as it does in the wizard: slots claim nodes).
const slots: (MatchSlot & { key: string })[] = schema.detection.assets
  .filter((a: { type: string; isFooter: boolean; isExternal: boolean; dimensions?: unknown; referenceCount: number; isAutoManaged: boolean }) => a.type === "image" && !a.isFooter && !a.isExternal && a.dimensions && (a.isAutoManaged || a.referenceCount > 0))
  .map((a: { id: string; section: string; fileName: string; dimensions: { width: number; height: number } }) => ({
    id: a.id,
    key: `${a.section}/${a.fileName}`,
    fileName: a.fileName,
    section: a.section,
    width: a.dimensions.width,
    height: a.dimensions.height,
  }));

// The same slots, enriched with what the website's JSX says about each image (needs the materialized template on disk).
const REPO = path.join(process.cwd(), "..", "template-materialized", GAME, "home-page");
const refsById = new Map<string, { file: string; line: number }[]>(schema.detection.assets.map((a: { id: string; references: { file: string; line: number }[] }) => [a.id, a.references]));
const withContext: (MatchSlot & { key: string })[] | null = existsSync(REPO)
  ? await Promise.all(
      slots.map(async (s) => {
        const usages = (await readSlotContext(REPO, refsById.get(s.id) ?? [])).map((c) => ({ w: c.displayW, h: c.displayH, aspect: c.aspect, altTokens: c.altTokens }));
        return { ...s, usages };
      })
    )
  : null;

const suggestions = matchSlots(snapshot.nodes, slots, { frameBySection: snapshot.frameBySection });
const byKey = new Map(slots.map((s) => [s.key, suggestions.find((x) => x.slotId === s.id)!]));

describe("matchSlots on phuong-hoang-tru-tien (12-slot PoC)", () => {
  const rows = Object.entries(truth.pairs).map(([key, expected]) => {
    const s = byKey.get(key);
    return { key, expected, got: s?.nodeId ?? null, status: s?.status ?? "none", score: +(s?.score ?? 0).toFixed(2), margin: +(s?.margin ?? 0).toFixed(2) };
  });

  it("reports the table", () => {
    console.table(rows);
  });

  it("auto-applied mappings reach 90% precision, and uncertain slots are never auto", () => {
    const auto = rows.filter((r) => r.status === "auto");
    const correct = auto.filter((r) => r.expected !== null && r.got === r.expected);
    console.log(`auto ${auto.length}/${rows.length}, correct ${correct.length}, review ${rows.filter((r) => r.status === "review").length}`);
    expect(auto.length).toBeGreaterThan(0);
    expect(correct.length / auto.length).toBeGreaterThanOrEqual(0.9);
    expect(rows.filter((r) => r.expected === null).every((r) => r.status !== "auto")).toBe(true);
  });

  it("tells the four same-size composite buttons apart by their text", () => {
    for (const k of ["btn-nap", "btn-fanpage", "btn-giftcode", "btn-cskh"]) {
      expect(byKey.get(`home-news/${k}.png`)?.nodeId).toBe(truth.pairs[`home-news/${k}.png`]);
    }
  });

  it("does not pick the whole sidebar for the sidebar background", () => {
    expect(byKey.get("float-home/float-right.png")?.nodeId).toBe("I74:387;2040:501");
  });

  it("flags a flat-colour background as render-solid", () => {
    expect(byKey.get("home-news/banner.png")?.exportKind).toBe("render-solid");
  });
  it("never proposes a node inside the footer (every site brings its own SDK footer)", () => {
    const node = (id: string, name: string, parent: string | null): FigmaNode => ({ id, name, type: parent ? "RECTANGLE" : "FRAME", parent, frame: "f", w: 188, h: 50, visible: true, hasImage: true, solid: false });
    const nodes = [node("f", "page", null), node("ft", "footer-web", "f"), node("logo", "logo-Vplay", "ft")];
    const [s] = matchSlots(nodes, [{ id: "s", fileName: "logo-game.png", section: "x", width: 188, height: 50 }], { frameBySection: { x: "f" } });
    expect(s.nodeId).toBeNull();
    expect(s.status).toBe("none");
  });
});

describe.skipIf(!withContext)("matchSlots with the website's JSX context", () => {
  const ctxSuggestions = matchSlots(snapshot.nodes, withContext ?? [], { frameBySection: snapshot.frameBySection });
  const ctxByKey = new Map((withContext ?? []).map((s) => [s.key, ctxSuggestions.find((x) => x.slotId === s.id)!]));

  it("keeps 90% precision on the hand-checked slots", () => {
    const rows = Object.entries(truth.pairs).map(([key, expected]) => ({ key, expected, got: ctxByKey.get(key)?.nodeId ?? null, status: ctxByKey.get(key)?.status ?? "none", score: +(ctxByKey.get(key)?.score ?? 0).toFixed(2) }));
    console.table(rows);
    const auto = rows.filter((r) => r.status === "auto");
    expect(auto.length).toBeGreaterThan(0);
    expect(auto.filter((r) => r.expected !== null && r.got === r.expected).length / auto.length).toBeGreaterThanOrEqual(0.9);
    expect(rows.filter((r) => r.expected === null).every((r) => r.status !== "auto")).toBe(true);
  });

  it("weighs the size an image is shown at, not only the size of its file (icon-app.png: 512x512 file, shown 207x207 in the download panel)", () => {
    const icon = ctxByKey.get("home-news/icon-app.png");
    expect(icon?.alternatives.map((a) => a.nodeId)).toContain("I67:494;2001:442");
    const plain = suggestions.find((x) => x.slotId === slots.find((s) => s.key === "home-news/icon-app.png")?.id);
    expect(icon?.alternatives.find((a) => a.nodeId === "I67:494;2001:442")?.score ?? 0).toBeGreaterThan(plain?.alternatives.find((a) => a.nodeId === "I67:494;2001:442")?.score ?? 0);
  });

  it("does not blend two usages of one file (icon-app.png is the app icon AND the fallback of a 100x100 QR code): both stay candidates, so it needs review", () => {
    expect(ctxByKey.get("home-news/icon-app.png")?.status).toBe("review");
  });
});
