// Smoke test: change a colour directly in a page of the editor, see it applied, then reset the whole page.
// Usage: TOOL=http://localhost:3100 CLONE=<path of the game's home-page-clone> node scripts/ve-color-smoke.mjs [gameId]
// It changes a colour in the clone and the colour store; "Reset toàn trang" at the end puts everything back.
import { chromium } from "playwright-core";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

const TOOL = process.env.TOOL ?? "http://localhost:3100";
const GAME = process.argv[2] ?? "phuong-hoang-tru-tien";
const CLONE = process.env.CLONE;
const FROM = process.env.FROM ?? "#faea05";
const TO = "#00ff66";
const CHROME = process.env.CHROME ?? "C:/Program Files/Google/Chrome/Application/chrome.exe";
const results = [];
const check = (n, ok, d = "") => { results.push(ok); console.log(`${ok ? "PASS" : "FAIL"}  ${n}${d ? "  — " + d : ""}`); };
const rgbOf = (hex) => { const n = parseInt(hex.slice(1), 16); return `rgb(${n >> 16}, ${(n >> 8) & 255}, ${n & 255})`; };

const browser = await chromium.launch({ executablePath: CHROME, headless: true });
const page = await browser.newPage({ viewport: { width: 2100, height: 1100 } });
page.on("pageerror", (e) => console.log("PAGEERROR", e.message));
await page.goto(`${TOOL}/?game=${GAME}`, { waitUntil: "networkidle" });
await page.locator(".wizard-step").nth(3).click();
await page.getByTestId("visual-edit-toggle").check();
await page.getByRole("button", { name: /Tạo bản sao/ }).click();
await page.getByText("Đã tạo bản sao thành công").waitFor({ timeout: 420000 });
await page.getByRole("button", { name: "Xem trước", exact: true }).click();
await page.getByTestId("ve-frame").first().waitFor({ timeout: 120000 });
await page.waitForTimeout(8000);

// find an element showing the colour, in any loaded page, and press it (a pointer event inside the frame)
const frames = page.getByTestId("ve-frame");
let found = null;
for (let i = 0; i < (await frames.count()) && !found; i++) {
  const fr = await (await frames.nth(i).elementHandle()).contentFrame();
  const ok = await fr.evaluate(([rgb]) => {
    const all = [...document.querySelectorAll("body *")];
    const el = all.find((e) => { const r = e.getBoundingClientRect(); const s = getComputedStyle(e); return r.width > 4 && r.height > 4 && (s.color === rgb || s.backgroundColor === rgb) && e.textContent.trim(); }) ?? all.find((e) => getComputedStyle(e).backgroundColor === rgb);
    if (!el) return false;
    window.__colorEl = el;
    const r = el.getBoundingClientRect();
    const o = { bubbles: true, cancelable: true, clientX: r.left + r.width / 2, clientY: r.top + r.height / 2, pointerId: 1, button: 0, isPrimary: true };
    el.dispatchEvent(new PointerEvent("pointerdown", o));
    el.dispatchEvent(new PointerEvent("pointerup", o));
    return true;
  }, [rgbOf(FROM)]);
  if (ok) found = fr;
}
check(`an element showing ${FROM} was found and pressed`, !!found);
await page.waitForTimeout(800);
const row = page.locator(`[data-testid="ve-color-row"][data-hex="${FROM}"]`);
check("the panel lists that colour for the pressed area", (await row.count()) >= 1);
await row.first().getByTestId("ve-color-input").fill(TO);
await row.first().getByTestId("ve-color-apply").click();
await page.waitForTimeout(6000);
const now = await found.evaluate(() => { const e = window.__colorEl; if (!e || !e.isConnected) return null; const s = getComputedStyle(e); return [s.color, s.backgroundColor]; }).catch(() => null);
check("the page shows the new colour", !now || now.includes(rgbOf(TO)), JSON.stringify(now));
if (CLONE) {
  const scss = readFileSync(join(CLONE, "src/index.scss"), "utf-8").toLowerCase();
  check("the clone's source has the new colour", scss.includes(TO) || readFileSync(join(CLONE, "src/layout/HeaderHome.tsx"), "utf-8").toLowerCase().includes(TO));
}
const store = await (await fetch(`${TOOL}/api/colors?gameId=${GAME}`)).json();
check("the change is remembered for the next build", store.changes?.[FROM]?.to === TO, JSON.stringify(store.changes?.[FROM]?.to));

await page.getByTestId("ve-reset-all").click();
await page.waitForTimeout(3000);
const after = await (await fetch(`${TOOL}/api/colors?gameId=${GAME}`)).json();
check("Reset toàn trang forgets the colour change", Object.keys(after.changes ?? {}).length === 0);
if (CLONE) {
  const all = ["src/index.scss", "src/layout/HeaderHome.tsx", "src/components/home/Rank.tsx"].filter((f) => existsSync(join(CLONE, f))).map((f) => readFileSync(join(CLONE, f), "utf-8").toLowerCase()).join("\n");
  check("and the clone has the old colour back", !all.includes(TO) && all.includes(FROM));
}
await browser.close();
process.exit(results.every(Boolean) ? 0 : 1);
