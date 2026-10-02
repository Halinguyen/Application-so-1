"use client";

import { useRouter } from "next/navigation";

export interface GameOption {
  gameId: string;
  displayName: string;
  iconUrl: string | null;
  cloneReady: boolean;
}

// Monogram fallback for a game without an icon file: first letter after the
// "[MÃ] " prefix of the display name.
function monogram(displayName: string): string {
  return displayName.replace(/^\[[^\]]*\]\s*/, "").charAt(0).toUpperCase();
}

// "vite-spa" / "nextjs" already have the full clone pipeline (fake-news
// patch, site-text rewrite, resize-upload) wired up — "dotnet-mvc" only has
// detection built so far (see clone-scope memory / MULTI-GAME-ROLLOUT-PLAN.md).
// Letting an operator submit the wizard for a .NET game would 500 on the
// fake-news patch step, so step 1 blocks that instead of letting them find
// out at the end of a long form.
export default function GamePicker({ games }: { games: GameOption[] }) {
  const router = useRouter();

  return (
    <div className="wrap" style={{ paddingTop: 28 }}>
      <header style={{ marginBottom: 24 }}>
        <h1>Chọn game để tạo bản sao</h1>
        <div className="subtitle" style={{ color: "var(--muted)", fontSize: 13, marginTop: 4 }}>
          Chọn 1 website gốc làm mẫu — bạn sẽ thay ảnh, video và cấu hình ở bước sau.
        </div>
      </header>
      <div className="gamepicker-grid">
        {games.map((g) => (
          <button
            key={g.gameId}
            type="button"
            className={`gamepicker-card${g.cloneReady ? "" : " disabled"}`}
            disabled={!g.cloneReady}
            onClick={() => router.push(`/?game=${g.gameId}`)}
            title={g.cloneReady ? undefined : "Game này mới hỗ trợ xem trước asset, chưa tạo được bản sao"}
          >
            {g.iconUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img className="gamepicker-avatar" src={g.iconUrl} alt="" width={64} height={64} />
            ) : (
              <div className="gamepicker-avatar gamepicker-avatar-fallback" aria-hidden>
                {monogram(g.displayName)}
              </div>
            )}
            <div className="gamepicker-name">{g.displayName}</div>
            <span className={`gamepicker-badge${g.cloneReady ? " ready" : ""}`}>
              {g.cloneReady ? "Sẵn sàng tạo bản sao" : "Đang xây dựng — chưa hỗ trợ"}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}
