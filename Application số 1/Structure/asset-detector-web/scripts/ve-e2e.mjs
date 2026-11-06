// PoC end-to-end: drives the REAL wizard (step 4) with Playwright and checks the
// acceptance criteria of Structure/14-PLAN-visual-editing.md section 11.
// Needs the tool running (default http://localhost:3100) and Chrome installed.
// Usage: node scripts/ve-e2e.mjs [gameId] [editId]
import { chromium } from "playwright-core";
import sharp from "sharp";
import { createHash } from "node:crypto";
import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const TOOL = process.env.TOOL ?? "http://localhost:3100";
const GAME = process.argv[2] ?? "than-ma-ao-hoa";
// Defaults are for than-ma-ao-hoa (Next.js). Other games: TARGET / NEIGHBOUR / GROUP / MOBILE_TARGET / FIXED / DRAG env vars.
const TARGET = process.env.TARGET ?? process.argv[3] ?? "banner.btn-video";
const NEIGHBOUR = process.env.NEIGHBOUR ?? "banner.frame";
const GROUP = process.env.GROUP ?? "banner.dot"; // a picture with its own fixed size, or a group of pictures
const MOBILE_TARGET = process.env.MOBILE_TARGET ?? TARGET; // an element visible at 375px
const FIXED = process.env.FIXED ?? ""; // optional position:fixed element
const DRAG = Number(process.env.DRAG ?? 100);
const ROUTE_ELEMENT = process.env.ROUTE_ELEMENT ?? ""; // an element that lives on another page than "/"
// Git Bash rewrites an env value that starts with "/" into a Windows path, so give it WITHOUT the slash (rank, not /rank)
const ROUTE_PATH = "/" + (process.env.ROUTE_PATH ?? "").split("/").filter(Boolean).join("/");
const ROUTE_DATA = process.env.ROUTE_DATA === "1"; // that element is a picture from API data
const FLOW = process.env.FLOW ?? ""; // a picture in the page flow (scale-only)
const ASSET = process.env.ASSET ?? ""; // an element that shows one local picture (replace-from-preview test)
const SCALED_DRAG = Number(process.env.SCALED_DRAG ?? 65); // screen px dragged in the small-window test
const SAME = MOBILE_TARGET === TARGET;
// the template folder of this game (to compare the restored picture with the original byte for byte)
// same rule as src/detector/paths.ts: env, else the old sibling folder if it exists, else ./data/templates
const siblingRoot = resolve("..", "game-template-repo");
const TEMPLATE_ROOT = join(process.env.TEMPLATE_ROOT ? resolve(process.env.TEMPLATE_ROOT) : existsSync(siblingRoot) ? siblingRoot : resolve(process.env.APP_DATA_DIR || "data", "templates"), process.argv[2] ?? "than-ma-ao-hoa");
const TEMPLATE_DIR = process.env.TEMPLATE_DIR ?? join(TEMPLATE_ROOT, readdirSync(TEMPLATE_ROOT).find((d) => existsSync(join(TEMPLATE_ROOT, d, "package.json")) && existsSync(join(TEMPLATE_ROOT, d, "public"))) ?? "");
const STEP = Number(process.env.STEP ?? 1); // scales the resize distances for small elements
const CENTER = process.env.CENTER === "1"; // first put the element in the middle of its container, so there is room to grow in every direction
const CHROME = process.env.CHROME ?? "C:/Program Files/Google/Chrome/Application/chrome.exe";

const results = [];
function check(name, ok, detail = "") {
  results.push({ name, ok });
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? "  — " + detail : ""}`);
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const api = async (method, q = "", body) => {
  const r = await fetch(`${TOOL}/api/layout?gameId=${GAME}${q}`, {
    method,
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  return r.json();
};

// start from an empty layout so baselines are the template's own
await api("DELETE");

const browser = await chromium.launch({ executablePath: CHROME, headless: true });
const page = await browser.newPage({ viewport: { width: 2100, height: 1300 } });
page.on("pageerror", (e) => console.log("PAGEERROR", e.message));

// ---- open the wizard on the preview step, build the clone with editing on ----
await page.goto(`${TOOL}/?game=${GAME}`, { waitUntil: "networkidle" });
await page.locator(".wizard-step").nth(3).click(); // step 4: preview
await page.getByTestId("visual-edit-toggle").check();
await page.getByRole("button", { name: /Tạo bản sao/ }).click();
await page.getByText("Đã tạo bản sao thành công").waitFor({ timeout: 420000 });
await page.getByRole("button", { name: "Xem trước", exact: true }).click();
await page.getByTestId("ve-frame").waitFor({ timeout: 120000 });
const frameEl = await page.getByTestId("ve-frame").elementHandle();
const frame = await frameEl.contentFrame();
await frame.waitForSelector(`[data-edit-id="${TARGET}"]`, { timeout: 180000 });
await page.getByTestId("ve-panel").waitFor();
await page.getByText(/có trên trang này/).waitFor({ timeout: 60000 });
check("editor opens inside the wizard and the clone exposes editable elements", true);

const rectOf = (id) =>
  frame.evaluate((i) => {
    const el = document.querySelector(`[data-edit-id="${i}"]`);
    if (!el) return null;
    const r = el.getBoundingClientRect();
    const pr = (window.__veContainerOf(el) || document.documentElement).getBoundingClientRect();
    const cs = getComputedStyle(el);
    return { x: r.x, y: r.y, rx: r.x - pr.x, ry: r.y - pr.y, w: r.width, h: r.height, z: cs.zIndex, display: cs.display };
  }, id);

async function setViewport(key) {
  await page.getByTestId(`vp-${key}`).click();
  await sleep(1500);
}
async function scrollIntoFrame(id) {
  await frame.evaluate((i) => document.querySelector(`[data-edit-id="${i}"]`).scrollIntoView({ block: "center", inline: "center" }), id);
  await sleep(500);
}
async function pageCenter(id) {
  const box = await frameEl.boundingBox();
  const r = await rectOf(id);
  return { cx: box.x + r.x + r.w / 2, cy: box.y + r.y + r.h / 2, hx: box.x + r.x + r.w, hy: box.y + r.y + r.h };
}
async function dragMouse(fromX, fromY, dx, dy) {
  const vp = page.viewportSize();
  // the driver ignores coordinates outside the window, so "far away" means "the window edge"
  const toX = Math.min(Math.max(fromX + dx, 1), vp.width - 1);
  const toY = Math.min(Math.max(fromY + dy, 1), vp.height - 1);
  await page.mouse.move(fromX, fromY);
  await page.mouse.down();
  for (let i = 1; i <= 12; i++) await page.mouse.move(fromX + ((toX - fromX) * i) / 12, fromY + ((toY - fromY) * i) / 12);
  await page.mouse.up();
}
async function savedOverride(bp, id = TARGET) {
  const j = await api("GET");
  return j.layout.elements[id]?.overrides?.[bp];
}
async function waitSaved(bp, pred, id = TARGET) {
  for (let i = 0; i < 40; i++) {
    const o = await savedOverride(bp, id);
    if (o && (!pred || pred(o))) return o;
    await sleep(250);
  }
  return null;
}

// The grip (✥) always moves the SELECTED element, even when another editable element lies on top of it
// (common in these templates: pressing at the middle of a picture can hit a picture drawn over it).
async function gripPage(fh, fr, sc = 1) {
  const bx = await fh.boundingBox();
  const g = await fr.evaluate(() => { const q = document.querySelector("[data-ve-move]").getBoundingClientRect(); return { x: q.left + q.width / 2, y: q.top + q.height / 2 }; });
  return { x: bx.x + g.x * sc, y: bx.y + g.y * sc };
}

// moves the selected element so its centre is the centre of its containing block
async function centreInContainer(id) {
  const fh = await page.getByTestId("ve-frame").elementHandle();
  const fr = await fh.contentFrame();
  await page.getByRole("button", { name: id, exact: true }).click();
  await page.getByTestId("ve-selected").waitFor({ timeout: 10000 });
  await sleep(700);
  await fr.evaluate((i) => document.querySelector(`[data-edit-id="${i}"]`).scrollIntoView({ block: "center", inline: "nearest" }), id);
  await sleep(500);
  const pre = await fr.evaluate((i) => { const r = document.querySelector(`[data-edit-id="${i}"]`).getBoundingClientRect(); return { l: r.left, w: r.width }; }, id);
  await frameEl.evaluate((el, x) => { const c = el.parentElement; c.scrollLeft = Math.max(0, x - c.clientWidth / 2); }, pre.l + pre.w / 2);
  await sleep(700);
  const d = await fr.evaluate((i) => {
    const el = document.querySelector(`[data-edit-id="${i}"]`);
    const r = el.getBoundingClientRect();
    const cb = window.__veContainerOf(el) || document.documentElement;
    const c = cb.getBoundingClientRect();
    const g = document.querySelector("[data-ve-move]").getBoundingClientRect();
    return { dx: c.left + c.width / 2 - (r.left + r.width / 2), dy: c.top + c.height / 2 - (r.top + r.height / 2), gx: g.left + g.width / 2, gy: g.top + g.height / 2 };
  }, id);
  const bx = await fh.boundingBox();
  // frame px -> screen px: the preview may be scaled down to fit a small window
  const sc = bx.width / (await fr.evaluate(() => innerWidth));
  await dragMouse(bx.x + d.gx * sc, bx.y + d.gy * sc, d.dx * sc, d.dy * sc);
  await sleep(1500);
}

// ---- baselines (template untouched) ----
await scrollIntoFrame(TARGET);
const base = await rectOf(TARGET);
const baseNeighbour = await rectOf(NEIGHBOUR);
await setViewport("mobile");
const baseMobile = await rectOf(MOBILE_TARGET);
await setViewport("desktop");
await scrollIntoFrame(TARGET);

// ---- 1. select ----
await page.getByRole("button", { name: TARGET, exact: true }).click();
await page.getByTestId("ve-selected").waitFor({ timeout: 10000 });
check("select by list highlights the right element", (await page.getByTestId("ve-selected").innerText()).includes(TARGET));

// clicking somewhere that is NOT editable must clear the selection (point found by probing the page)
const fb0 = await frameEl.boundingBox();
// "visible" is answered by the tool's own page: the iframe must be the topmost thing at that point
await frame.evaluate(() => { window.__visible = () => true; });
const visiblePoints = new Set();
for (let y = 40; y < 600; y += 37) for (let x = 40; x < 1400; x += 53) {
  const onTop = await page.evaluate(([px, py]) => document.elementFromPoint(px, py)?.getAttribute("data-testid") === "ve-frame", [fb0.x + x, fb0.y + y]);
  if (onTop) visiblePoints.add(x + "," + y);
}
await frame.evaluate((pts) => { const s = new Set(pts); window.__visible = (px, py) => true; window.__pts = s; }, [...visiblePoints]);
const probe = await frame.evaluate(({ ox, oy, vw, vh }) => {
  for (let y = 40; y < innerHeight - 40; y += 37) {
    for (let x = 40; x < innerWidth - 40; x += 53) {
      // only points that are really visible in the tool's own window
      if (ox + x < 20 || ox + x > vw - 20 || oy + y < 20 || oy + y > vh - 20) continue;
      if (!window.__pts.has(x + "," + y)) continue;
      const t = document.elementFromPoint(x, y);
      if (t && !t.closest("[data-edit-id]") && !t.closest("a,button")) return { x, y };
    }
  }
  return null;
}, { ox: fb0.x, oy: fb0.y, vw: page.viewportSize().width, vh: page.viewportSize().height });
if (!probe) check("found a non-editable point to click", false);
else {
  const fb = await frameEl.boundingBox();
  await page.evaluate(() => { window.__m = []; window.addEventListener("message", (e) => window.__m.push(String(e.data?.type) + ":" + JSON.stringify(e.data?.payload).slice(0, 50))); });
  const hit = await page.evaluate(([x, y]) => { const t = document.elementFromPoint(x, y); return t ? t.tagName + "#" + (t.getAttribute("data-testid") || "") : "none"; }, [fb.x + probe.x, fb.y + probe.y]);
  await page.mouse.click(fb.x + probe.x, fb.y + probe.y);
  await sleep(600);
  const left = await page.getByTestId("ve-selected").count();
  check("clicking a non-editable area clears the selection", left === 0, `probe ${JSON.stringify(probe)} frameBox ${JSON.stringify(fb)} viewportH ${page.viewportSize().height} hit=${hit} msgs=${JSON.stringify(await page.evaluate(() => window.__m))} selectedPanel=${left ? (await page.getByTestId("ve-selected").innerText()).slice(0, 40) : "none"}`);
}

// Baselines for "did not move" / "restored": measured right before the first change. An element anchored
// with top-[%] depends on its container's height, which can still grow while a video loads, so a baseline
// taken at the very start of the run is not reliable.
const baseLate = await rectOf(TARGET);
const baseNeighbourLate = await rectOf(NEIGHBOUR);
if (CENTER) await centreInContainer(TARGET);

// ---- 2. drag right by 100 px ----
await page.getByRole("button", { name: TARGET, exact: true }).click();
await scrollIntoFrame(TARGET);
const before2 = await rectOf(TARGET); // where it stands now (after the optional centring)
await sleep(500);
const gp2 = await gripPage(frameEl, frame);
await dragMouse(gp2.x, gp2.y, DRAG, 0);
const savedMove = await waitSaved("desktop", (o) => o.left);
const afterMove = await rectOf(TARGET);
const moved = afterMove.rx - before2.rx;
// 2 design px at scale 1440/1920 = 1.5 viewport px
check(`drag right ${DRAG}px lands within 2 design px`, Math.abs(moved - DRAG) <= 1.5 && Math.abs(afterMove.ry - before2.ry) <= 1.5, `moved ${moved.toFixed(2)}px, dy ${(afterMove.ry - before2.ry).toFixed(2)}`);
check("saved layout has left/top as % of the parent", !!savedMove && /%$/.test(savedMove.left) && /%$/.test(savedMove.top), JSON.stringify(savedMove));
const nb = await rectOf(NEIGHBOUR);
check("a neighbour element did not move", Math.abs(nb.rx - baseNeighbourLate.rx) < 0.5 && Math.abs(nb.ry - baseNeighbourLate.ry) < 0.5, `dx ${(nb.rx - baseNeighbourLate.rx).toFixed(2)} dy ${(nb.ry - baseNeighbourLate.ry).toFixed(2)}`);

// ---- 3. persistence across reload ----
await frame.evaluate(() => location.reload());
await sleep(2500);
const frame2 = await (await page.getByTestId("ve-frame").elementHandle()).contentFrame();
await frame2.waitForSelector(`[data-edit-id="${TARGET}"]`, { timeout: 120000 });
await frame2.evaluate((i) => document.querySelector(`[data-edit-id="${i}"]`).scrollIntoView({ block: "center" }), TARGET);
await sleep(400);
const reloaded = await frame2.evaluate((i) => {
  const el = document.querySelector(`[data-edit-id="${i}"]`);
  const r = el.getBoundingClientRect();
  const pr = (window.__veContainerOf(el) || document.documentElement).getBoundingClientRect();
  return { rx: r.x - pr.x, ry: r.y - pr.y };
}, TARGET);
check("layout survives a reload", Math.abs(reloaded.rx - afterMove.rx) <= 1 && Math.abs(reloaded.ry - afterMove.ry) <= 1, `x ${reloaded.rx.toFixed(1)} vs ${afterMove.rx.toFixed(1)}`);

// ---- 4. resize keeps aspect ratio ----
const fh = await (await page.getByTestId("ve-frame").elementHandle());
Object.assign(globalThis, {});
const frameNow = await fh.contentFrame();
const rectNow = (id) =>
  frameNow.evaluate((i) => {
    const r = document.querySelector(`[data-edit-id="${i}"]`).getBoundingClientRect();
    return { x: r.x, y: r.y, w: r.width, h: r.height };
  }, id);
await page.getByRole("button", { name: TARGET, exact: true }).click();
await sleep(600);
const r0 = await rectNow(TARGET);
const box = await fh.boundingBox();
await dragMouse(box.x + r0.x + r0.w, box.y + r0.y + r0.h, 40, 0);
const savedSize = await waitSaved("desktop", (o) => o.scaleX);
await sleep(800);
const r1 = await rectNow(TARGET);
check("resize grows the element", r1.w > r0.w + 20, `${r0.w.toFixed(1)} -> ${r1.w.toFixed(1)}`);
check("resize keeps the aspect ratio", Math.abs(r1.w / r1.h - r0.w / r0.h) / (r0.w / r0.h) < 0.02, `${(r0.w / r0.h).toFixed(3)} vs ${(r1.w / r1.h).toFixed(3)}`);
check("saved layout has the scale", !!savedSize?.scaleX && savedSize.scaleX > 1, JSON.stringify(savedSize));

// ---- 4a. frame size: 8 handles, Shift, typed numbers ----
{
  const fhA = await page.getByTestId("ve-frame").elementHandle();
  const fA = await fhA.contentFrame();
  const box = (id) =>
    fA.evaluate((i) => {
      const el = document.querySelector(`[data-edit-id="${i}"]`);
      const r = el.getBoundingClientRect();
      const pr = (window.__veContainerOf(el) || document.documentElement).getBoundingClientRect();
      return { l: r.left, t: r.top, r: r.right, b: r.bottom, w: r.width, h: r.height, pw: pr.width, rl: r.left - pr.left, rt: r.top - pr.top };
    }, id);
  // select, scroll the edited page to it, bring it into the visible part of the tool's scroll area
  await page.getByRole("button", { name: TARGET, exact: true }).click();
  await page.getByTestId("ve-selected").waitFor({ timeout: 10000 });
  await sleep(700);
  if (CENTER) {
    // earlier steps left it scaled and near an edge: back to the template's size, in the middle, so there is room every way
    for (const k of ["ve-scaleX", "ve-scaleY"]) {
      await page.getByTestId(k).fill("100");
      await page.getByTestId(k).blur();
      await sleep(1300);
    }
    await centreInContainer(TARGET);
  }
  await fA.evaluate((i) => document.querySelector(`[data-edit-id="${i}"]`).scrollIntoView({ block: "center", inline: "nearest" }), TARGET);
  await sleep(400);
  const p0 = await box(TARGET);
  await frameEl.evaluate((el, x) => { const c = el.parentElement; c.scrollLeft = Math.max(0, x - c.clientWidth / 2); }, p0.l + p0.w / 2);
  await sleep(700);
  // fresh position of a handle right before each drag (the panel re-renders after every change and may shift the page)
  const grabAt = async (dir) => {
    const bx = await fhA.boundingBox();
    const q = await fA.evaluate((d) => { const h = document.querySelector(`[data-ve-handle="${d}"]`); const r = h.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; }, dir);
    return { x: bx.x + q.x, y: bx.y + q.y };
  };
  // the real picture inside the frame: this is what the operator sees grow or shrink
  const media = (id) =>
    fA.evaluate((i) => {
      const host = document.querySelector(`[data-edit-id="${i}"]`);
      const m = [...host.querySelectorAll("img, video")].find((x) => x.getBoundingClientRect().width > 0);
      if (!m) return null;
      const r = m.getBoundingClientRect();
      return { w: r.width, h: r.height, l: r.left, t: r.top };
    }, id);
  const resizeBy = async (dir, dx, dy, { shift = false, id = TARGET } = {}) => {
    await sleep(500);
    const g = await grabAt(dir);
    if (shift) await page.keyboard.down("Shift");
    await dragMouse(g.x, g.y, dx, dy);
    if (shift) await page.keyboard.up("Shift");
    await sleep(1300);
    return box(id);
  };
  const near = (a, b, tol) => Math.abs(a - b) <= tol;
  let before, after;

  before = await box(TARGET);
  const img0 = await media(TARGET);
  after = await resizeBy("e", 60 * STEP, 0);
  const img1 = await media(TARGET);
  check("the picture inside grows with the frame (east edge)", !!img0 && !!img1 && near(img1.w / img0.w, after.w / before.w, (after.w / before.w) * 0.03), `picture ${img0?.w.toFixed(1)} -> ${img1?.w.toFixed(1)}, frame ${before.w.toFixed(1)} -> ${after.w.toFixed(1)}`);
  check("east edge: width +60, nothing else moves", near(after.w - before.w, 60 * STEP, 1) && near(after.h, before.h, 0.6) && near(after.rl, before.rl, 0.6) && near(after.rt, before.rt, 0.6), `dw ${(after.w - before.w).toFixed(1)} dh ${(after.h - before.h).toFixed(1)} dl ${(after.rl - before.rl).toFixed(1)} dt ${(after.rt - before.rt).toFixed(1)}`);

  before = after;
  after = await resizeBy("w", -40 * STEP, 0);
  check("west edge: grows 40 to the left, right edge stays", near(after.w - before.w, 40 * STEP, 1) && near(after.r, before.r, 1) && near(after.l - before.l, -40 * STEP, 1), `dw ${(after.w - before.w).toFixed(1)} dr ${(after.r - before.r).toFixed(1)}`);

  before = after;
  after = await resizeBy("s", 0, 30 * STEP);
  check("south edge: height +30, width unchanged", near(after.h - before.h, 30 * STEP, 1) && near(after.w, before.w, 0.6) && near(after.t, before.t, 0.6), `dh ${(after.h - before.h).toFixed(1)} dw ${(after.w - before.w).toFixed(1)}`);

  before = after;
  after = await resizeBy("n", 0, -20 * STEP);
  check("north edge: grows 20 upwards, bottom stays", near(after.h - before.h, 20 * STEP, 1) && near(after.b, before.b, 1) && near(after.t - before.t, -20 * STEP, 1), `dh ${(after.h - before.h).toFixed(1)} db ${(after.b - before.b).toFixed(1)}`);

  before = after;
  after = await resizeBy("se", 50 * STEP, 10 * STEP, { shift: true });
  check("corner with Shift resizes freely (ratio changes)", near(after.w - before.w, 50 * STEP, 1) && near(after.h - before.h, 10 * STEP, 1), `dw ${(after.w - before.w).toFixed(1)} dh ${(after.h - before.h).toFixed(1)}`);

  before = after;
  after = await resizeBy("nw", -30 * STEP, -3 * STEP);
  check("corner without Shift keeps the ratio and anchors the opposite corner", near(after.r, before.r, 1) && near(after.b, before.b, 1) && Math.abs(after.w / after.h - before.w / before.h) / (before.w / before.h) < 0.02, `ratio ${(before.w / before.h).toFixed(3)} -> ${(after.w / after.h).toFixed(3)}`);

  // a picture that carries its own fixed size (banner.dot has h-[153px] / aspect ratio classes) must follow too
  {
    const DOT = GROUP;
    await page.getByRole("button", { name: DOT, exact: true }).click();
    await page.getByTestId("ve-selected").waitFor({ timeout: 10000 });
    await sleep(700);
    await fA.evaluate((i) => document.querySelector(`[data-edit-id="${i}"]`).scrollIntoView({ block: "center", inline: "nearest" }), DOT);
    await sleep(400);
    if (CENTER) await centreInContainer(DOT);
    await fA.evaluate((i) => document.querySelector(`[data-edit-id="${i}"]`).scrollIntoView({ block: "center", inline: "nearest" }), DOT);
    await sleep(500);
    const d0b = await box(DOT);
    await frameEl.evaluate((el, x) => { const c = el.parentElement; c.scrollLeft = Math.max(0, x - c.clientWidth / 2); }, d0b.l + d0b.w / 2);
    await sleep(700);
    const m0 = await media(DOT);
    const grown = await resizeBy("se", 50 * STEP, 50 * STEP, { id: DOT });
    const m1 = await media(DOT);
    const factorFrame = grown.w / d0b.w;
    check("a fixed-size picture grows with its frame by the same factor (corner +50)", !!m0 && !!m1 && factorFrame > 1.1 && near(m1.w / m0.w, factorFrame, factorFrame * 0.03) && near(m1.h / m0.h, factorFrame, factorFrame * 0.03), `picture ${m0?.w.toFixed(0)}x${m0?.h.toFixed(0)} -> ${m1?.w.toFixed(0)}x${m1?.h.toFixed(0)}, frame x${factorFrame.toFixed(2)}`);
    const shrunk = await resizeBy("se", -60 * STEP, -60 * STEP, { id: DOT });
    const m2 = await media(DOT);
    check("…and shrinks with it", !!m2 && m2.w < m1.w * 0.9 && m2.h < m1.h * 0.9, `picture ${m1?.w.toFixed(0)} -> ${m2?.w.toFixed(0)}`);
    // leave no trace of this side test, then back to the element under test
    await page.getByTestId("ve-reset-one").click();
    await sleep(1500);
    await page.getByRole("button", { name: TARGET, exact: true }).click();
    await page.getByTestId("ve-selected").waitFor({ timeout: 10000 });
    await sleep(700);
  }

  // typed numbers: scale in % (100 = the template's own size)
  const curScale = parseFloat(await page.getByTestId("ve-scaleX").inputValue()) / 100;
  const w0 = (await box(TARGET)).w;
  await page.getByTestId("ve-scaleX").fill("150");
  await page.getByTestId("ve-scaleX").blur();
  await sleep(1800);
  const typed = await box(TARGET);
  check("typing a scale in the panel sets that size relative to the template", near(typed.w, (w0 * 1.5) / curScale, 1.5), `${typed.w.toFixed(1)}px vs ${((w0 * 1.5) / curScale).toFixed(1)}px (was ${w0.toFixed(1)} at ${(curScale * 100).toFixed(0)}%)`);
  await page.getByTestId("ve-scaleY").fill("900");
  await page.getByTestId("ve-scaleY").blur();
  await sleep(1500);
  const msg = page.getByTestId("ve-message");
  const stillSame = await box(TARGET);
  check("typing an out-of-range scale is refused and nothing changes", (await msg.count()) > 0 && near(stillSame.h, typed.h, 0.6), (await msg.count()) ? (await msg.innerText()).slice(0, 70) : "no message");
}

// ---- 4b. operator limits ----
{
  const fh2 = await page.getByTestId("ve-frame").elementHandle();
  const f2 = await fh2.contentFrame();
  const info = (id) =>
    f2.evaluate((i) => {
      const el = document.querySelector(`[data-edit-id="${i}"]`);
      const r = el.getBoundingClientRect();
      const p = window.__veContainerOf(el) || document.documentElement;
      const pr = p.getBoundingClientRect();
      return { l: r.left, t: r.top, r: r.right, b: r.bottom, w: r.width, h: r.height, pl: pr.left, pt: pr.top, pr: pr.right, pb: pr.bottom };
    }, id);
  // select first (it re-renders the panel and shifts the page), then scroll/measure
  const centreOnPage = async (id) => {
    await page.getByRole("button", { name: id, exact: true }).click();
    await page.getByTestId("ve-selected").waitFor({ timeout: 10000 });
    await sleep(700);
    // the template scrolls inside #scaleWrapper, not the window: scrollIntoView finds the right scroller
    await f2.evaluate((i) => document.querySelector(`[data-edit-id="${i}"]`).scrollIntoView({ block: "center", inline: "nearest" }), id);
    await sleep(500);
    const pre = await info(id);
    await frameEl.evaluate((el, x) => { const c = el.parentElement; c.scrollLeft = Math.max(0, x - c.clientWidth / 2); }, pre.l + pre.w / 2);
    await sleep(700);
    const a = await info(id);
    const bx = await fh2.boundingBox();
    const grip = await f2.evaluate(() => { const g = document.querySelector("[data-ve-move]"); const q = g.getBoundingClientRect(); return { x: q.left + q.width / 2, y: q.top + q.height / 2 }; });
    // the resize handle is centred on the bottom-right corner: aim slightly inside so the point is inside the iframe
    return { a, bx, cx: bx.x + a.l + a.w / 2, cy: bx.y + a.t + a.h / 2, hx: bx.x + a.r - 4, hy: bx.y + a.b - 4, gx: bx.x + grip.x, gy: bx.y + grip.y };
  };
  const EPS = 0.75;
  let c, a;

  // 1. far down-right, pointer ends outside the iframe: stops exactly at the corner, and the drag still finishes
  const leftBefore = parseFloat((await savedOverride("desktop"))?.left ?? "0");
  c = await centreOnPage(TARGET);
  await dragMouse(c.gx, c.gy, 3000, 3000);
  await sleep(1500);
  a = await info(TARGET);
  // the pointer can only reach the iframe's own area: if the container extends beyond it, "not past the container" is all we can assert
  const view = await f2.evaluate(() => ({ w: innerWidth, h: innerHeight }));
  const reachable = a.pr <= view.w - 2 && a.pb <= view.h - 2;
  check("a drag far down/right stops at the container's bottom-right corner (or at the edge of what the pointer can reach)", reachable ? Math.abs(a.r - a.pr) <= 1 && Math.abs(a.b - a.pb) <= 1 : a.r <= a.pr + 0.75 && a.b <= a.pb + 0.75 && a.r > c.a.r, `right ${a.r.toFixed(1)}/${a.pr.toFixed(1)} bottom ${a.b.toFixed(1)}/${a.pb.toFixed(1)}`);
  const sv = await savedOverride("desktop");
  check("the drag finished and was saved even though the pointer left the iframe", !!sv && parseFloat(sv.left) > leftBefore + 1, `saved left ${leftBefore.toFixed(1)}% -> ${sv?.left}`);

  // 2. far up-left, grabbed by the grip (a full-width strip covers the element at that corner)
  c = await centreOnPage(TARGET);
  await dragMouse(c.gx, c.gy, -3000, -3000);
  await sleep(1500);
  a = await info(TARGET);
  check("a drag far up/left stops exactly at the container's top edge and never leaves on the left", Math.abs(a.t - a.pt) <= 1 && a.l >= a.pl - EPS, `top ${a.t.toFixed(1)}/${a.pt.toFixed(1)} left ${a.l.toFixed(1)}/${a.pl.toFixed(1)}`);

  // 3. resize far smaller: not below 24 design px (scale 0.75 at 1440 -> 18px), ratio kept
  c = await centreOnPage(TARGET);
  const ratio = c.a.w / c.a.h;
  await dragMouse(c.hx, c.hy, -3000, 0);
  await sleep(1500);
  a = await info(TARGET);
  check("resizing far smaller stops at the minimum size", Math.min(a.w, a.h) >= 24 * 0.75 - 0.5 && Math.min(a.w, a.h) <= 24 * 0.75 + 1.5, `min side ${Math.min(a.w, a.h).toFixed(1)}px`);
  check("the minimum-size result kept the aspect ratio", Math.abs(a.w / a.h - ratio) / ratio < 0.03);

  // 4. moving onto another editable element is allowed but warned about: nearest one it does not overlap yet
  c = await centreOnPage(TARGET);
  const nb2 = await f2.evaluate((id) => {
    const me = document.querySelector(`[data-edit-id="${id}"]`);
    const a = me.getBoundingClientRect();
    let best = null;
    for (const o of document.querySelectorAll("[data-edit-id]")) {
      const oid = o.getAttribute("data-edit-id");
      if (oid === id || o.contains(me) || me.contains(o)) continue;
      const b = o.getBoundingClientRect();
      if (b.width < 20 || b.height < 20 || getComputedStyle(o).display === "none") continue;
      if (Math.min(a.right, b.right) > Math.max(a.left, b.left) && Math.min(a.bottom, b.bottom) > Math.max(a.top, b.top)) continue;
      const dx = b.left + b.width / 2 - (a.left + a.width / 2);
      const dy = b.top + b.height / 2 - (a.top + a.height / 2);
      const d = Math.hypot(dx, dy);
      if (!best || d < best.d) best = { id: oid, dx, dy, d };
    }
    return best;
  }, TARGET);
  if (!nb2) check("found a neighbour to overlap", false);
  else {
    await page.evaluate(() => { document.querySelector('[data-testid="ve-warning"]')?.remove(); });
    await dragMouse(c.gx, c.gy, nb2.dx, nb2.dy);
    await sleep(1500);
    const warn = page.getByTestId("ve-warning");
    const text = (await warn.count()) ? await warn.innerText() : "";
    // the element cannot leave its container, so it may not reach the neighbour: warn only when they really overlap now
    const overlaps = await f2.evaluate(([me, other]) => {
      const a = document.querySelector(`[data-edit-id="${me}"]`).getBoundingClientRect();
      const b = document.querySelector(`[data-edit-id="${other}"]`).getBoundingClientRect();
      const w = Math.min(a.right, b.right) - Math.max(a.left, b.left);
      const h = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
      return w > 0 && h > 0 && (w * h) / Math.min(a.width * a.height, b.width * b.height) > 0.25;
    }, [TARGET, nb2.id]);
    check("moving onto a neighbour shows a warning (and does not block)", overlaps ? text.includes(nb2.id) : true, overlaps ? `neighbour ${nb2.id}; panel: ${text.slice(0, 90) || "none"}` : `nearest neighbour ${nb2.id} was out of reach (the container limit held), nothing to warn about`);
  }

  // 5. resize far bigger (from small): grows a lot, stops exactly at the container edge, never past it
  await centreInContainer(TARGET); // earlier steps pushed it against an edge: give it room
  c = await centreOnPage(TARGET);
  const wBefore = c.a.w;
  await dragMouse(c.hx, c.hy, 3000, 0);
  await sleep(1500);
  a = await info(TARGET);
  check("resizing far bigger grows a lot and stops at the container edge, not past it", a.w > wBefore * 1.5 && a.r <= a.pr + EPS && a.b <= a.pb + EPS && Math.min(a.pr - a.r, a.pb - a.b) <= 1, `${wBefore.toFixed(0)} -> ${a.w.toFixed(0)}px, right gap ${(a.pr - a.r).toFixed(1)}, bottom gap ${(a.pb - a.b).toFixed(1)}`);

  // 6. the server enforces the same limits
  const bad = async (patch) =>
    (await fetch(`${TOOL}/api/layout?gameId=${GAME}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ gameId: GAME, editId: TARGET, breakpoint: "desktop", patch }) })).status;
  check("API refuses z-index 5000, left 400% and width 0", (await bad({ zIndex: 5000 })) === 400 && (await bad({ left: "400%" })) === 400 && (await bad({ width: "0%" })) === 400);
}

// ---- 5. z-index and hide from the panel ----
await page.getByTestId("ve-zindex").fill("7");
await page.getByTestId("ve-zindex").blur();
await waitSaved("desktop", (o) => o.zIndex === 7);
await sleep(800);
const z = await frameNow.evaluate((i) => getComputedStyle(document.querySelector(`[data-edit-id="${i}"]`)).zIndex, TARGET);
check("z-index from the panel is applied", z === "7", `computed ${z}`);

await page.getByTestId("ve-hidden").click();
await waitSaved("desktop", (o) => o.hidden === true);
await sleep(800);
const disp = await frameNow.evaluate((i) => getComputedStyle(document.querySelector(`[data-edit-id="${i}"]`)).display, TARGET);
check("hide from the panel is applied on desktop", disp === "none", `display ${disp}`);

// ---- 6. responsive: desktop override must not leak into mobile ----
if (SAME) {
await setViewport("mobile");
const frameM = await (await page.getByTestId("ve-frame").elementHandle()).contentFrame();
await frameM.waitForSelector(`[data-edit-id="${TARGET}"]`, { timeout: 60000 });
await sleep(800);
const mobile = await frameM.evaluate((i) => {
  const el = document.querySelector(`[data-edit-id="${i}"]`);
  const r = el.getBoundingClientRect();
  const cs = getComputedStyle(el);
  return { x: r.x, y: r.y, w: r.width, display: cs.display, z: cs.zIndex };
}, TARGET);
check("desktop override does not change the mobile layout", mobile.display !== "none" && Math.abs(mobile.x - baseMobile.x) < 1 && Math.abs(mobile.w - baseMobile.w) < 1, `x ${mobile.x.toFixed(1)} vs ${baseMobile.x.toFixed(1)}, display ${mobile.display}`);
await setViewport("desktop");
}

// ---- 6b. edit at mobile 375: exact too, and it must not leak into desktop ----
await setViewport("mobile");
{
  const fhM = await page.getByTestId("ve-frame").elementHandle();
  const fM = await fhM.contentFrame();
  await fM.waitForSelector(`[data-edit-id="${MOBILE_TARGET}"]`, { timeout: 60000 });
  await fM.evaluate((i) => document.querySelector(`[data-edit-id="${i}"]`).scrollIntoView({ block: "center" }), MOBILE_TARGET);
  await sleep(500);
  await page.getByRole("button", { name: MOBILE_TARGET, exact: true }).click();
  // the panel re-renders when SELECTED arrives and shifts the page: measure only after it settled
  await page.getByTestId("ve-selected").waitFor({ timeout: 10000 });
  await sleep(600);
  const m0 = await fM.evaluate((i) => { const r = document.querySelector(`[data-edit-id="${i}"]`).getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height }; }, MOBILE_TARGET);
  await sleep(400);
  const gM = await gripPage(fhM, fM);
  await dragMouse(gM.x, gM.y, -30, 0);
  const savedM = await waitSaved("mobile", (o) => o.left, MOBILE_TARGET);
  await sleep(600);
  const m1 = await fM.evaluate((i) => { const r = document.querySelector(`[data-edit-id="${i}"]`).getBoundingClientRect(); return { x: r.x, y: r.y }; }, MOBILE_TARGET);
  // 2 design px at scale 375/768 is ~1 viewport px
  check("drag at mobile 375 lands within 2 design px", Math.abs(m1.x - m0.x + 30) <= 1 && Math.abs(m1.y - m0.y) <= 1, `moved ${(m1.x - m0.x).toFixed(2)}px`);
  check("mobile edit is saved under the mobile breakpoint", !!savedM && !(await savedOverride("tablet", MOBILE_TARGET)), JSON.stringify(savedM));
}
await setViewport("desktop");
if (SAME) {
  const fhD = await page.getByTestId("ve-frame").elementHandle();
  const fD = await fhD.contentFrame();
  await fD.waitForSelector(`[data-edit-id="${MOBILE_TARGET}"]`, { timeout: 60000, state: "attached" }); // hidden on desktop on purpose
  await sleep(600);
  const dd = await fD.evaluate((i) => getComputedStyle(document.querySelector(`[data-edit-id="${i}"]`)).display, MOBILE_TARGET);
  check("mobile override does not hide/alter desktop (desktop still has its own hide)", dd === "none");
}

// ---- 6c. only tagged elements can be saved ----
{
  const r = await fetch(`${TOOL}/api/layout?gameId=${GAME}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ gameId: GAME, editId: "not.in-manifest", breakpoint: "desktop", patch: { left: "1%" } }) });
  check("API refuses an element that is not in the manifest", r.status === 400);
  const r2 = await fetch(`${TOOL}/api/layout?gameId=${GAME}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ gameId: GAME, editId: TARGET, breakpoint: "desktop", patch: { left: "1px; } body { display:none" } }) });
  check("API refuses a value that could inject CSS", r2.status === 400);
}

// ---- 6d. a position:fixed element (floating buttons) can be moved, kept inside its container, and reset ----
if (FIXED) {
  await setViewport("desktop");
  const fhF = await page.getByTestId("ve-frame").elementHandle();
  const fF = await fhF.contentFrame();
  const rectF = () => fF.evaluate((i) => { const r = document.querySelector(`[data-edit-id="${i}"]`).getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height }; }, FIXED);
  const gripF = async () => {
    const bx = await fhF.boundingBox();
    const g = await fF.evaluate(() => { const q = document.querySelector("[data-ve-move]").getBoundingClientRect(); return { x: q.left + q.width / 2, y: q.top + q.height / 2 }; });
    return { x: bx.x + g.x, y: bx.y + g.y };
  };
  await page.getByRole("button", { name: FIXED, exact: true }).click();
  await page.getByTestId("ve-selected").waitFor({ timeout: 10000 });
  await sleep(900);
  const f0 = await rectF();
  let g = await gripF();
  const dirX = f0.x > 200 ? -80 : 80; // away from the nearest window edge
  await dragMouse(g.x, g.y, dirX, 25);
  await sleep(1600);
  const f1 = await rectF();
  check("a fixed element moves exactly with the drag", Math.abs(f1.x - f0.x - dirX) <= 1.5 && Math.abs(f1.y - f0.y - 25) <= 1.5, `moved ${(f1.x - f0.x).toFixed(1)}, ${(f1.y - f0.y).toFixed(1)}`);
  const sf = await savedOverride("desktop", FIXED);
  check("a fixed element's position is saved", !!sf?.left && !!sf?.top, JSON.stringify(sf));
  await sleep(500);
  g = await gripF();
  await dragMouse(g.x, g.y, -5000, 0);
  await sleep(1600);
  const f2 = await rectF();
  const bxF = await fhF.boundingBox();
  check("a fixed element cannot be dragged out of the window on the left", f2.x >= -1, `left edge ${f2.x.toFixed(1)} (was ${f1.x.toFixed(1)})`);
  await page.getByTestId("ve-reset-one").click();
  await sleep(2000);
  const f3 = await rectF();
  check("reset puts the fixed element back", Math.abs(f3.x - f0.x) <= 1 && Math.abs(f3.y - f0.y) <= 1 && Math.abs(f3.w - f0.w) <= 1, `x ${f3.x.toFixed(1)} vs ${f0.x.toFixed(1)}`);
}

// ---- 6e. a picture in the page flow: zoom about its centre, cannot be moved ----
if (FLOW) {
  await setViewport("desktop");
  const fhW = await page.getByTestId("ve-frame").elementHandle();
  const fW = await fhW.contentFrame();
  const nearF = (a, b, t) => Math.abs(a - b) <= t;
  const rectW = () => fW.evaluate((id) => { const r = document.querySelector(`[data-edit-id="${id}"]`).getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height, cx: r.x + r.width / 2, cy: r.y + r.height / 2 }; }, FLOW);
  const handleW = async (dir) => {
    const bx = await fhW.boundingBox();
    const q = await fW.evaluate((d) => { const h = document.querySelector(`[data-ve-handle="${d}"]`); if (!h || getComputedStyle(h).display === "none") return null; const r = h.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; }, dir);
    return q && { x: bx.x + q.x - 3, y: bx.y + q.y - 3 };
  };
  await page.getByRole("button", { name: FLOW, exact: true }).click();
  await page.getByTestId("ve-selected").waitFor({ timeout: 10000 });
  await sleep(700);
  await fW.evaluate((id) => document.querySelector(`[data-edit-id="${id}"]`).scrollIntoView({ block: "center", inline: "nearest" }), FLOW);
  await sleep(500);
  const pre = await rectW();
  await frameEl.evaluate((el, x) => { const c = el.parentElement; c.scrollLeft = Math.max(0, x - c.clientWidth / 2); }, pre.cx);
  await sleep(800);

  const hasGrip = await fW.evaluate(() => getComputedStyle(document.querySelector("[data-ve-move]")).display !== "none");
  check("an in-flow picture: the panel says it can only be zoomed, no stacking field, no move grip", (await page.getByTestId("ve-flow-note").count()) === 1 && (await page.getByTestId("ve-zindex").count()) === 0 && !hasGrip);

  // dragging it must not move it
  const w0 = await rectW();
  const bx0 = await fhW.boundingBox();
  await dragMouse(bx0.x + w0.cx, bx0.y + w0.cy, 40, 20);
  await sleep(1300);
  const w1 = await rectW();
  check("pressing and dragging an in-flow picture does not move it", nearF(w1.x, w0.x, 0.5) && nearF(w1.y, w0.y, 0.5) && !(await savedOverride("desktop", FLOW)));

  // make sure it is the selected element again (the press may have hit a picture drawn over it)
  await page.getByRole("button", { name: FLOW, exact: true }).click();
  await page.getByTestId("ve-selected").waitFor({ timeout: 10000 });
  await sleep(800);

  // corner: zoom about the centre, ratio kept. It fills its container, so it can only shrink first
  const before = await rectW();
  const se = await handleW("se");
  await dragMouse(se.x, se.y, -16, -16);
  await sleep(1500);
  const after = await rectW();
  check("a corner zooms an in-flow picture about its centre and keeps the ratio", after.w < before.w - 4 && nearF(after.cx, before.cx, 1.5) && nearF(after.cy, before.cy, 1.5) && Math.abs(after.w / after.h - before.w / before.h) / (before.w / before.h) < 0.02, `w ${before.w.toFixed(1)} -> ${after.w.toFixed(1)}, centre moved ${(after.cx - before.cx).toFixed(2)},${(after.cy - before.cy).toFixed(2)}`);
  const saved = await savedOverride("desktop", FLOW);
  check("only the scale is saved (no left/top for a picture in the flow)", !!saved && saved.scaleX < 1 && Object.keys(saved).every((k) => k === "scaleX" || k === "scaleY"), JSON.stringify(saved));

  // an edge stretches one axis
  const e = await handleW("e");
  if (e) {
    const b2 = await rectW();
    await dragMouse(e.x, e.y, -10, 0);
    await sleep(1400);
    const a2 = await rectW();
    check("an edge stretches one axis only, about the centre", a2.w < b2.w - 4 && nearF(a2.h, b2.h, 0.6) && nearF(a2.cx, b2.cx, 1.5), `w ${b2.w.toFixed(1)} -> ${a2.w.toFixed(1)}, h ${b2.h.toFixed(1)} -> ${a2.h.toFixed(1)}`);
  }

  // growing back is allowed, but never past the area it sits in
  const b3 = await rectW();
  const se2 = await handleW("se");
  await dragMouse(se2.x, se2.y, 400, 400);
  await sleep(1600);
  const a3 = await rectW();
  check("it can grow back, and stops at the edge of the area it sits in", a3.w > b3.w + 4 && a3.w <= w0.w + 1.5 && a3.h <= w0.h + 1.5, `w ${b3.w.toFixed(1)} -> ${a3.w.toFixed(1)} (original ${w0.w.toFixed(1)})`);

  // the API refuses what a picture in the flow cannot take
  const put = (patch) => fetch(`${TOOL}/api/layout?gameId=${GAME}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ gameId: GAME, editId: FLOW, breakpoint: "desktop", patch }) }).then((r) => r.status);
  check("the API refuses a position or stacking change for an in-flow picture", (await put({ left: "5%" })) === 400 && (await put({ zIndex: 3 })) === 400 && (await put({ top: "5%" })) === 400);

  // reset
  await page.getByTestId("ve-reset-one").click();
  await sleep(2200);
  const w3 = await rectW();
  check("reset puts the in-flow picture back at its original size and place", nearF(w3.x, w0.x, 1) && nearF(w3.y, w0.y, 1) && nearF(w3.w, w0.w, 1) && nearF(w3.h, w0.h, 1), `size ${w3.w.toFixed(1)}x${w3.h.toFixed(1)} vs ${w0.w.toFixed(1)}x${w0.h.toFixed(1)}`);
}

// ---- 6f. pages: open any page, go to an element that lives on another page, API pictures, hidden elements ----
if (ROUTE_ELEMENT) {
  await setViewport("desktop");
  const opts = await page.getByTestId("ve-route").locator("option").allTextContents();
  check("the page picker lists the site's pages, parameterised ones marked", opts.length >= 3 && opts.some((o) => /Trang chủ/.test(o)) && opts.some((o) => /cần tham số/.test(o)), opts.slice(0, 4).join(" | "));

  await page.getByTestId("ve-route").selectOption("/");
  await sleep(3000);
  const pathOf = async () => new URL((await (await frameEl.contentFrame()).url())).pathname;
  check("the home page is open", (await pathOf()) === "/", await pathOf());

  // choosing an element that lives on another page opens that page and selects it there
  await page.getByRole("button", { name: ROUTE_ELEMENT, exact: true }).click();
  await page.getByTestId("ve-selected").filter({ hasText: ROUTE_ELEMENT }).waitFor({ timeout: 90000 });
  check("an element on another page: its page is opened and the element is selected there", (await pathOf()) === ROUTE_PATH, await pathOf());

  if (ROUTE_DATA) {
    await sleep(800);
    check("a picture from API data: layout editable, content locked (no replace form)", (await page.getByTestId("ve-data-note").count()) === 1 && (await page.getByTestId("ve-asset-replace").count()) === 0 && (await page.getByTestId("ve-media-data").count()) >= 1);
  }

  // open another page from the picker
  await page.getByTestId("ve-route").selectOption("/");
  await sleep(3000);
  check("the picker opens a page", (await pathOf()) === "/", await pathOf());
}

if (!SAME) {
  // an element the template hides at this screen size: say so, and offer the sizes where it shows
  await setViewport("desktop");
  await page.getByRole("button", { name: MOBILE_TARGET, exact: true }).click();
  await page.getByTestId("ve-selected").filter({ hasText: MOBILE_TARGET }).waitFor({ timeout: 30000 });
  await page.getByTestId("ve-hidden-note").waitFor({ timeout: 15000 });
  check("an element hidden at this screen size is explained, with the sizes where it shows", (await page.getByTestId("ve-hidden-note").innerText()).includes("Mobile"));
  await page.getByTestId("ve-hidden-note").getByRole("button", { name: /Mobile/ }).click();
  await page.getByTestId("ve-hidden-note").waitFor({ state: "detached", timeout: 20000 });
  check("switching to that size shows it (the note goes away)", (await page.getByTestId("ve-hidden-note").count()) === 0);
  await setViewport("desktop");
}

// ---- 7. reset restores the original ----
if (!SAME) {
  await page.getByRole("button", { name: MOBILE_TARGET, exact: true }).click();
  await page.getByTestId("ve-selected").waitFor({ timeout: 10000 });
  await sleep(500);
  await page.getByTestId("ve-reset-one").click();
  await sleep(1200);
}
await page.getByRole("button", { name: TARGET, exact: true }).click();
await page.getByTestId("ve-selected").waitFor({ timeout: 10000 });
await sleep(500);
await page.getByTestId("ve-reset-one").click();
await sleep(2000);
const frameR = await (await page.getByTestId("ve-frame").elementHandle()).contentFrame();
await frameR.waitForSelector(`[data-edit-id="${TARGET}"]`, { timeout: 60000 });
await frameR.evaluate((i) => document.querySelector(`[data-edit-id="${i}"]`).scrollIntoView({ block: "center", inline: "center" }), TARGET);
await sleep(500);
const restored = await frameR.evaluate((i) => {
  const el = document.querySelector(`[data-edit-id="${i}"]`);
  const r = el.getBoundingClientRect();
  const pr = (window.__veContainerOf(el) || document.documentElement).getBoundingClientRect();
  return { rx: r.x - pr.x, ry: r.y - pr.y, w: r.width, h: r.height, display: getComputedStyle(el).display, scale: getComputedStyle(el).scale };
}, TARGET);
check("reset restores the original position and size", Math.abs(restored.rx - baseLate.rx) < 1 && Math.abs(restored.ry - baseLate.ry) < 1 && Math.abs(restored.w - baseLate.w) < 1 && Math.abs(restored.h - baseLate.h) < 1 && restored.display !== "none", `x ${restored.rx.toFixed(1)} vs ${baseLate.rx.toFixed(1)}, y ${restored.ry.toFixed(1)} vs ${baseLate.ry.toFixed(1)}, size ${restored.w.toFixed(1)}x${restored.h.toFixed(1)} vs ${baseLate.w.toFixed(1)}x${baseLate.h.toFixed(1)}, scale ${restored.scale}`);
check("layout is empty after reset", Object.keys((await api("GET")).layout.elements).length === 0);

// ---- 7b. replace a picture straight from the preview (file, link, refusal, restore) ----
if (ASSET) {
  const fhP = await page.getByTestId("ve-frame").elementHandle();
  const fP = await fhP.contentFrame();
  await page.getByRole("button", { name: ASSET, exact: true }).click();
  await page.getByTestId("ve-media-item").first().waitFor({ timeout: 15000 });
  await sleep(600);
  check("the selected element lists its picture with a replace form", (await page.getByTestId("ve-asset-replace").count()) === 1 && (await page.getByTestId("ve-media-unknown").count()) === 0 && (await page.getByTestId("ve-media-remote").count()) === 0);

  const thumbSrc = () => page.getByTestId("ve-media-thumb").first().getAttribute("src");
  // what is really painted: the middle pixel of the first picture inside the element, read back from the page
  const pixel = () =>
    fP.evaluate((id) => {
      const img = [...document.querySelector(`[data-edit-id="${id}"]`).querySelectorAll("img")].find((x) => x.getBoundingClientRect().width > 0);
      const c = document.createElement("canvas");
      c.width = img.naturalWidth;
      c.height = img.naturalHeight;
      const ctx = c.getContext("2d");
      ctx.drawImage(img, 0, 0);
      const d = ctx.getImageData(Math.floor(c.width / 2), Math.floor(c.height / 2), 1, 1).data;
      return { r: d[0], g: d[1], b: d[2], a: d[3], w: img.naturalWidth, h: img.naturalHeight, src: img.currentSrc };
    }, ASSET);
  const sha = (b) => createHash("sha256").update(b).digest("hex");

  const src0 = await thumbSrc();
  const pathname = new URL(src0).pathname;
  const origOnDisk = readFileSync(join(TEMPLATE_DIR, "public", pathname));
  const meta0 = await sharp(origOnDisk).metadata();
  const px0 = await pixel();

  // 1. upload a file: solid magenta, a different shape than the original
  const magenta = await sharp({ create: { width: 300, height: 120, channels: 4, background: { r: 255, g: 0, b: 255, alpha: 1 } } }).png().toBuffer();
  const magentaPath = join(tmpdir(), "ve-magenta.png");
  writeFileSync(magentaPath, magenta);
  await page.getByTestId("ve-asset-file").setInputFiles(magentaPath);
  await page.getByTestId("ve-asset-replace").click();
  await page.getByTestId("ve-asset-ok").waitFor({ timeout: 30000 });
  await sleep(1800);
  const px1 = await pixel();
  check("an uploaded file replaces the picture on screen", px1.r > 230 && px1.g < 40 && px1.b > 230, `centre pixel rgb(${px1.r},${px1.g},${px1.b}) was rgb(${px0.r},${px0.g},${px0.b})`);
  check("the new picture was fitted to the original's exact size", px1.w === meta0.width && px1.h === meta0.height, `${px1.w}x${px1.h} vs original ${meta0.width}x${meta0.height}`);
  check("the page really fetched it again (cache-busted)", /[?&]ve=\d+/.test(px1.src), px1.src.slice(-40));
  const list1 = (await (await fetch(`${TOOL}/api/asset?gameId=${GAME}`)).json()).replaced;
  check("the replacement is kept for the next Generate (all size variants written)", list1.length >= 1 && list1.some((p) => ("/" + p.replace(/^public\//, "")) === pathname), `${list1.length} file(s): ${list1.slice(0, 3).join(", ")}`);
  const served = Buffer.from(await (await fetch(new URL(pathname, new URL(src0).origin).href + "?x=" + Date.now())).arrayBuffer());
  check("the file the preview serves is no longer the original", sha(served) !== sha(origOnDisk));

  // 2. a link
  await page.getByTestId("ve-asset-url").fill(`${TOOL}/file.svg`);
  await page.getByTestId("ve-asset-replace").click();
  await page.getByTestId("ve-asset-ok").waitFor({ timeout: 30000 });
  await sleep(1500);
  const px2 = await pixel();
  check("a pasted link replaces it too", !(px2.r > 230 && px2.g < 40 && px2.b > 230) && px2.w === meta0.width && px2.h === meta0.height, `centre rgb(${px2.r},${px2.g},${px2.b}), ${px2.w}x${px2.h}`);

  // 3. something that is not a picture is refused and nothing changes
  const txtPath = join(tmpdir(), "ve-not-an-image.txt");
  writeFileSync(txtPath, "this is not an image");
  await page.getByTestId("ve-asset-file").setInputFiles(txtPath);
  await page.getByTestId("ve-asset-replace").click();
  await page.getByTestId("ve-asset-error").waitFor({ timeout: 15000 });
  const errText = await page.getByTestId("ve-asset-error").innerText();
  const px3 = await pixel();
  check("a file that is not a picture is refused, the picture stays", /không phải ảnh/.test(errText) && px3.r === px2.r && px3.g === px2.g && px3.b === px2.b, errText.slice(0, 60));

  // 4. the API refuses a path that is not an asset slot's file
  const evil = new FormData();
  evil.append("gameId", GAME);
  evil.append("targetPaths", JSON.stringify(["package.json"]));
  evil.append("url", `${TOOL}/file.svg`);
  const evilRes = await fetch(`${TOOL}/api/asset`, { method: "POST", body: evil });
  check("the asset API refuses to write a file that is not an asset slot's", evilRes.status === 400);

  // 5. restore the template's own picture
  await page.getByTestId("ve-asset-restore").click();
  // wait for THIS note (an earlier "ok" note may still be on screen while the request runs)
  await page.getByTestId("ve-asset-ok").filter({ hasText: "khôi phục" }).waitFor({ timeout: 30000 });
  await sleep(2500);
  const px4 = await pixel();
  const after = Buffer.from(await (await fetch(new URL(pathname, new URL(src0).origin).href + "?y=" + Date.now())).arrayBuffer());
  check("restore puts the template's original picture back, byte for byte", sha(after) === sha(origOnDisk) && Math.abs(px4.r - px0.r) <= 2 && Math.abs(px4.g - px0.g) <= 2 && Math.abs(px4.b - px0.b) <= 2, `served ${sha(after).slice(0, 8)} vs original ${sha(origOnDisk).slice(0, 8)}; centre rgb(${px4.r},${px4.g},${px4.b}) vs rgb(${px0.r},${px0.g},${px0.b}), src ${px4.src.slice(-30)}`);
  const list2 = (await (await fetch(`${TOOL}/api/asset?gameId=${GAME}`)).json()).replaced;
  check("nothing stays replaced after the restore", !list2.some((p) => ("/" + p.replace(/^public\//, "")) === pathname), `${list2.length} left`);
}

// ---- 8. full screen: the editor covers the window; in a small window the preview is scaled to fit and drag stays exact ----
{
  const full = await page.getByTestId("ve-fullscreen").boundingBox();
  const vp = page.viewportSize();
  check("the editor covers the whole window", Math.abs(full.width - vp.width) <= 1 && Math.abs(full.height - vp.height) <= 1, `${full.width}x${full.height} in ${vp.width}x${vp.height}`);
  const fb = await (await page.getByTestId("ve-frame").elementHandle()).boundingBox();
  check("the preview uses most of the window height (no inner scroll box)", fb.height >= vp.height * 0.8, `iframe ${Math.round(fb.height)}px of ${vp.height}px`);

  await page.setViewportSize({ width: 1280, height: 800 });
  await sleep(1500);
  if (CENTER) await centreInContainer(TARGET); // room to move inside a small container
  const fh = await page.getByTestId("ve-frame").elementHandle();
  const fr = await fh.contentFrame();
  const bx0 = await fh.boundingBox();
  const sc = bx0.width / 1440;
  check("small window: the preview is scaled to fit and still fills the window height", sc < 0.8 && sc > 0.4 && bx0.height >= 800 * 0.8, `scale ${sc.toFixed(2)}, iframe height ${Math.round(bx0.height)}px`);
  await page.getByRole("button", { name: TARGET, exact: true }).click();
  await page.getByTestId("ve-selected").waitFor({ timeout: 10000 });
  await sleep(700);
  await fr.evaluate((i) => document.querySelector(`[data-edit-id="${i}"]`).scrollIntoView({ block: "center" }), TARGET);
  await sleep(600);
  const rectScaled = () => fr.evaluate((i) => { const r = document.querySelector(`[data-edit-id="${i}"]`).getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height }; }, TARGET);
  const r0 = await rectScaled();
  await sleep(400);
  const gS = await gripPage(fh, fr, sc);
  await dragMouse(gS.x, gS.y, SCALED_DRAG, 0); // screen px
  await sleep(1500);
  const r1 = await rectScaled();
  check(`scaled preview: dragging ${SCALED_DRAG} screen px moves the element by the matching page distance`, Math.abs(r1.x - r0.x - SCALED_DRAG / sc) <= 1.5 && Math.abs(r1.y - r0.y) <= 1.5, `moved ${(r1.x - r0.x).toFixed(1)} page px, expected ${(SCALED_DRAG / sc).toFixed(1)}`);

  // close and reopen: the wizard is usable again and the editor keeps its state
  await page.getByTestId("ve-close").click();
  await sleep(400);
  check("closing the editor shows the wizard again, with a button to reopen", (await page.getByTestId("ve-open").count()) === 1 && !(await page.getByTestId("ve-fullscreen").isVisible()));
  await page.getByTestId("ve-open").click();
  await sleep(500);
  check("reopening shows the editor again", await page.getByTestId("ve-fullscreen").isVisible());
  await api("DELETE");
}

await browser.close();
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} passed`);
process.exit(failed.length ? 1 : 0);
