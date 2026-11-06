// Checks the selectors the inspector builds for a colour change: one area, or every alike item of a list.
// Usage: node scripts/ve-selector-smoke.mjs   (no tool needed; uses Chrome only to run the DOM code)
import { chromium } from "playwright-core";
import { readFileSync } from "node:fs";

const CHROME = process.env.CHROME ?? "C:/Program Files/Google/Chrome/Application/chrome.exe";
const src = readFileSync(new URL("../public/ve/inspector.js", import.meta.url), "utf8");
const grab = (name) => {
  const start = src.indexOf(`  function ${name}(`);
  const end = src.indexOf("\n  }\n", start) + 5;
  return src.slice(start, end);
};
const code = grab("alikeSiblings") + grab("selectorOf") + "\nwindow.__sel = selectorOf;";

const results = [];
const check = (n, ok, d = "") => { results.push(ok); console.log(`${ok ? "PASS" : "FAIL"}  ${n}${d ? "  — " + d : ""}`); };

const browser = await chromium.launch({ executablePath: CHROME, headless: true });
const page = await browser.newPage();
await page.setContent(`<body><div id="root"><header><h1 class="t">Tên game</h1></header>
<main><ul class="news"><li class="post"><a class="title">Tin 1</a></li><li class="post"><a class="title">Tin 2</a></li><li class="post"><a class="title">Tin 3</a></li></ul>
<ul class="menu"><li class="m"><a class="title">Menu 1</a></li><li class="m"><a class="title">Menu 2</a></li></ul></main></div></body>`);
await page.addScriptTag({ content: code });
const r = await page.evaluate(() => {
  const second = document.querySelectorAll("ul.news li a")[1];
  const menu = document.querySelectorAll("ul.menu li a")[0];
  const h1 = document.querySelector("h1");
  const one = window.__sel(second, false);
  const all = window.__sel(second, true);
  return {
    one, all,
    oneCount: document.querySelectorAll(one).length,
    allCount: document.querySelectorAll(all).length,
    allHitsMenu: [...document.querySelectorAll(all)].includes(menu),
    h1: window.__sel(h1, false),
    h1All: window.__sel(h1, true),
    h1Count: document.querySelectorAll(window.__sel(h1, false)).length,
  };
});
console.log(JSON.stringify(r));
check("one-area selector matches exactly the pressed element", r.oneCount === 1);
check("list scope matches every post of the list (3)", r.allCount === 3);
check("list scope does not reach the menu, which has the same tags and a similar class on its link", !r.allHitsMenu);
check("an element that is not a repeated item keeps the same selector in both scopes", r.h1 === r.h1All && r.h1Count === 1);
check("selectors are plain (safe to put in a stylesheet)", /^[A-Za-z0-9_\-:#.>()+~ ]+$/.test(r.one + r.all));
await browser.close();
process.exit(results.every(Boolean) ? 0 : 1);
