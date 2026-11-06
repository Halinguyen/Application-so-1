import { afterEach, describe, expect, it } from "vitest";
import { enabledGameIds, GAME_REPO_MAP, isGameEnabled, VERCEL_GAMES } from "./config";

const saved = { ENABLED_GAMES: process.env.ENABLED_GAMES, VERCEL: process.env.VERCEL };
afterEach(() => {
  for (const [k, v] of Object.entries(saved)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
});

describe("which games a deployment offers", () => {
  it("every game on a laptop / Docker (nothing set)", () => {
    delete process.env.ENABLED_GAMES;
    delete process.env.VERCEL;
    expect(enabledGameIds()).toEqual(Object.keys(GAME_REPO_MAP));
  });

  it("on Vercel by default the five chosen games: T029, T203, T030, R015, T031", () => {
    delete process.env.ENABLED_GAMES;
    process.env.VERCEL = "1";
    expect(enabledGameIds().sort()).toEqual([...VERCEL_GAMES].sort());
    expect(enabledGameIds()).toHaveLength(5);
    expect(isGameEnabled("phuong-hoang-tru-tien")).toBe(true);
    expect(isGameEnabled("than-ma-ao-hoa")).toBe(false);
  });

  it('ENABLED_GAMES="*" opens every game again, a list picks exactly those', () => {
    process.env.VERCEL = "1";
    process.env.ENABLED_GAMES = "*";
    expect(enabledGameIds()).toEqual(Object.keys(GAME_REPO_MAP));
    process.env.ENABLED_GAMES = "than-ma-ao-hoa, quy-mon-quan, not-a-game";
    expect(enabledGameIds().sort()).toEqual(["quy-mon-quan", "than-ma-ao-hoa"]);
  });

  it("the five are all real games", () => {
    for (const g of VERCEL_GAMES) expect(GAME_REPO_MAP[g]).toBeTruthy();
  });
});
