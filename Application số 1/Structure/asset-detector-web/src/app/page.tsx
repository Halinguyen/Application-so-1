import { runDetection } from "@/detector/run";
import { readBaseEnv } from "@/detector/base-env";
import { readTextSlots } from "@/detector/site-text";
import { resolveGame, GAME_REPO_MAP, getGameDisplayName, getGameIconUrl } from "@/detector/config";
import { detectFramework } from "@/detector/framework-detector";
import { describeSection, describeSectionPosition, sectionOrder, needsVisualProof, describeResponsive } from "@/detector/section-labels";
import Link from "next/link";
import GamePicker, { type GameOption } from "./components/wizard/GamePicker";
import WizardShell from "./components/wizard/WizardShell";
import type { CloneSlot, CloneParam, CloneExternalSlot } from "./components/wizard/types";

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

  const slots: CloneSlot[] = data.assets
    .filter((a) => (a.metadata?.operatorEditable || a.isAutoManaged) && !a.isExternal && !API_FILLED_SECTIONS.has(a.section))
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
    }));

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
    <WizardShell key={gameId} gameId={gameId} displayName={getGameDisplayName(gameId)} iconUrl={getGameIconUrl(gameId)} slots={slots} params={params} externalSlots={externalSlots} textSlots={textSlots} />
  );
}
