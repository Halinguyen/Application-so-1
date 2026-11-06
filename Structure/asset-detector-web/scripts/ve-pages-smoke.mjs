// Smoke test for the side-by-side page editor: every page of the game is its own iframe and can be edited.
// Usage: TOOL=http://localhost:3100 node scripts/ve-pages-smoke.mjs [gameId]
import { chromium } from "playwright-core";
const TOOL = process.env.TOOL ?? "http://localhost:3100";
const GAME = process.argv[2] ?? "phuong-hoang-tru-tien";
const CHROME = process.env.CHROME ?? "C:/Program Files/Google/Chrome/Application/chrome.exe";
const results = [];
const check = (n, ok, d = "") => { results.push(ok); console.log(`${ok ? "PASS" : "FAIL"}  ${n}${d ? "  — " + d : ""}`); };

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

const n = await page.getByTestId("ve-page").count();
const paths = await page.getByTestId("ve-page").evaluateAll((els) => els.map((e) => e.getAttribute("data-path")));
check("several pages are laid out side by side", n >= 2, `${n} pages: ${paths.join(" ")}`);

// only pages near the visible area are loaded (8 full pages at once crash the browser)
const loaded0 = await page.getByTestId("ve-frame").count();
check("pages far off screen are not loaded", loaded0 > 0 && loaded0 < n, `${loaded0} of ${n} loaded`);

// every loaded frame has the inspector and editable elements
const fpaths = await page.getByTestId("ve-frame").evaluateAll((els) => els.map((e) => e.getAttribute("data-path")));
for (let i = 0; i < fpaths.length; i++) {
  const el = await page.getByTestId("ve-frame").nth(i).elementHandle();
  const fr = await el.contentFrame();
  await fr.waitForSelector("[data-edit-id]", { timeout: 90000 }).catch(() => {});
  const cnt = await fr.locator("[data-edit-id]").count();
  const hasInspector = await fr.evaluate(() => !!window.__VE_CONFIG__ || !!document.getElementById("__ve_css"));
  check(`page ${fpaths[i]} has the inspector`, hasInspector, `${cnt} editable elements`);
}

// select an element on the LAST page: the panel shows it; select one on the first page: panel switches
async function pick(i) {
  const el = await page.getByTestId("ve-frame").nth(i).elementHandle();
  const fr = await el.contentFrame();
  const id = await fr.evaluate(() => {
    const cand = [...document.querySelectorAll("[data-edit-id]")].find((e) => { const r = e.getBoundingClientRect(); return r.width > 20 && r.height > 20 && r.top >= 0 && r.top < innerHeight; });
    return cand ? cand.getAttribute("data-edit-id") : null;
  });
  if (!id) return null;
  // pointer events sent inside the frame: independent of how the page is scaled on screen
  await fr.evaluate((sel) => {
    const el = document.querySelector('[data-edit-id="' + sel + '"]');
    const r = el.getBoundingClientRect();
    const o = { bubbles: true, cancelable: true, clientX: r.left + r.width / 2, clientY: r.top + r.height / 2, pointerId: 1, button: 0, isPrimary: true };
    el.dispatchEvent(new PointerEvent("pointerdown", o));
    el.dispatchEvent(new PointerEvent("pointerup", o));
  }, id);
  await page.waitForTimeout(800);
  return id;
}
const first = await pick(0);
check("selecting on the first page switches the selection", !!first && (await page.getByTestId("ve-selected").count()) === 1, String(first));
check("no 'element not found' error", (await page.getByTestId("ve-message").count()) === 0);
check("the panel has no explanatory text left but the reset-all button", (await page.getByTestId("ve-reset-all").count()) === 1 && (await page.getByTestId("ve-reset-one").count()) === 0 && (await page.getByTestId("ve-history").count()) === 0);
await page.getByTestId("ve-stage").evaluate((el) => { el.scrollLeft = el.scrollWidth; });
await page.waitForTimeout(6000);
const fAfter = await page.getByTestId("ve-frame").evaluateAll((els) => els.map((e) => e.getAttribute("data-path")));
check("scrolling to the end loads the last page and unloads the first", fAfter.includes(paths[n - 1]) && !fAfter.includes(paths[0]), fAfter.join(" "));
let last = null;
for (let i = (await page.getByTestId("ve-frame").count()) - 1; i >= 0 && !last; i--) last = await pick(i);
check("selecting on the last page shows the controls", !!last && (await page.getByTestId("ve-selected").count()) === 1, String(last));
await page.screenshot({ path: process.env.SHOT ?? "ve-pages.png" });
await browser.close();
process.exit(results.every(Boolean) ? 0 : 1);
