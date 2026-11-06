// Smoke test: change a colour for ONE area in a page of the editor; other places using the same colour must NOT change.
// Usage: TOOL=http://localhost:3100 node scripts/ve-color-smoke.mjs [gameId]
// "Reset toàn trang" at the end forgets the change.
import { chromium } from "playwright-core";

const TOOL = process.env.TOOL ?? "http://localhost:3100";
const GAME = process.argv[2] ?? "phuong-hoang-tru-tien";
const FROM = process.env.FROM ?? "#ffffff"; // a colour that many places use (white text)
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

const frames = page.getByTestId("ve-frame");
const fr = await (await frames.first().elementHandle()).contentFrame();
// all elements with visible text in the colour; press the first
const info = await fr.evaluate(([rgb]) => {
  const all = [...document.querySelectorAll("body *")].filter((e) => {
    const r = e.getBoundingClientRect();
    return r.width > 4 && r.height > 4 && getComputedStyle(e).color === rgb && [...e.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim());
  });
  if (all.length === 0) return null;
  all.forEach((e, i) => e.setAttribute("data-smoke", String(i)));
  const el = all[0];
  const r = el.getBoundingClientRect();
  const o = { bubbles: true, cancelable: true, clientX: r.left + r.width / 2, clientY: r.top + r.height / 2, pointerId: 1, button: 0, isPrimary: true };
  el.dispatchEvent(new PointerEvent("pointerdown", o));
  el.dispatchEvent(new PointerEvent("pointerup", o));
  return { total: all.length };
}, [rgbOf(FROM)]);
check(`texts showing ${FROM} were found (several, to prove the scope)`, !!info && info.total >= 2, JSON.stringify(info));
await page.waitForTimeout(800);
const row = page.locator('[data-testid="ve-color-row"]').filter({ hasText: "Chữ" }).filter({ has: page.locator(`xpath=.//*[contains(text(), "${FROM}")]`) });
check("the panel lists the text colour of the pressed area", (await row.count()) >= 1);
await row.first().getByTestId("ve-color-input").fill(TO);
await row.first().getByTestId("ve-color-apply").click();
await page.waitForTimeout(3000);

const after = await fr.evaluate(([from, to]) => {
  const els = [...document.querySelectorAll("[data-smoke]")];
  return { changed: els.filter((e) => getComputedStyle(e).color === to).length, kept: els.filter((e) => getComputedStyle(e).color === from).length, total: els.length };
}, [rgbOf(FROM), rgbOf(TO)]);
check("the pressed area shows the new colour", after.changed >= 1, JSON.stringify(after));
check("the other places that used the same colour are unchanged", after.kept === after.total - after.changed && after.kept >= 1, JSON.stringify(after));
const rules = await (await fetch(`${TOOL}/api/colors?gameId=${GAME}`)).json();
check("exactly one rule is remembered for the next build", rules.rules?.length === 1, JSON.stringify(rules.rules));

await page.getByTestId("ve-reset-all").click();
await page.waitForTimeout(2500);
const gone = await (await fetch(`${TOOL}/api/colors?gameId=${GAME}`)).json();
check("Reset toàn trang forgets the colour change", (gone.rules ?? []).length === 0);
await browser.close();
process.exit(results.every(Boolean) ? 0 : 1);
