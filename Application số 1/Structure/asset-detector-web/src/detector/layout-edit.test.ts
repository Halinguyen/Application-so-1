import { describe, it, expect } from "vitest";
import { fileStem, injectEditIds, slotFromAssetPath } from "./edit-id";
import { compileLayoutCss } from "./layout-compile";
import { patchAllowedFor } from "./layout-patch";
import {
  applicableLayout,
  checkLayoutConflicts,
  emptyLayout,
  validateLayout,
  type EditManifest,
  type LayoutFile,
} from "./layout-schema";

// line numbers below are 1-based lines of this string (first line is empty)
const BANNER = `
const Banner = () => (
  <section className='w-full relative' id='banner'>
    <img className='w-full md:hidden' src='/images/banner/768/bg.jpg' />
    <a className={\`absolute top-1 \${p ? 'hidden' : 'md:left-[7%]'}\`}>
      <h1><picture>
        <source srcSet='\${x}/banner/768/logo.png' />
        <img src='\${x}/banner/1920/logo.png' />
      </picture></h1>
    </a>
    <div className='absolute bottom-0'>
      <img src='\${x}/banner/1920/btn-a.png' />
      <img src='\${x}/banner/1920/btn-b.png' />
    </div>
    <div className='absolute top-0'><img src='\${x}/other/logo.png' /></div>
  </section>
)`;

const REFS = [
  { line: 4, attribute: "src", assetPath: "/images/banner/768/bg.jpg" },
  { line: 7, attribute: "srcSet", assetPath: "${}/banner/768/logo.png" },
  { line: 8, attribute: "src", assetPath: "${}/banner/1920/logo.png" },
  { line: 12, attribute: "src", assetPath: "${}/banner/1920/btn-a.png" },
  { line: 13, attribute: "src", assetPath: "${}/banner/1920/btn-b.png" },
  { line: 15, attribute: "src", assetPath: "${}/other/logo.png" },
];

describe("slotFromAssetPath", () => {
  it("drops breakpoint folders, template holes and extension", () => {
    expect(slotFromAssetPath("${}/banner/1920/logo-duatop.png")).toBe("banner.logo-duatop");
    expect(slotFromAssetPath("/images/banner/768/banner-2.jpg")).toBe("banner.banner-2");
  });
  it("gives the same slot for the same asset at two breakpoints", () => {
    expect(slotFromAssetPath("${}/banner/768/logo.png")).toBe(slotFromAssetPath("${}/banner/1920/logo.png"));
  });
});

describe("fileStem", () => {
  it("uses the folder for page/index/layout files", () => {
    expect(fileStem("src/components/Banner.tsx")).toBe("banner");
    expect(fileStem("src/components/EventGift.tsx")).toBe("event-gift");
    expect(fileStem("src/app/rank/page.tsx")).toBe("rank");
    expect(fileStem("src/app/bao-danh/[slug]/page.tsx")).toBe("slug");
  });
});

describe("injectEditIds: multi-line attributes (Vite: src={handleConcatPathImage({ path: ... })})", () => {
  const SRC = `
const Banner = () => (
  <div className="absolute top-0">
    <img
      src={handleConcatPathImage({
        path: "/assets/home/banner/logo-game.png",
      })}
      className="w-full"
    />
  </div>
)`;
  it("finds the element although the reported line is not the attribute's first line", () => {
    const r = injectEditIds(SRC, "src/components/home/Banner.tsx", [
      { line: 6, attribute: "path", assetPath: "/assets/home/banner/logo-game.png" },
    ]);
    expect(r.entries.map((e) => e.editId)).toEqual(["banner.logo-game"]);
    expect(r.code).toMatch(/<div data-edit-id="banner.logo-game" className="absolute top-0">/);
    expect(r.skipped).toHaveLength(0);
  });
  it("does not attach a reference to an unrelated attribute that shares its line range", () => {
    const r = injectEditIds(SRC, "src/components/home/Banner.tsx", [
      { line: 6, attribute: "path", assetPath: "/assets/home/banner/something-else.png" },
    ]);
    expect(r.entries).toHaveLength(0);
  });
});

describe("injectEditIds", () => {
  const r = injectEditIds(BANNER, "src/components/Banner.tsx", REFS);

  it("puts one id on each positioned element, named after its first asset slot", () => {
    expect(r.entries.map((e) => e.editId)).toEqual(["banner.logo", "banner.btn-a", "banner.other.logo"]);
    expect(r.code).toMatch(/<a data-edit-id="banner.logo" className=/);
    expect(r.code).toMatch(/<div data-edit-id="banner.btn-a" className='absolute bottom-0'/);
  });

  it("lists every asset of a shared element and merges the two breakpoint files of one slot", () => {
    expect(r.entries[0].assets).toEqual(["${}/banner/768/logo.png", "${}/banner/1920/logo.png"]);
    expect(r.entries[1].assets).toEqual(["${}/banner/1920/btn-a.png", "${}/banner/1920/btn-b.png"]);
  });

  it("skips and reports an image that is not inside any absolute element", () => {
    expect(r.skipped).toHaveLength(1);
    expect(r.skipped[0]).toMatchObject({ line: 4, assetPath: "/images/banner/768/bg.jpg" });
    expect(r.code).not.toMatch(/<section[^>]*data-edit-id/);
    expect(r.code).not.toMatch(/<img[^>]*data-edit-id/);
  });

  it("names the same asset on another page after that page, no suffix needed", () => {
    const used = new Set(r.entries.map((e) => e.editId));
    const again = injectEditIds(BANNER, "src/app/rank/page.tsx", REFS, used);
    expect(again.entries.map((e) => e.editId)).toEqual(["rank.banner.logo", "rank.banner.btn-a", "rank.other.logo"]);
  });

  it("uses ~N only for a real clash, and numbers it per file", () => {
    const used = new Set(["banner.logo"]);
    const again = injectEditIds(BANNER, "src/components/Banner.tsx", REFS, used);
    expect(again.entries[0].editId).toBe("banner.logo~2");
  });

  it("does not depend on line numbers: the same slot keeps its id after the file shifts", () => {
    const shifted = injectEditIds("\n\n// moved\n" + BANNER, "src/components/Banner.tsx", REFS.map((x) => ({ ...x, line: x.line + 3 })));
    expect(shifted.entries.map((e) => e.editId)).toEqual(r.entries.map((e) => e.editId));
  });

  it("only adds attributes: stripping them returns the original source", () => {
    expect(r.code.replace(/ data-edit-id="[^"]*"/g, "")).toBe(BANNER);
  });
});

describe("compileLayoutCss", () => {
  const layout: LayoutFile = {
    ...emptyLayout("g"),
    elements: {
      "banner.logo": {
        overrides: {
          desktop: { left: "46%", top: "18%", width: "22%", zIndex: 5 },
          mobile: { hidden: true },
        },
      },
    },
  };

  it("uses a doubled attribute selector, no !important, and releases right/bottom", () => {
    const css = compileLayoutCss(layout);
    expect(css).toContain('[data-edit-id="banner.logo"][data-edit-id]');
    expect(css).not.toContain("!important");
    expect(css).toContain("@media (min-width: 769px)");
    expect(css).toContain("left: 46%");
    expect(css).toContain("right: auto");
    expect(css).toContain("bottom: auto");
    expect(css).toContain("z-index: 5");
    expect(css).toContain("@media (max-width: 480px)");
    expect(css).toContain("display: none");
    expect(css).not.toContain("tablet");
  });

  it("never writes transform", () => {
    expect(compileLayoutCss(layout)).not.toMatch(/transform|translate/);
  });

  it("rejects values that could inject CSS", () => {
    const bad = structuredClone(layout);
    bad.elements["banner.logo"].overrides.desktop!.left = "1px; } body { display:none";
    expect(validateLayout(bad).length).toBeGreaterThan(0);
    expect(() => compileLayoutCss(bad)).toThrow();
  });

  it("rejects an edit id that could break out of the selector", () => {
    const bad = emptyLayout("g");
    bad.elements['x"] { } a[b="1'] = { overrides: { desktop: { left: "1%" } } };
    expect(() => compileLayoutCss(bad)).toThrow();
  });
});

describe("conflicts", () => {
  const manifest: EditManifest = {
    schemaVersion: 1,
    gameId: "g",
    entries: [{ editId: "banner.logo", sourcePath: "x", slot: "banner.logo", assets: [], editable: true }],
    skipped: [],
  };
  const layout: LayoutFile = {
    ...emptyLayout("g"),
    templateRef: { contentHash: "aaa" },
    elements: {
      "banner.logo": { overrides: { desktop: { left: "1%" } } },
      "gone.slot": { overrides: { desktop: { left: "2%" } } },
    },
  };

  it("reports vanished ids and does not apply them", () => {
    const c = checkLayoutConflicts(layout, manifest, "aaa");
    expect(c.missing).toEqual(["gone.slot"]);
    expect(c.templateChanged).toBe(false);
    expect(Object.keys(applicableLayout(layout, c).elements)).toEqual(["banner.logo"]);
  });

  it("applies nothing when the template changed", () => {
    const c = checkLayoutConflicts(layout, manifest, "bbb");
    expect(c.templateChanged).toBe(true);
    expect(applicableLayout(layout, c).elements).toEqual({});
  });
});

describe("injectEditIds: pictures in the page flow can be scaled (not moved)", () => {
  const SRC = `
const A = () => (
  <section className="relative">
    <img className="object-contain w-4 h-4" src="/assets/tintuc/1920/chevrons-left.png" />
    <picture>
      <source media="(max-width: 768px)" srcSet="/assets/header/768/logo.png" />
      <img className="w-24 h-24" src="/assets/header/1920/logo.png" />
    </picture>
    <img className="w-full" src="/assets/rank/1920/bg-rank.png" />
    <picture className="block">
      <source srcSet="/assets/rank/768/frame.png" />
      <img className="inset-0" src="/assets/rank/1920/frame.png" />
    </picture>
    <video src="/assets/clips/intro.mp4" className="w-full" />
  </section>
)`;
  const REFS = [
    { line: 4, attribute: "src", assetPath: "/assets/tintuc/1920/chevrons-left.png" },
    { line: 6, attribute: "srcSet", assetPath: "/assets/header/768/logo.png" },
    { line: 7, attribute: "src", assetPath: "/assets/header/1920/logo.png" },
    { line: 9, attribute: "src", assetPath: "/assets/rank/1920/bg-rank.png" },
    { line: 11, attribute: "srcSet", assetPath: "/assets/rank/768/frame.png" },
    { line: 12, attribute: "src", assetPath: "/assets/rank/1920/frame.png" },
    { line: 14, attribute: "src", assetPath: "/assets/clips/intro.mp4" },
  ];
  const r = injectEditIds(SRC, "src/components/Pagination.tsx", REFS);

  it("tags the <img> itself, marked scale-only", () => {
    expect(r.entries.map((e) => [e.editId, e.mode])).toEqual([
      ["pagination.tintuc.chevrons-left", "scale"],
      ["pagination.header.logo", "scale"],
    ]);
    expect(r.code).toMatch(/<img data-edit-id="pagination.tintuc.chevrons-left" data-edit-mode="scale" className="object-contain w-4 h-4"/);
  });

  it("for a <picture> it tags the <img> (an inline <picture> cannot be transformed) and merges both files", () => {
    expect(r.code).toMatch(/<img data-edit-id="pagination.header.logo" data-edit-mode="scale" className="w-24 h-24"/);
    expect(r.code).not.toMatch(/<picture[^>]*data-edit-id/);
    expect(r.entries[1].assets).toEqual(["/assets/header/768/logo.png", "/assets/header/1920/logo.png"]);
  });

  it("refuses full-width backgrounds, full-bleed pictures and videos, and says why", () => {
    const why = Object.fromEntries(r.skipped.map((s) => [s.assetPath, s.reason]));
    expect(why["/assets/rank/1920/bg-rank.png"]).toMatch(/background/);
    expect(why["/assets/rank/1920/frame.png"]).toMatch(/background/);
    expect(why["/assets/rank/768/frame.png"]).toMatch(/background/);
    expect(why["/assets/clips/intro.mp4"]).toMatch(/video/);
    expect(r.entries.some((e) => e.assets.some((a) => /bg-rank|frame|intro/.test(a)))).toBe(false);
  });

  it("a positioned host still wins: its picture is not offered a second time as scale-only", () => {
    const pos = injectEditIds(
      `const A = () => (\n  <div className="absolute top-0">\n    <img className="w-4" src="/a/x.png" />\n  </div>\n)`,
      "src/A.tsx",
      [{ line: 3, attribute: "src", assetPath: "/a/x.png" }]
    );
    expect(pos.entries).toHaveLength(1);
    expect(pos.entries[0].mode).toBeUndefined();
    expect(pos.code).toMatch(/<div data-edit-id=/);
    expect(pos.code).not.toMatch(/data-edit-mode/);
  });

  it("only adds attributes", () => {
    expect(r.code.replace(/ data-edit-(id|mode)="[^"]*"/g, "")).toBe(SRC);
  });
});

describe("patchAllowedFor: what a scale-only element may take", () => {
  it("accepts scale and hidden only", () => {
    expect(patchAllowedFor("scale", { scaleX: 1.2, scaleY: 1.2 })).toBe(true);
    expect(patchAllowedFor("scale", { hidden: true })).toBe(true);
    expect(patchAllowedFor("scale", { left: "5%" })).toBe(false);
    expect(patchAllowedFor("scale", { zIndex: 3 })).toBe(false);
    expect(patchAllowedFor("scale", { width: "10%" })).toBe(false);
    expect(patchAllowedFor("scale", { scaleX: 1.2, top: "1%" })).toBe(false);
  });
  it("a normal element takes everything", () => {
    expect(patchAllowedFor(undefined, { left: "5%", zIndex: 3 })).toBe(true);
    expect(patchAllowedFor("full", { width: "10%" })).toBe(true);
  });
});

describe("injectEditIds: pictures whose src is data (API): layout editable, content locked", () => {
  const SRC = `
const A = ({ slide, tab, siteConfig }) => (
  <section className="relative">
    <div className="absolute top-0 left-0">
      <img className="w-20" src={slide.image} />
    </div>
    <img className="object-contain" src={tab.image} />
    <img className="object-contain" src={siteConfig?.site_logo_url || "/assets/home/icon-app.png"} />
    <img className="w-full" src={slide.cover} />
    <video src={slide.clip} />
    <img className="object-contain" src={"/assets/static.png"} />
  </section>
)`;
  const r = injectEditIds(SRC, "src/components/news/SliderPC.tsx", []);

  it("names the picture after the data field it shows", () => {
    expect(r.entries.map((e) => e.editId)).toEqual(["slider-pc.data-image", "slider-pc.data-image~2", "slider-pc.data-site-logo-url"]);
  });

  it("marks it as API data, with nothing to replace, and keeps the mode of its place", () => {
    expect(r.entries.every((e) => e.source === "api" && e.assets.length === 0)).toBe(true);
    expect(r.entries[0].mode).toBeUndefined(); // inside an absolute element: can be moved
    expect(r.entries[1].mode).toBe("scale"); // in the flow: zoom only
    expect(r.code).toMatch(/<div data-edit-id="slider-pc.data-image" data-edit-source="api" className="absolute top-0 left-0">/);
    expect(r.code).toMatch(/<img data-edit-id="slider-pc.data-image~2" data-edit-mode="scale" data-edit-source="api"/);
  });

  it("still refuses full-bleed data pictures and dynamic videos, with the reason", () => {
    const why = r.skipped.map((s) => s.reason).join("|");
    expect(why).toMatch(/background/);
    expect(why).toMatch(/video/);
    expect(r.code).not.toMatch(/<video[^>]*data-edit-id/);
  });

  it("ignores a plain string src (that is a file, the detector's job)", () => {
    expect(r.code).not.toMatch(/static\.png[^>]*data-edit-id|data-edit-id[^>]*static\.png/);
  });

  it("a file picture in the same element makes it a normal (replaceable) element", () => {
    const mixed = injectEditIds(
      `const A = ({ q }) => (\n  <div className="absolute top-0">\n    <img src={q.qr} />\n    <img src="/a/icon.png" />\n  </div>\n)`,
      "src/layout/FloatHome.tsx",
      [{ line: 4, attribute: "src", assetPath: "/a/icon.png" }]
    );
    expect(mixed.entries).toHaveLength(1);
    expect(mixed.entries[0].source).toBeUndefined();
    expect(mixed.entries[0].assets).toEqual(["/a/icon.png"]);
    expect(mixed.code).not.toMatch(/data-edit-source/);
  });

  it("only adds attributes", () => {
    expect(r.code.replace(/ data-edit-(id|mode|source)="[^"]*"/g, "")).toBe(SRC);
  });
});
