"use client";

import { useMemo, useState, useSyncExternalStore } from "react";
import type { CloneSlot, FigmaSuggestionView } from "./types";

type Decision = "approved" | "rejected";

const NO_DECISIONS: Record<string, { nodeId: string; decision: Decision }> = {};
const subscribeNever = () => () => {};

function storageKey(gameId: string) {
  return `figma-review:v1:${gameId}`;
}

function loadDecisions(gameId: string): Record<string, { nodeId: string; decision: Decision }> {
  try {
    const raw = localStorage.getItem(storageKey(gameId));
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

export default function FigmaSuggestions({
  gameId,
  suggestions,
  slots,
  onApprove,
  onRevoke,
}: {
  gameId: string;
  suggestions: FigmaSuggestionView[];
  slots: CloneSlot[];
  /** Puts the Figma image in the slot as if the operator had uploaded it (it is then resized to every target like any upload). */
  onApprove: (slot: CloneSlot, file: File) => void;
  onRevoke: (slot: CloneSlot) => void;
}) {
  const slotById = useMemo(() => new Map(slots.map((s) => [s.id, s])), [slots]);
  const [saved, setSaved] = useState<Record<string, { nodeId: string; decision: Decision }>>(() => loadDecisions(gameId));
  // The server cannot see localStorage: the saved verdicts are shown only once the page is hydrated, otherwise the first client
  // render would differ from the server HTML (hydration error).
  const hydrated = useSyncExternalStore(subscribeNever, () => true, () => false);
  const decisions = hydrated ? saved : NO_DECISIONS;
  const [chosen, setChosen] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);
  // Nodes whose image is not rendered yet (Figma's render quota is tiny), and a counter that makes the images reload after a prefetch.
  const [missing, setMissing] = useState<Record<string, boolean>>({});
  const [prefetching, setPrefetching] = useState(false);
  const [reload, setReload] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);
  const [importMsg, setImportMsg] = useState<string | null>(null);
  const [linkUrl, setLinkUrl] = useState("");

  const rows = useMemo(
    () =>
      suggestions
        .filter((s) => slotById.has(s.slotId))
        .sort((a, b) => (a.status === b.status ? b.score - a.score : a.status === "auto" ? -1 : 1)),
    [suggestions, slotById]
  );
  // Local Asset Repository: loads the ZIP the Figma export plugin made (nodes.json + assets/<nodeId>.png), then reloads the page
  // so the proposals are computed from it.
  async function importZip(file: File | null) {
    if (!file) return;
    setError(null);
    setImportMsg(null);
    setImporting(true);
    try {
      const form = new FormData();
      form.append("game", gameId);
      form.append("file", file);
      const res = await fetch("/api/figma/import", { method: "POST", body: form });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error ?? `Lỗi ${res.status}`);
      setImportMsg(`Đã nhập ${body.nodes} node, ${body.assets} ảnh${body.warnings?.length ? ` — ${body.warnings.join("; ")}` : ""}. Đang tải lại…`);
      setTimeout(() => window.location.reload(), 1800);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setImporting(false);
    }
  }

  // Reads the node tree of the frames a pasted Figma link points at (one REST call), then reloads to compute the proposals.
  // The images are fetched afterwards with "Tải ảnh Figma còn thiếu".
  async function importLink() {
    if (!linkUrl.trim()) return;
    setError(null);
    setImportMsg(null);
    setImporting(true);
    try {
      const res = await fetch("/api/figma/link", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ game: gameId, url: linkUrl }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error ?? `Lỗi ${res.status}`);
      setImportMsg(`Đã đọc ${body.frames.length} frame, ${body.nodes} node${body.warnings?.length ? ` — ${body.warnings.join("; ")}` : ""}. Đang tải lại…`);
      setTimeout(() => window.location.reload(), 1800);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setImporting(false);
    }
  }

  const toolbar = (
    <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", margin: "0 0 10px" }}>
      <label className="tile-btn">
        {importing ? "Đang nhập…" : "Nhập ZIP export từ Figma"}
        <input type="file" accept=".zip" style={{ display: "none" }} disabled={importing} onChange={(e) => importZip(e.target.files?.[0] ?? null)} />
      </label>
      <input
        type="url"
        value={linkUrl}
        placeholder="Dán link frame Figma (figma.com/design/…?node-id=…)"
        disabled={importing}
        onChange={(e) => setLinkUrl(e.target.value)}
        style={{ minWidth: 280, flex: "1 1 280px" }}
      />
      <button type="button" className="tile-btn" disabled={importing || !linkUrl.trim()} onClick={importLink}>
        Đọc từ link
      </button>
      <a className="tile-btn" href={`/api/figma/mapping?game=${gameId}&download=1`}>
        Tải mapping JSON
      </a>
      {importMsg && (
        <span className="hint" style={{ margin: 0 }}>
          {importMsg}
        </span>
      )}
    </div>
  );

  if (rows.length === 0) {
    return (
      <details className="hint" style={{ margin: "0 0 18px", padding: 12 }}>
        <summary style={{ cursor: "pointer", fontWeight: 600 }}>Thiết kế Figma (chưa có đề xuất)</summary>
        <div style={{ margin: "6px 0 10px" }}>Chưa có bản export Figma cho game này. Nhập ZIP do plugin export tạo ra để wizard đề xuất ảnh cho từng slot.</div>
        {error && <div style={{ color: "var(--warn)", marginBottom: 8 }}>{error}</div>}
        {toolbar}
      </details>
    );
  }

  const renderUrl = (nodeId: string) => `/api/figma/render?game=${gameId}&node=${encodeURIComponent(nodeId)}&v=${reload}`;

  // One Figma call for every proposed node and its alternatives: the render quota does not allow node-by-node requests.
  async function prefetchAll() {
    setError(null);
    setPrefetching(true);
    try {
      const res = await fetch("/api/figma/prefetch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ game: gameId, nodeIds: [...new Set(rows.flatMap((r) => r.alternatives.map((a) => a.nodeId)))] }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error ?? `Lỗi ${res.status}`);
      setMissing({});
      setReload((n) => n + 1);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setPrefetching(false);
    }
  }

  async function decide(s: FigmaSuggestionView, decision: Decision) {
    const slot = slotById.get(s.slotId)!;
    const nodeId = chosen[s.slotId] ?? s.nodeId;
    setError(null);
    setBusy(s.slotId);
    try {
      if (decision === "approved") {
        const res = await fetch(renderUrl(nodeId));
        if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? `Lỗi ${res.status}`);
        onApprove(slot, new File([await res.blob()], `figma-${nodeId.replace(/[:;]/g, "_")}.png`, { type: "image/png" }));
      } else if (decisions[s.slotId]?.decision === "approved") {
        onRevoke(slot);
      }
      const next = { ...saved, [s.slotId]: { nodeId, decision } };
      setSaved(next);
      try {
        localStorage.setItem(storageKey(gameId), JSON.stringify(next));
      } catch {
        // best-effort
      }
      // The verdicts are also kept on the server: they are the hand-checked mapping the matcher is measured against.
      void fetch("/api/figma/review", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ game: gameId, slotId: s.slotId, slotKey: `${slot.section}/${slot.previewPath.split("/").pop()}`, nodeId, decision }),
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  }

  const done = rows.filter((r) => decisions[r.slotId]).length;

  return (
    <details open className="hint" style={{ margin: "0 0 18px", padding: 12 }}>
      <summary style={{ cursor: "pointer", fontWeight: 600 }}>
        Gợi ý ảnh từ Figma ({rows.length} slot — đã duyệt {done})
      </summary>
      <div style={{ margin: "6px 0 10px" }}>
        Mỗi dòng: ảnh hiện tại của template → ảnh đề xuất từ thiết kế Figma của game mới. <strong>Duyệt</strong> đưa ảnh Figma vào slot
        (giống tải ảnh lên); <strong>Từ chối</strong> giữ ảnh cũ. Dòng &quot;Cần duyệt&quot; là chỗ máy không chắc — nhất là khi điểm thấp hoặc
        có nhiều ứng viên gần nhau.
      </div>
      {error && <div style={{ color: "var(--warn)", marginBottom: 8 }}>{error}</div>}
      {toolbar}
      {Object.keys(missing).length > 0 && (
        <div style={{ marginBottom: 8 }}>
          <button type="button" className="tile-btn primary" disabled={prefetching} onClick={prefetchAll}>
            {prefetching ? "Đang tải từ Figma…" : `Tải ảnh Figma còn thiếu (${Object.keys(missing).length} node chưa có)`}
          </button>{" "}
          <span className="hint" style={{ margin: 0 }}>Một lần gọi cho tất cả ứng viên; Figma giới hạn số lần gọi nên hãy bấm một lần.</span>
        </div>
      )}
      <div style={{ display: "grid", gap: 10 }}>
        {rows.map((s) => {
          const slot = slotById.get(s.slotId)!;
          const nodeId = chosen[s.slotId] ?? s.nodeId;
          const verdict = decisions[s.slotId];
          return (
            <div
              key={s.slotId}
              className="tile"
              style={{
                display: "grid",
                gridTemplateColumns: "150px 150px 1fr",
                gap: 12,
                alignItems: "center",
                outline: verdict ? `2px solid ${verdict.decision === "approved" ? "var(--accent)" : "var(--muted)"}` : undefined,
              }}
            >
              <div>
                <div className="hint" style={{ margin: 0 }}>Hiện tại</div>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={`/api/asset-image?path=${encodeURIComponent(slot.previewPath)}&game=${gameId}`} alt={slot.label} style={{ maxWidth: 150, maxHeight: 110, background: "#8899cc33" }} />
              </div>
              <div>
                <div className="hint" style={{ margin: 0 }}>Figma</div>
                {missing[nodeId] ? (
                  <div className="hint" style={{ margin: 0, width: 150, minHeight: 60 }}>Chưa có ảnh Figma cho node này.</div>
                ) : (
                  /* eslint-disable-next-line @next/next/no-img-element */
                  <img
                    src={renderUrl(nodeId)}
                    alt={s.nodeName}
                    onError={() => setMissing((p) => ({ ...p, [nodeId]: true }))}
                    style={{ maxWidth: 150, maxHeight: 110, background: "#8899cc33" }}
                  />
                )}
              </div>
              <div>
                <div style={{ fontWeight: 600 }}>
                  {slot.label} <span className="hint" style={{ margin: 0 }}>· {slot.sectionLabel} · {slot.sizeLabel}</span>
                  {s.poc && <span className="chip" style={{ marginLeft: 6 }}>PoC</span>}
                </div>
                <div style={{ fontSize: 12, margin: "2px 0" }}>
                  <span className={`chip${s.status === "review" ? " review" : ""}`} aria-pressed="true">
                    {s.status === "auto" ? "Tự động đề xuất" : "Cần duyệt"} · {Math.round(s.score * 100)}%
                  </span>{" "}
                  {s.exportKind === "render-solid" && <span className="hint" style={{ margin: 0 }}>nền một màu (được render)</span>}
                </div>
                <div className="hint" style={{ margin: "2px 0" }}>{s.reasons.join(" · ")} · cách ứng viên kế {Math.round(s.margin * 100)}%</div>
                <select
                  value={nodeId}
                  onChange={(e) => setChosen((p) => ({ ...p, [s.slotId]: e.target.value }))}
                  style={{ fontSize: 11, maxWidth: "100%" }}
                  title="Chọn node Figma khác nếu đề xuất sai"
                >
                  {s.alternatives.map((a) => (
                    <option key={a.nodeId} value={a.nodeId}>
                      {a.nodeName} ({a.nodeId}) — {Math.round(a.score * 100)}%
                    </option>
                  ))}
                </select>
                <div style={{ display: "flex", gap: 6, marginTop: 6 }}>
                  <button type="button" className="tile-btn primary" disabled={busy === s.slotId} onClick={() => decide(s, "approved")}>
                    {busy === s.slotId ? "Đang tải…" : verdict?.decision === "approved" ? "Đã duyệt ✓" : "Duyệt & dùng ảnh Figma"}
                  </button>
                  <button type="button" className="tile-btn" disabled={busy === s.slotId} onClick={() => decide(s, "rejected")}>
                    {verdict?.decision === "rejected" ? "Đã từ chối" : "Từ chối"}
                  </button>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </details>
  );
}
