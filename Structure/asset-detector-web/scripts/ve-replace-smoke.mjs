// Smoke test: replace a picture of a SUB-PAGE (rank by default) straight from the editor and see it on screen at once.
// Usage: TOOL=http://localhost:3100 PAGE=/rank ELEMENT=rank.title-rank node scripts/ve-replace-smoke.mjs [gameId]
// The picture is put back with "Khôi phục gốc" at the end (it also forgets the saved upload).
import { chromium } from "playwright-core";
import sharp from "sharp";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const TOOL = process.env.TOOL ?? "http://localhost:3100";
const GAME = process.argv[2] ?? "phuong-hoang-tru-tien";
// give PAGE without the leading slash (Git Bash turns "/x" in an env value into a Windows path): PAGE=tintuc
const PAGE = "/" + (process.env.PAGE ?? "rank").split("/").filter(Boolean).pop();
const ELEMENT = process.env.ELEMENT ?? "rank.title-rank";
const CHROME = process.env.CHROME ?? "C:/Program Files/Google/Chrome/Application/chrome.exe";
const results = [];
const check = (n, ok, d = "") => { results.push(ok); console.log(`${ok ? "PASS" : "FAIL"}  ${n}${d ? "  — " + d : ""}`); };

const png = await sharp({ create: { width: 600, height: 200, channels: 3, background: { r: 255, g: 0, b: 255 } } }).png().toBuffer();
const file = join(mkdtempSync(join(tmpdir(), "ve-rep-")), "magenta.png");
writeFileSync(file, png);

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
await page.waitForTimeout(5000);
await page.getByTestId("ve-stage").evaluate((el) => { el.scrollLeft = el.scrollWidth; });
await page.waitForTimeout(8000);

const frameEl = page.locator(`[data-testid="ve-frame"][data-path="${PAGE}"]`);
check(`the ${PAGE} page is loaded`, (await frameEl.count()) === 1);
const fr = await (await frameEl.elementHandle()).contentFrame();
await fr.waitForSelector(`[data-edit-id="${ELEMENT}"]`, { timeout: 60000 });
const pixel = () => fr.evaluate(async (id) => {
  const el = document.querySelector(`[data-edit-id="${id}"]`);
  const img = el.matches("img") ? el : el.querySelector("img");
  const c = document.createElement("canvas");
  c.width = 4; c.height = 4;
  const x = c.getContext("2d");
  x.drawImage(img, 0, 0, 4, 4);
  const d = x.getImageData(2, 2, 1, 1).data;
  return [d[0], d[1], d[2], d[3]];
}, ELEMENT);
const before = await pixel();

await fr.evaluate((id) => {
  const el = document.querySelector(`[data-edit-id="${id}"]`);
  el.scrollIntoView({ block: "center" });
  const r = el.getBoundingClientRect();
  const o = { bubbles: true, cancelable: true, clientX: r.left + r.width / 2, clientY: r.top + r.height / 2, pointerId: 1, button: 0, isPrimary: true };
  el.dispatchEvent(new PointerEvent("pointerdown", o));
  el.dispatchEvent(new PointerEvent("pointerup", o));
}, ELEMENT);
await page.waitForTimeout(1000);
check("the panel offers an upload for this picture", (await page.getByTestId("ve-asset-replace").count()) >= 1);
await page.getByTestId("ve-asset-file").first().setInputFiles(file);
await page.getByTestId("ve-asset-replace").first().click();
await page.getByTestId("ve-asset-ok").first().waitFor({ timeout: 30000 });
await page.waitForTimeout(2500);
const after = await pixel();
check("the page shows the new picture at once (no manual reload)", after[0] > 200 && after[1] < 60 && after[2] > 200, `before=${before} after=${after}`);

await page.getByTestId("ve-asset-restore").first().click();
await page.waitForTimeout(2500);
const back = await pixel();
check("Khôi phục gốc brings the template's picture back at once", !(back[0] > 200 && back[1] < 60 && back[2] > 200), `back=${back}`);
await browser.close();
process.exit(results.every(Boolean) ? 0 : 1);
