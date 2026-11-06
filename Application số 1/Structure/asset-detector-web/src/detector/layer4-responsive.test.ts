import { describe, expect, it } from "vitest";
import { layer4GroupResponsive } from "./layer4-responsive";
import type { DetectedAsset } from "./types";

function asset(p: string, refs: { file: string; line: number }[]): DetectedAsset {
  const fileName = p.split("/").pop()!;
  return {
    id: p, canonicalPath: p, publicPath: "/" + p.replace(/^public\//, ""), type: "image", fileName, extension: "." + fileName.split(".").pop(), size: 1, hash: p,
    responsive: "shared", references: refs.map((r) => ({ ...r, assetPath: p, usage: "img", attribute: "src" }) as never), referenceCount: refs.length, detectedBy: [], confidence: 0.5,
    needsManualReview: false, isVendor: false, isFooter: false, section: "home-banner", isAutoManaged: false, isExternal: false,
  };
}

describe("layer4GroupResponsive", () => {
  it("counts a breakpoint file's references for the whole asset (a phone-only background keeps the group in use)", async () => {
    const desktop = asset("public/assets/home/banner/1920/banner.png", []); // unused on desktop (the hero is a video there)
    const phone = asset("public/assets/home/banner/768/banner.jpg", [{ file: "src/Banner.tsx", line: 25 }]);
    const { grouped } = await layer4GroupResponsive([desktop, phone]);
    expect(grouped).toHaveLength(1);
    expect(grouped[0].responsive).toBe("per-breakpoint");
    expect(grouped[0].canonicalPath).toBe(desktop.canonicalPath);
    expect(grouped[0].referenceCount).toBe(1);
    expect(grouped[0].references.map((r) => r.file)).toEqual(["src/Banner.tsx"]);
  });

  it("does not double count a reference both files share", async () => {
    const ref = { file: "src/Hero.tsx", line: 7 };
    const { grouped } = await layer4GroupResponsive([asset("public/a/1920/x.png", [ref]), asset("public/a/768/x.png", [ref])]);
    expect(grouped[0].referenceCount).toBe(1);
  });
});
