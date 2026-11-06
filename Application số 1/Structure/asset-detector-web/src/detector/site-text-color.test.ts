import { describe, expect, it } from "vitest";
import { setTagColor } from "./site-text";

const at = (s: string) => s.indexOf("<h1");

describe("setTagColor", () => {
  it("adds an inline colour to a tag that has none", () => {
    const src = `<div><h1 className="inline-block text-white">Phượng Hoàng</h1></div>`;
    expect(setTagColor(src, at(src), "#ff0000")).toBe(`<div><h1 className="inline-block text-white" style={{ color: "#ff0000" }}>Phượng Hoàng</h1></div>`);
  });

  it("adds it to a tag without attributes", () => {
    const src = `<h1>Tên</h1>`;
    expect(setTagColor(src, at(src), "#00ff66")).toBe(`<h1 style={{ color: "#00ff66" }}>Tên</h1>`);
  });

  it("puts the colour first in an existing style object and replaces an older colour", () => {
    expect(setTagColor(`<h1 style={{ fontSize: 12 }}>x</h1>`, 0, "#111111")).toBe(`<h1 style={{ color: "#111111", fontSize: 12 }}>x</h1>`);
    expect(setTagColor(`<h1 style={{ color: "#fff", fontSize: 12 }}>x</h1>`, 0, "#111111")).toBe(`<h1 style={{ color: "#111111", fontSize: 12 }}>x</h1>`);
  });

  it("does not guess at a style that is not an object literal, or a tag with an arrow function", () => {
    expect(setTagColor(`<h1 style={styles.title}>x</h1>`, 0, "#111111")).toBeNull();
    expect(setTagColor(`<h1 onClick={() => go()}>x</h1>`, 0, "#111111")).toBeNull();
  });
});
