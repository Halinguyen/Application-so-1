// Proposes, for each asset slot of a template, the Figma node that carries the NEW design for it.
//
// The Figma file is the design of the new game and the slots hold the template's old artwork, so the two never look alike:
// a slot is matched by what it IS (role, size, text inside it, what else sits around it), not by its pixels.

export interface FigmaNode {
  id: string;
  name: string;
  type: string;
  parent: string | null;
  /** Top-level frame (one page of the design) this node belongs to. */
  frame: string;
  w: number;
  h: number;
  visible: boolean;
  hasImage: boolean;
  /** A plain one-colour rectangle: nothing to download, it has to be rendered. */
  solid: boolean;
  text?: string;
}

export interface MatchSlot {
  id: string;
  fileName: string;
  section: string;
  width: number;
  height: number;
  /** How the website's code shows the asset at each place it is used (see figma-context.ts): the design is drawn at that size, not at the file's. */
  usages?: SlotUsage[];
}

export interface SlotUsage {
  w?: number;
  h?: number;
  aspect?: number;
  altTokens: string[];
}

export type MatchStatus = "auto" | "review" | "none";

export interface Candidate {
  nodeId: string;
  nodeName: string;
  score: number;
}

export interface Suggestion {
  slotId: string;
  nodeId: string | null;
  nodeName: string;
  score: number;
  /** Gap to the best different node: a small gap means the slot is ambiguous. */
  margin: number;
  status: MatchStatus;
  reasons: string[];
  alternatives: Candidate[];
  /** "render-solid": the node is a flat colour, export it by rendering it. */
  exportKind: "render" | "render-solid";
}

export interface MatchOptions {
  /** Which Figma frame holds the design of a section; sections not listed are not matched. */
  frameBySection: Record<string, string>;
  autoMinScore?: number;
  autoMinMargin?: number;
}

const AUTO_MIN_SCORE = 0.75;
const AUTO_MIN_MARGIN = 0.15;
// Below this the best node is noise (a footer logo for a section frame): propose nothing rather than a wrong guess.
const MIN_PROPOSE_SCORE = 0.4;
// Above this a descendant is a confident match of ANOTHER slot, so its ancestor is a composite that contains that slot.
const CLAIM_MIN_SCORE = 0.6;
const CANDIDATE_TYPES = new Set(["RECTANGLE", "INSTANCE", "GROUP", "FRAME", "COMPONENT"]);

// Words that say what kind of asset a file is, not which one: they are scored through the role, not the name.
const GENERIC_TOKENS = new Set(["btn", "button", "icon", "frame", "logo", "bg", "game", "img", "image", "png", "jpg", "webp"]);

// Short names the template uses for what the design spells out ("ggplay" slot, "Tải trên Google Play" button).
const ALIASES: Record<string, string[]> = {
  ggplay: ["google", "play", "android"],
  store: ["appstore", "ios", "apple"],
  pc: ["pc", "choi", "ngay"],
  cskh: ["cskh", "support"],
  nap: ["nap", "tien", "recharge"],
};

const ROLE_PATTERNS: Record<string, RegExp> = {
  logo: /logo|18/,
  button: /btn|button|frame/,
  icon: /icon|android|ios|apk/,
  background: /(^|\s)bg(\s|$)|background/,
};

function normalize(s: string): string[] {
  return s
    .toLowerCase()
    .replace(/đ/g, "d")
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
}

function tokensMatch(a: string, b: string): boolean {
  return a === b || (a.length >= 3 && b.length >= 3 && (a.startsWith(b) || b.startsWith(a)));
}

function slotRole(fileName: string): string {
  const tokens = normalize(fileName.replace(/\.[a-z0-9]+$/i, ""));
  for (const role of ["logo", "button", "icon", "background"]) {
    if (tokens.some((t) => ROLE_PATTERNS[role].test(t))) return role;
  }
  return "other";
}

function geometryAgainst(width: number, height: number, n: FigmaNode): number {
  if (!width || !height || !n.w || !n.h) return 0;
  const size = Math.max(0, 1 - 4 * Math.max(Math.abs(n.w - width) / width, Math.abs(n.h - height) / height));
  const aspect = Math.max(0, 1 - 5 * Math.abs(n.w / n.h / (width / height) - 1));
  return 0.6 * size + 0.4 * aspect;
}

// Against the file's own size and against the size of each place it is shown at: the best of them counts.
function geometryScore(slot: MatchSlot, n: FigmaNode): number {
  let best = geometryAgainst(slot.width, slot.height, n);
  for (const u of slot.usages ?? []) {
    const w = u.w ?? slot.width;
    const h = u.h ?? (u.aspect ? w / u.aspect : (w * slot.height) / slot.width);
    best = Math.max(best, geometryAgainst(w, h, n));
  }
  return best;
}

interface Evidence {
  nameText: string;
  tokens: string[];
}

export function matchSlots(nodes: FigmaNode[], slots: MatchSlot[], opts: MatchOptions): Suggestion[] {
  const autoMinScore = opts.autoMinScore ?? AUTO_MIN_SCORE;
  const autoMinMargin = opts.autoMinMargin ?? AUTO_MIN_MARGIN;

  const byId = new Map(nodes.map((n) => [n.id, n]));
  const children = new Map<string, FigmaNode[]>();
  for (const n of nodes) {
    if (n.parent) children.set(n.parent, [...(children.get(n.parent) ?? []), n]);
  }
  // The footer is not part of what the tool clones (every site brings its own SDK footer).
  const footerCache = new Map<string, boolean>();
  const inFooter = (n: FigmaNode): boolean => {
    let known = footerCache.get(n.id);
    if (known === undefined) {
      known = /footer/i.test(n.name) || (n.parent !== null && byId.has(n.parent) && inFooter(byId.get(n.parent)!));
      footerCache.set(n.id, known);
    }
    return known;
  };
  const descendants = (id: string, depth = 3): FigmaNode[] =>
    depth === 0 ? [] : (children.get(id) ?? []).flatMap((c) => [c, ...descendants(c.id, depth - 1)]);
  const isDescendant = (id: string, ancestorId: string): boolean => {
    for (let p = byId.get(id)?.parent; p; p = byId.get(p)?.parent) if (p === ancestorId) return true;
    return false;
  };

  // What a node says about itself: its own name plus the names and texts of what it contains (a button is named "frame",
  // the word that tells the four buttons apart is the text inside).
  const evidenceCache = new Map<string, Evidence>();
  const evidence = (n: FigmaNode): Evidence => {
    let e = evidenceCache.get(n.id);
    if (!e) {
      const parts = [n.name, ...descendants(n.id).filter((d) => d.visible).flatMap((d) => [d.name, d.text ?? ""])];
      e = { nameText: normalize(n.name).join(" "), tokens: parts.flatMap(normalize) };
      evidenceCache.set(n.id, e);
    }
    return e;
  };

  interface Scored extends Candidate {
    reasons: string[];
  }
  const scored = new Map<string, Scored[]>();
  for (const slot of slots) {
    const frame = opts.frameBySection[slot.section];
    if (!frame) continue;
    const role = slotRole(slot.fileName);
    const specific = normalize(slot.fileName.replace(/\.[a-z0-9]+$/i, "")).filter((t) => !GENERIC_TOKENS.has(t) && !/^\d+x\d+$/.test(t));
    const altSets = (slot.usages ?? []).map((u) => u.altTokens.filter((t) => !GENERIC_TOKENS.has(t))).filter((t) => t.length > 0);
    const list: Scored[] = [];
    for (const n of nodes) {
      if (n.frame !== frame || n.parent === null || !n.visible || !CANDIDATE_TYPES.has(n.type)) continue;
      if (n.w < 8 || n.h < 8 || inFooter(n)) continue;
      const ev = evidence(n);
      const geo = geometryScore(slot, n);
      if (geo === 0) continue;
      const covered = (words: string[]) => words.filter((t) => [t, ...(ALIASES[t] ?? [])].some((w) => ev.tokens.some((x) => tokensMatch(w, x)))).length / words.length;
      // The alt text in the JSX (alt="Android") names the asset as well as the file does: either one may carry the match.
      const nameScore = Math.max(specific.length === 0 ? 0.5 : covered(specific), ...altSets.map(covered));
      const rolePattern = ROLE_PATTERNS[role];
      const roleScore = rolePattern ? (rolePattern.test(ev.tokens.join(" ")) ? 1 : 0) : 0.5;
      const score = 0.5 * geo + 0.3 * nameScore + 0.2 * roleScore;
      list.push({
        nodeId: n.id,
        nodeName: n.name,
        score,
        reasons: [`kích thước/tỉ lệ ${Math.round(geo * 100)}%`, `tên/chữ ${Math.round(nameScore * 100)}%`, `vai trò ${role} ${Math.round(roleScore * 100)}%`],
      });
    }
    list.sort((a, b) => b.score - a.score);
    scored.set(slot.id, list);
  }

  // A node that contains the confident match of another slot is a composite of several slots (a sidebar that holds the QR
  // code and the buttons), not the artwork of this one: skip it.
  const top = (slotId: string) => scored.get(slotId)?.[0];
  const contained = new Map<string, string>();
  for (const [slotId, list] of scored) {
    const t = top(slotId);
    if (!t || t.score < CLAIM_MIN_SCORE) continue;
    for (const other of list.slice(0, 1)) contained.set(slotId, other.nodeId);
  }
  const picked = new Map<string, Scored>();
  const taken = new Set<string>();
  const order = [...scored.keys()].sort((a, b) => (top(b)?.score ?? 0) - (top(a)?.score ?? 0));
  for (const slotId of order) {
    const list = (scored.get(slotId) ?? []).filter((c) => {
      for (const [otherSlot, nodeId] of contained) {
        if (otherSlot !== slotId && c.nodeId !== nodeId && isDescendant(nodeId, c.nodeId)) return false;
      }
      return !taken.has(c.nodeId);
    });
    scored.set(slotId, list);
    const best = list[0];
    if (best && best.score >= MIN_PROPOSE_SCORE) {
      picked.set(slotId, best);
      taken.add(best.nodeId);
    }
  }

  return slots
    .filter((s) => opts.frameBySection[s.section])
    .map((slot): Suggestion => {
      const list = scored.get(slot.id) ?? [];
      const best = picked.get(slot.id);
      if (!best || best.score < MIN_PROPOSE_SCORE) {
        return { slotId: slot.id, nodeId: null, nodeName: "", score: 0, margin: 0, status: "none", reasons: [], alternatives: [], exportKind: "render" };
      }
      const second = list.find((c) => c.nodeId !== best.nodeId);
      const margin = best.score - (second?.score ?? 0);
      const node = byId.get(best.nodeId)!;
      const status: MatchStatus = best.score >= autoMinScore && margin >= autoMinMargin ? "auto" : "review";
      return {
        slotId: slot.id,
        nodeId: best.nodeId,
        nodeName: best.nodeName,
        score: best.score,
        margin,
        status,
        reasons: best.reasons,
        alternatives: list.slice(0, 4).map(({ nodeId, nodeName, score }) => ({ nodeId, nodeName, score })),
        exportKind: node.solid ? "render-solid" : "render",
      };
    });
}
