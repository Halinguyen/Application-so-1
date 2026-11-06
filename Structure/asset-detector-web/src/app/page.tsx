import { runDetection } from "@/detector/run";
import { readBaseEnv } from "@/detector/base-env";
import { readTextSlots } from "@/detector/site-text";
import { keepRatioSlotIds } from "@/detector/flow-image";
import { resolveGame, GAME_REPO_MAP, getGameDisplayName, getGameIconUrl, isFigmaHidden } from "@/detector/config";
import { detectFramework } from "@/detector/framework-detector";
import { readRegistryEntry, requireTemplate } from "@/detector/template-source";
import { buildCloneSlots } from "@/detector/clone-slots";
import { suggestFigmaMatches } from "@/detector/figma-source";
import { describeSection, needsVisualProof, describeResponsive } from "@/detector/section-labels";
import Link from "next/link";
import GamePicker, { type GameOption } from "./components/wizard/GamePicker";
import WizardShell from "./components/wizard/WizardShell";
import type { CloneParam, CloneExternalSlot } from "./components/wizard/types";

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

export default async function Home({
  searchParams,
}: {
  searchParams: Promise<{ game?: string }>;
}) {
  const { game } = await searchParams;

  if (!game) {
    const games: GameOption[] = await Promise.all(
      Object.keys(GAME_REPO_MAP).map(async (gameId) => {
        // the manifest knows the framework: the list must not need every template on disk (it would fetch them all)
        const known = readRegistryEntry(gameId)?.framework;
        const framework = known ?? (await detectFramework(resolveGame(gameId).repoPath)).framework;
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

  let unavailable = await requireTemplate(game);
  if (!unavailable) {
    try {
      // opens the template (extracts a frozen snapshot, finds the folder): a failure here is reported to the operator
      resolveGame(game);
    } catch (e) {
      unavailable = (e instanceof Error ? e.message : String(e)) + " — kiểm tra mã nguồn template/snapshot (template-store/*/template.tgz không nằm trong git) và biến môi trường APP_DATA_DIR, TEMPLATE_ROOT, TEMPLATE_GIT_TOKEN.";
    }
  }
  if (unavailable) {
    return (
      <div className="wrap" style={{ paddingTop: 28 }}>
        <header style={{ marginBottom: 8 }}>
          <h1>{getGameDisplayName(game)}</h1>
          <div className="subtitle" style={{ color: "var(--warn)", fontSize: 13, marginTop: 4 }} data-testid="template-unavailable">
            Chưa lấy được mã nguồn template của game này: {unavailable}
          </div>
        </header>
        <Link href="/" style={{ color: "var(--accent)" }}>
          ← chọn game khác
        </Link>
      </div>
    );
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

  const built = buildCloneSlots(data);
  const keepRatio = await keepRatioSlotIds(repoPath, built.slots);
  const slots = built.slots.map((s) => (keepRatio.has(s.id) ? { ...s, keepRatio: true } : s));
  const figmaHidden = isFigmaHidden(gameId);
  const figmaSuggestions = figmaHidden ? [] : await suggestFigmaMatches(gameId, data, repoPath);

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
  // Optional hero play-video button (see layer2-hero-video.ts): one YouTube link
  // per detected block, written to .env.local; blank = button hidden.
  const heroVideoParams: CloneParam[] = data.dynamicBlocks
    .filter((b) => b.type === "hero-video")
    .flatMap((b) =>
      b.params.map((p) => ({
        blockLabel: b.label,
        name: p.name,
        envKey: p.envKey,
        required: false,
        defaultValue: baseEnv[p.envKey] ?? "",
      }))
    );
  const gameIdParams: CloneParam[] =
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

  const params: CloneParam[] = [...gameIdParams, ...heroVideoParams];

  return (
    <WizardShell key={gameId} gameId={gameId} displayName={getGameDisplayName(gameId)} iconUrl={getGameIconUrl(gameId)} slots={slots} params={params} externalSlots={externalSlots} textSlots={textSlots} figmaSuggestions={figmaSuggestions} hideFigma={figmaHidden} />
  );
}
