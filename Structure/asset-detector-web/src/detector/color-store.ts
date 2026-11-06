import fs from "node:fs/promises";
import path from "node:path";

/**
 * Colours changed from the preview editor, each for ONE area of a page (2026-11-06). A change is a CSS rule on the element
 * the operator pressed — written into the overrides stylesheet next to the layout — so it never leaks to other places that
 * happen to use the same colour (the mobile side menu, another block). Kept next to the template like uploads and layout.
 */
export type ColorProp = "background" | "text" | "border";

export interface ColorRule {
  /** CSS selector of the pressed element, built by the inspector from the page's own structure */
  selector: string;
  prop: ColorProp;
  /** #rrggbb */
  to: string;
}

const CSS_PROP: Record<ColorProp, string> = { background: "background-color", text: "color", border: "border-color" };

/** Only plain structural selectors: tags, ids, classes, :nth-child(n), combinators. Nothing that could close a rule. */
export const SELECTOR_OK = /^[A-Za-z0-9_\-:#.>()+~ ]{1,600}$/;

export const isHexColor = (v: string) => /^#[0-9a-fA-F]{6}$/.test(v);
export const isColorProp = (v: unknown): v is ColorProp => v === "background" || v === "text" || v === "border";

const storeFile = (repoPath: string) => path.join(path.dirname(repoPath), "home-page-colors.json");

/** The saved rules. A file in the older format (a table keyed by colour) counts as none: those changes were global. */
export async function readColorRules(repoPath: string): Promise<ColorRule[]> {
  try {
    const parsed: unknown = JSON.parse(await fs.readFile(storeFile(repoPath), "utf-8"));
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (r): r is ColorRule => !!r && typeof r.selector === "string" && SELECTOR_OK.test(r.selector) && isColorProp(r.prop) && isHexColor(String(r.to))
    );
  } catch {
    return [];
  }
}

async function write(repoPath: string, rules: ColorRule[]): Promise<void> {
  if (rules.length === 0) await fs.rm(storeFile(repoPath), { force: true });
  else await fs.writeFile(storeFile(repoPath), JSON.stringify(rules, null, 2));
}

export type SetResult = { ok: true; rules: ColorRule[] } | { ok: false; error: string };

/** Adds the rule, or replaces the colour of the same selector + property. */
export async function setColorRule(repoPath: string, rule: { selector: unknown; prop: unknown; to: unknown }): Promise<SetResult> {
  const { selector, prop, to } = rule;
  if (typeof selector !== "string" || !SELECTOR_OK.test(selector)) return { ok: false, error: "Không xác định được vùng cần đổi màu — bấm lại vào vùng đó." };
  if (!isColorProp(prop)) return { ok: false, error: "Loại màu không hợp lệ." };
  if (typeof to !== "string" || !isHexColor(to)) return { ok: false, error: "Mã màu phải có dạng #rrggbb." };
  const rules = (await readColorRules(repoPath)).filter((r) => !(r.selector === selector && r.prop === prop));
  rules.push({ selector, prop, to: to.toLowerCase() });
  await write(repoPath, rules);
  return { ok: true, rules };
}

export async function clearColorRules(repoPath: string): Promise<void> {
  await write(repoPath, []);
}

/** The stylesheet for the saved rules. !important: it must beat the template's own colour classes and inline styles. */
export function colorRulesToCss(rules: ColorRule[]): string {
  return rules.map((r) => `${r.selector}{${CSS_PROP[r.prop]}:${r.to} !important}`).join("\n");
}

export async function colorRulesCss(repoPath: string): Promise<string> {
  const css = colorRulesToCss(await readColorRules(repoPath));
  return css ? "\n/* colours changed in the editor */\n" + css + "\n" : "";
}
