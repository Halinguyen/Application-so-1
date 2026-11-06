import { describe, it, expect } from "vitest";
import { isFigmaHidden } from "./config";

describe("isFigmaHidden (temporary per-game switch)", () => {
  it("hides the Figma block for phuong-hoang-tru-tien only", () => {
    expect(isFigmaHidden("phuong-hoang-tru-tien")).toBe(true);
    expect(isFigmaHidden("than-ma-ao-hoa")).toBe(false);
    expect(isFigmaHidden("tuyetdinh-chiengioi")).toBe(false);
    expect(isFigmaHidden("")).toBe(false);
  });
});
