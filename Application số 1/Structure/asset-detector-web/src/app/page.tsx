import { runDetection } from "@/detector/run";
import { readBaseEnv } from "@/detector/base-env";
import { readTextSlots } from "@/detector/site-text";
import { resolveGame, GAME_REPO_MAP, getGameDisplayName, getGameIconUrl } from "@/detector/config";
import { detectFramework } from "@/detector/framework-detector";
import { describeSection, describeSectionPosition, sectionOrder, needsVisualProof, describeResponsive } from "@/detector/section-labels";
import Link from "next/link";
import GamePicker, { type GameOption } from "./components/wizard/GamePicker";
import WizardShell from "./components/wizard/WizardShell";
import type { CloneSlot, CloneSlotTarget, CloneParam, CloneExternalSlot } from "./components/wizard/types";
import type { DetectedAsset } from "@/detector/types";

// Many assets share a file name in different folders ("title.webp" x10), which made the
// list look like repeats. Append the folder they live in to every label that is not unique.
function withUniqueLabels(slots: CloneSlot[]): CloneSlot[] {
  const count = new Map<string, number>();
  for (const s of slots) count.set(s.label, (count.get(s.label) ?? 0) + 1);
  return slots.map((s) => {
    if ((count.get(s.label) ?? 0) < 2) return s;
    const folder = s.previewPath
      .replace(/\\/g, "/")
      .replace(/^(public|wwwroot)\//, "")
      .replace(/^assets\//, "")
      .split("/")
      .slice(0, -1)
      .filter((p) => !/^\d+$/.test(p))
      .join("/");
    return folder ? { ...s, label: `${s.label} · ${folder}` } : s;
  });
}

// Splits an asset into per-device PSD-mappable targets. Tablet shares the
// desktop design (the operator supplies only a mobile and a desktop PSD).
function buildTargets(a: DetectedAsset): CloneSlotTarget[] {
  const v = a.variants;
  if (a.responsive === "per-breakpoint" && v) {
    const out: CloneSlotTarget[] = [];
    const mobile = v.mobile;
    const desk = [v.desktop, v.tablet].filter((x): x is NonNullable<typeof x> => !!x);
    if (mobile) {
      out.push({ device: "mobile", label: "Điện thoại", previewPath: mobile.path, targetPaths: [mobile.path], width: mobile.width, height: mobile.height });
    }
    if (desk.length) {
      out.push({
        device: "desktop",
        label: v.tablet && v.desktop ? "Máy tính + tablet" : v.desktop ? "Máy tính" : "Máy tính bảng",
        previewPath: desk[0].path,
        targetPaths: desk.map((x) => x.path),
        width: desk[0].width,
        height: desk[0].height,
      });
    }
    if (out.length) return out;
  }
  return [
    {
      device: "shared",
      label: "Mọi thiết bị",
      previewPath: a.canonicalPath,
      targetPaths: a.injection?.targetPaths || [a.canonicalPath],
      width: a.dimensions?.width,
      height: a.dimensions?.height,
    },
  ];
}

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// "dotnet-mvc" only has detection built so far — no fake-news/site-text/
// resize-upload patching exists for it yet (see clone-scope memory), so the
// wizard can't actually generate a clone for it. Gate on this everywhere the
// wizard could otherwise be reached, not just in GamePicker's disabled
// button (a typed-in ?game= would bypass that).
function isCloneReady(framework: string): boolean {
  return framework === "vite-spa" || framework === "nextjs";
}

// Sections whose content is now filled by the real APIs (slides / banner, news
// posts + categories, ranking) — not static assets to replace, so the wizard
// does not list them.
const API_FILLED_SECTIONS = new Set(["home-banner", "banner", "home-news", "news", "tintuc", "home-rank", "rank"]);

// Buttons / icons / logos inside those sections are static artwork (nav, download, prev/next)
// that the clone must be able to replace; only the content images are API-driven.
function isApiFilled(a: DetectedAsset): boolean {
  return API_FILLED_SECTIONS.has(a.section) && !/^(btn|icon|logo)/i.test(a.fileName);
}

export default async function Home({
  searchParams,
}: {
  searchParams: Promise<{ game?: string }>;
}) {
  const { game } = await searchParams;

  if (!game) {
    const games: GameOption[] = await Promise.all(
      Object.keys(GAME_REPO_MAP).map(async (gameId) => {
        const { repoPath } = resolveGame(gameId);
        const { framework } = await detectFramework(repoPath);
        return {
          gameId,
          displayName: getGameDisplayName(gameId),
          iconUrl: getGameIconUrl(gameId),
          cloneReady: isCloneReady(framework),
        };
      })
    );
    return <GamePicker games={games} />;
  }

  const { gameId, repoPath } = resolveGame(game);
  const { framework } = await detectFramework(repoPath);

  if (!isCloneReady(framework)) {
    return (
      <div className="wrap" style={{ paddingTop: 28 }}>
        <header style={{ marginBottom: 8 }}>
          <h1>{getGameDisplayName(gameId)}</h1>
          <div className="subtitle" style={{ color: "var(--warn)", fontSize: 13, marginTop: 4 }}>
            Game này ({framework}) mới hỗ trợ xem trước asset đã phát hiện được, chưa hỗ trợ tạo bản sao.
          </div>
        </header>
        <Link href="/" style={{ color: "var(--accent)" }}>
          ← chọn game khác
        </Link>
      </div>
    );
  }

  const data = await runDetection(game);
  const baseEnv = await readBaseEnv(repoPath);
  const textSlots = await readTextSlots(repoPath);

  // Only assets the source code actually uses (favicons are always kept: they are wired
  // through index.html/manifest). Files that merely sit in the assets folder are listed
  // separately so the operator is not asked to replace images nothing displays.
  const candidates = data.assets.filter(
    (a) => (a.metadata?.operatorEditable || a.isAutoManaged) && !a.isExternal && !isApiFilled(a)
  );
  const unusedAssets = candidates.filter((a) => !a.isAutoManaged && a.referenceCount === 0).map((a) => a.canonicalPath);
  const slots: CloneSlot[] = withUniqueLabels(candidates
    .filter((a) => a.isAutoManaged || a.referenceCount > 0)
    .map((a) => ({
      id: a.id,
      label: a.metadata?.label || a.fileName,
      section: a.section,
      previewPath: a.canonicalPath,
      targetPaths: a.injection?.targetPaths || [a.canonicalPath],
      responsive: a.responsive,
      sectionLabel: describeSection(a.section),
      sectionOrder: sectionOrder(a.section),
      sectionPosition: describeSectionPosition(a.section),
      sizeLabel: a.dimensions ? `${a.dimensions.width} × ${a.dimensions.height} px` : "",
      needsVisualProof: needsVisualProof(a.section, a.dimensions),
      responsiveLabel: describeResponsive(a.responsive, a.variants, a.missingBreakpoints),
      references: a.references.map((r) => ({
        file: r.file,
        line: r.line,
        usage: r.usage,
        attribute: r.attribute,
      })),
      targets: buildTargets(a),
    })));

  const externalSlots: CloneExternalSlot[] = data.assets
    .filter((a) => a.isExternal)
    .map((a) => ({
      id: a.id,
      label: a.metadata?.label || a.fileName,
      type: a.type === "video" ? "video" : "image",
      url: a.externalUrl || a.canonicalPath,
      localPath: `assets/_uploads/${a.id.replace(/[^a-z0-9.]/gi, "-")}-${a.fileName}`,
      refFiles: [...new Set(a.references.map((r) => r.file))],
      sectionLabel: describeSection(a.section),
      needsVisualProof: needsVisualProof(a.section, a.dimensions),
      responsiveLabel: describeResponsive(a.responsive, a.variants, a.missingBreakpoints),
      references: a.references.map((r) => ({
        file: r.file,
        line: r.line,
        usage: r.usage,
        attribute: r.attribute,
      })),
    }));

  // Clones only call 2 APIs (hub config + ranking) and both take the same game
  // id, so the operator enters ONE GameId; it is written to every env key the
  // template uses for it (hub game_id and ranking gameId). No other env value
  // (mode/scope included) is asked — those come from the cloned template.
  const gameIdKeys = [
    ...new Set(
      data.dynamicBlocks.flatMap((b) =>
        b.params.filter((p) => p.envKey && (p.name === "game_id" || p.name === "gameId")).map((p) => p.envKey)
      )
    ),
  ];
  const params: CloneParam[] =
    gameIdKeys.length === 0
      ? []
      : [
          {
            blockLabel: "GameId của bản clone",
            name: "GameId",
            envKey: gameIdKeys[0],
            alsoEnvKeys: gameIdKeys.slice(1),
            required: true,
            defaultValue: baseEnv[gameIdKeys[0]] ?? "",
          },
        ];

  return (
    <WizardShell key={gameId} gameId={gameId} displayName={getGameDisplayName(gameId)} iconUrl={getGameIconUrl(gameId)} slots={slots} params={params} externalSlots={externalSlots} textSlots={textSlots} unusedAssets={unusedAssets} />
  );
}
