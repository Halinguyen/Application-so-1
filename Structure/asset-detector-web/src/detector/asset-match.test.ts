import { describe, it, expect } from "vitest";
import { allowedTargetPaths, matchMediaToSlot, publicPathOf, type EditSlot } from "./asset-match";

const slots: EditSlot[] = [
  {
    id: "icon",
    label: "icon-app",
    targetPaths: ["public/assets/home/news/768/icon-app.png", "public/assets/home/news/1920/icon-app.png"],
    previewPath: "public/assets/home/news/1920/icon-app.png",
    sizeLabel: "512 × 512 px",
  },
  {
    id: "logo",
    label: "logo",
    targetPaths: ["public/images/banner/1920/logo.png"],
    previewPath: "public/images/banner/1920/logo.png",
    sizeLabel: "",
  },
];
const ORIGIN = "http://localhost:3097";

describe("publicPathOf", () => {
  it("drops the static root folder", () => {
    expect(publicPathOf("public/assets/a.png")).toBe("/assets/a.png");
    expect(publicPathOf(["wwwroot", "img", "a.png"].join(String.fromCharCode(92)))).toBe("/img/a.png");
    expect(publicPathOf("static/a.png")).toBe("/a.png");
  });
});

describe("matchMediaToSlot", () => {
  it("matches a local file to the exact variant on screen", () => {
    const r = matchMediaToSlot(`${ORIGIN}/assets/home/news/768/icon-app.png`, slots, ORIGIN);
    expect(r.remote).toBe(false);
    expect(r.match?.slot.id).toBe("icon");
    expect(r.match?.shownPath).toBe("public/assets/home/news/768/icon-app.png");
  });
  it("ignores a cache-busting query", () => {
    const r = matchMediaToSlot(`${ORIGIN}/assets/home/news/1920/icon-app.png?ve=17`, slots, ORIGIN);
    expect(r.match?.shownPath).toBe("public/assets/home/news/1920/icon-app.png");
  });
  it("recognises a remote (CDN) copy by its path suffix and flags it remote", () => {
    const r = matchMediaToSlot("https://cdn.example.com/web-game/t018/images/banner/1920/logo.png", slots, ORIGIN);
    expect(r.remote).toBe(true);
    expect(r.match?.slot.id).toBe("logo");
  });
  it("does not match a local file that merely ends the same way as a longer path", () => {
    expect(matchMediaToSlot(`${ORIGIN}/other/images/banner/1920/logo.png`, slots, ORIGIN).match).toBeNull();
  });
  it("returns no match for an unknown file or an unparsable src", () => {
    expect(matchMediaToSlot(`${ORIGIN}/nothing.png`, slots, ORIGIN).match).toBeNull();
    expect(matchMediaToSlot("not a url", slots, ORIGIN)).toEqual({ match: null, remote: false });
  });
  it("prefers the longest matching public path", () => {
    const more: EditSlot[] = [
      ...slots,
      { id: "deep", label: "deep", targetPaths: ["public/assets/home/news/1920/icon-app.png".replace("assets/", "assets/x/")], previewPath: "", sizeLabel: "" },
    ];
    const r = matchMediaToSlot("https://cdn.example.com/p/assets/home/news/1920/icon-app.png", more, ORIGIN);
    expect(r.match?.slot.id).toBe("icon");
  });
});

describe("allowedTargetPaths", () => {
  it("is the union of every slot's files", () => {
    const set = allowedTargetPaths(slots);
    expect(set.size).toBe(3);
    expect(set.has("public/images/banner/1920/logo.png")).toBe(true);
    expect(set.has("public/../etc/passwd")).toBe(false);
  });
});
