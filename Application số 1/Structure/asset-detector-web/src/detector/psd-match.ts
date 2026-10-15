// Pure scoring/assignment of PSD layers to asset targets. Layer names in real
// design files are unreliable, so geometry (aspect ratio, then size) carries
// most of the weight and the name only breaks ties. Safe to import client-side.

export interface MatchLayer {
  /** Which PSD the layer came from ("desktop" | "mobile") — layer ids repeat across PSDs. */
  source: string;
  id: number;
  name: string;
  path: string;
  width: number;
  height: number;
}

export interface MatchTarget {
  key: string;
  label: string;
  /** Repo file names of the current images — often the best name hint ("banner_home.png"). */
  fileNames: string[];
  width?: number;
  height?: number;
}

export type Confidence = "high" | "medium" | "low";

export interface Match {
  source: string;
  layerId: number;
  score: number;
  confidence: Confidence;
  /** The layer name/path shares words with the target — the only evidence beyond shape and size. */
  nameHit: boolean;
  /** Another layer scored almost as well — the operator should double check. */
  ambiguous: boolean;
}

const RATIO_TOLERANCE = 0.12; // |ln(ratioA / ratioB)| — roughly 12%
const AREA_TOLERANCE = 6;
const MIN_SCORE = 0.5;
const GENERIC = new Set(["layer", "copy", "group", "shape", "rectangle", "image", "img", "png", "jpg", "jpeg", "webp", "the", "va", "and"]);

function tokens(s: string): Set<string> {
  const plain = s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/đ/gi, "d")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .toLowerCase();
  return new Set(plain.split(/[^a-z0-9]+/).filter((t) => t.length > 1 && !GENERIC.has(t) && !/^\d+$/.test(t)));
}

function nameScore(layer: MatchLayer, target: MatchTarget): number {
  const a = tokens(`${layer.name} ${layer.path}`);
  const b = tokens(`${target.label} ${target.fileNames.join(" ")}`);
  if (a.size === 0 || b.size === 0) return 0;
  let hit = 0;
  for (const t of b) if (a.has(t)) hit++;
  return hit / b.size;
}

/** 0 when geometry rules the pair out. */
export function scorePair(layer: MatchLayer, target: MatchTarget): number {
  if (!target.width || !target.height || !layer.width || !layer.height) return 0;
  const ratioErr = Math.abs(Math.log(layer.width / layer.height / (target.width / target.height)));
  if (ratioErr > RATIO_TOLERANCE) return 0;
  const ratioScore = 1 - ratioErr / RATIO_TOLERANCE;
  // Design files are usually at 1x–2x of the web size; 6x of area covers that
  // while still separating a 64px icon from a 1920px banner of the same ratio.
  const areaErr = Math.abs(Math.log((layer.width * layer.height) / (target.width * target.height)));
  if (areaErr > Math.log(AREA_TOLERANCE)) return 0; // same ratio but a different scale (a page vs. a button) is not a match
  const sizeScore = 1 - areaErr / Math.log(AREA_TOLERANCE);
  return 0.55 * ratioScore + 0.3 * sizeScore + 0.15 * nameScore(layer, target);
}

function confidenceOf(score: number, ambiguous: boolean): Confidence {
  if (score >= 0.8 && !ambiguous) return "high";
  if (score >= 0.65) return "medium";
  return "low";
}

const LOOKALIKE_TOLERANCE = 0.1; // ln-distance of both ratio and area

/** Another target is the same shape and size, so geometry cannot tell the two apart. */
function hasLookalike(target: MatchTarget, all: MatchTarget[]): boolean {
  if (!target.width || !target.height) return false;
  return all.some(
    (o) =>
      o.key !== target.key &&
      !!o.width &&
      !!o.height &&
      Math.abs(Math.log(o.width / o.height / (target.width! / target.height!))) < LOOKALIKE_TOLERANCE &&
      Math.abs(Math.log((o.width * o.height) / (target.width! * target.height!))) < LOOKALIKE_TOLERANCE * 2
  );
}


/** Best layer per target, each layer used at most once (greedy by score). */
export function autoMatch(targets: MatchTarget[], pools: Record<string, MatchLayer[]>): Record<string, Match> {
  const pairs: { key: string; layer: MatchLayer; score: number }[] = [];
  const bestByKey = new Map<string, number[]>();
  for (const t of targets) {
    const scores: number[] = [];
    for (const layer of pools[t.key] ?? []) {
      const score = scorePair(layer, t);
      if (score >= MIN_SCORE) {
        pairs.push({ key: t.key, layer, score });
        scores.push(score);
      }
    }
    bestByKey.set(t.key, scores.sort((x, y) => y - x));
  }
  pairs.sort((x, y) => y.score - x.score);

  const targetByKey = new Map(targets.map((t) => [t.key, t]));
  const usedTargets = new Set<string>();
  const usedLayers = new Set<string>();
  const out: Record<string, Match> = {};
  for (const p of pairs) {
    const layerKey = `${p.layer.source}:${p.layer.id}`;
    if (usedTargets.has(p.key) || usedLayers.has(layerKey)) continue;
    const scores = bestByKey.get(p.key) ?? [];
    const ambiguous = scores.length > 1 && scores[0] - scores[1] < 0.05;
    let confidence = confidenceOf(p.score, ambiguous);
    // Same-size siblings (a row of 123×38 buttons) match on geometry alone, so
    // without any name evidence the pick is as good as random: drop one level.
    const target = targetByKey.get(p.key)!;
    if (nameScore(p.layer, target) === 0 && hasLookalike(target, targets)) confidence = "low";
    // A low match is a guess: leave the row empty so "Áp dụng" never overwrites
    // a good image with it; the operator can still pick the layer by hand.
    if (confidence === "low") continue;
    usedTargets.add(p.key);
    usedLayers.add(layerKey);
    out[p.key] = { source: p.layer.source, layerId: p.layer.id, score: p.score, confidence, ambiguous, nameHit: nameScore(p.layer, target) > 0 };
  }
  return out;
}
