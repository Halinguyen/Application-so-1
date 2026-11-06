import { runDetection } from "@/detector/run";
import { GAME_REPO_MAP, GAME_DISPLAY_NAMES, getGameDisplayName } from "@/detector/config";
import Gallery, { type GalleryAsset } from "../components/Gallery";
import RescanButton from "../components/RescanButton";
import GameSwitcher from "../components/GameSwitcher";

// This page re-scans the target repo's filesystem on every load — it must
// never be statically prerendered, or `next build && next start` would
// silently freeze the dashboard at the build-time snapshot and the
// "Re-scan" button's router.refresh() would just re-serve the same static
// page instead of running a fresh scan.
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// Internal QA dashboard — audience is an engineer sanity-checking detection
// quality before handoff (see its own subtitle below), not the operator.
// The operator-facing flow lives at "/" (WizardShell); this page is
// intentionally left English/technical since that fits its real audience.
export default async function AdminPage({
  searchParams,
}: {
  searchParams: Promise<{ game?: string }>;
}) {
  const { game } = await searchParams;
  const data = await runDetection(game);
  const { summary, framework, swipers, dynamicBlocks, assets, gameId } = data;

  const galleryAssets: GalleryAsset[] = assets.map((a) => ({
    id: a.id,
    fileName: a.fileName,
    canonicalPath: a.canonicalPath,
    gameId,
    section: a.section,
    confidence: a.confidence,
    referenceCount: a.referenceCount,
    needsManualReview: a.needsManualReview,
    isAutoManaged: a.isAutoManaged,
    isExternal: a.isExternal,
    externalUrl: a.externalUrl,
  }));

  const bySection = Object.entries(summary.bySection).sort((a, b) => b[1] - a[1]);
  const maxSection = Math.max(...bySection.map(([, c]) => c));

  const kpis: { label: string; value: string | number; cls?: string }[] = [
    { label: "Total assets", value: summary.totalAssets },
    {
      label: "Avg confidence",
      value: Math.round(summary.avgConfidence * 100) + "%",
      cls: summary.avgConfidence >= 0.85 ? "accent" : "warn",
    },
    {
      label: "Needs review",
      value: summary.needsReview,
      cls: summary.needsReview > 0 ? "warn" : undefined,
    },
    { label: "Swipers", value: summary.totalSwipers },
    { label: "Dynamic blocks", value: summary.totalDynamicBlocks },
    { label: "References", value: summary.totalReferences },
  ];

  return (
    <>
      <header className="top">
        <div className="row">
          <div>
            <h1>{getGameDisplayName(gameId)}</h1>
            <div className="subtitle">
              Asset detection tool — live scan of the target repo, for review before handoff to the operator
            </div>
          </div>
          <div className="meta">
            framework <span className="mono">{framework.framework}</span>
            <br />
            <GameSwitcher gameId={gameId} games={Object.keys(GAME_REPO_MAP)} labels={GAME_DISPLAY_NAMES} />
            <br />
            <a href={`/?game=${gameId}`} style={{ color: "var(--accent)" }}>
              Operator wizard →
            </a>
          </div>
        </div>
        <div className="wrap">
          <div className="kpis">
            {kpis.map((k) => (
              <div className={`kpi ${k.cls ?? ""}`} key={k.label}>
                <div className="label">{k.label}</div>
                <div className="value">{k.value}</div>
              </div>
            ))}
          </div>
        </div>
      </header>

      <div className="wrap">
        <section className="block">
          <h2>Assets by section</h2>
          <div className="hint">
            Where each detected asset was classified — a lopsided &ldquo;other&rdquo; bucket would be the first sign of a bad detection run.
          </div>
          <div className="barlist">
            {bySection.map(([name, count]) => (
              <div className="barrow" key={name}>
                <div className="name">{name}</div>
                <div className="track">
                  <div
                    className="fill"
                    style={{ width: `${((count / maxSection) * 100).toFixed(1)}%` }}
                  />
                </div>
                <div className="count">{count}</div>
              </div>
            ))}
          </div>
        </section>

        <section className="block">
          <h2>
            Swipers <span className="mono" style={{ fontSize: 14, color: "var(--muted)" }}>({swipers.length})</span>
          </h2>
          <div className="hint">
            Every &lt;Swiper&gt; component found, with its resolved slide source — check &ldquo;data source&rdquo; carefully, it&rsquo;s the part most likely to silently misdetect.
          </div>
          <div className="cards">
            {swipers.map((s) => {
              const dataSourceLabel = s.isDataDriven
                ? `data-driven — ${s.dataSource || "unresolved"}`
                : `static — ${s.dataSource ? s.dataSource.replace("static array: ", "") : "inline slides"}`;
              return (
                <div className="card" key={s.id}>
                  <h3>{s.source.split("/").pop()?.split(":")[0]}</h3>
                  <span className="tag">
                    {s.visualMode}
                    {s.effectType ? ` · ${s.effectType}` : ""}
                  </span>
                  <dl>
                    <dt>slidesPerView</dt>
                    <dd>{s.slidesPerView}</dd>
                    <dt>spaceBetween</dt>
                    <dd>{s.spaceBetween}px</dd>
                    <dt>centered</dt>
                    <dd>{String(s.centeredSlides)}</dd>
                    <dt>autoplay</dt>
                    <dd>
                      {String(s.config.autoplay)}
                      {s.config.delay ? ` (${s.config.delay}ms)` : ""}
                    </dd>
                    <dt>loop</dt>
                    <dd>{String(s.config.loop)}</dd>
                    <dt>slide count</dt>
                    <dd>{s.slideCount || "? (resolved at runtime)"}</dd>
                    <dt>confidence</dt>
                    <dd>{(s.confidence * 100).toFixed(0)}%</dd>
                  </dl>
                  <div className="ext-note">data source: {dataSourceLabel}</div>
                  {(s.navigation.prev || s.navigation.next) && (
                    <div className="hint" style={{ margin: "10px 0 0", fontSize: 11.5 }}>
                      navigation assets referenced: <span className="mono">{s.navigation.prev}</span>,{" "}
                      <span className="mono">{s.navigation.next}</span>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </section>

        <section className="block">
          <h2>
            Dynamic blocks{" "}
            <span className="mono" style={{ fontSize: 14, color: "var(--muted)" }}>
              ({dynamicBlocks.length})
            </span>
          </h2>
          <div className="hint">
            API-backed sections (button config, leaderboard) — params are what the operator will need to fill in at build time.
          </div>
          <div className="cards">
            {dynamicBlocks.map((b) => (
              <div className="card" key={b.id}>
                <h3>{b.label}</h3>
                <span className="tag">{b.section}</span>
                <dl>
                  <dt>endpoint</dt>
                  <dd>{b.apiEndpoint}</dd>
                  <dt>base env</dt>
                  <dd>{b.baseUrlEnv || "—"}</dd>
                  <dt>source</dt>
                  <dd style={{ fontSize: 11 }}>{b.source}</dd>
                  <dt>confidence</dt>
                  <dd>{(b.confidence * 100).toFixed(0)}%</dd>
                </dl>
                <div className="params">
                  {b.params.map((p) => (
                    <div className="p" key={p.name}>
                      <span className="n">{p.name}</span>
                      <span className="k">
                        {p.envKey || `default: ${p.default}`}
                        {p.required ? " · required" : ""}
                      </span>
                    </div>
                  ))}
                </div>
                {b.tabs && (
                  <div className="tabs-row">
                    {b.tabs.map((t) => (
                      <span className="pill" key={t.id}>
                        {t.label}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        </section>

        <section className="block">
          <h2>Asset gallery</h2>
          <div className="hint">
            Every detected static asset with its real thumbnail, served live from the target repo&rsquo;s <code>public/</code> folder. Filter to a section, or isolate the ones flagged for manual review.
          </div>
          <Gallery assets={galleryAssets} />
        </section>

        <footer className="foot">
          <span>Live detection tool — scans the repo on every load. Not the built site.</span>
          <RescanButton gameId={gameId} />
        </footer>
      </div>
    </>
  );
}
