"use client";

import { useMemo, useState } from "react";
import type { CloneSlot, CloneSlotTarget, PsdDevice } from "./types";
import type { PsdInfo, PsdLayerInfo } from "@/detector/psd-parse";
import { autoMatch, scorePair, type Confidence, type MatchLayer, type MatchTarget } from "@/detector/psd-match";
import Spinner from "../Spinner";

export interface PsdApplyEntry {
  slotId: string;
  device: CloneSlotTarget["device"];
  targetPaths: string[];
  file: File;
}

type LoadedPsd = PsdInfo & { fileName: string };

type Assignment =
  | { kind: "layer"; source: PsdDevice; layerId: number; auto: boolean; confidence?: Confidence; ambiguous?: boolean; pending?: boolean }
  | { kind: "file"; file: File; url: string };

interface Row {
  key: string;
  slot: CloneSlot;
  target: CloneSlotTarget;
}

const CONFIDENCE_LABEL: Record<Confidence, string> = { high: "Khớp cao", medium: "Khớp vừa", low: "Khớp thấp" };
const CONFIDENCE_COLOR: Record<Confidence, string> = { high: "#2e9e5b", medium: "#c98a00", low: "#d9534f" };

function layerUrl(psdId: string, layerId: number, thumb = false) {
  return `/api/psd/layer?psd=${psdId}&layer=${layerId}${thumb ? "&thumb=1" : ""}`;
}

function toMatchLayers(source: PsdDevice, psd: LoadedPsd | undefined): MatchLayer[] {
  return (psd?.layers ?? []).map((l) => ({ source, id: l.id, name: l.name, path: l.path, width: l.width, height: l.height }));
}

// Favicons / app icons / the Vite logo are generated from the brand mark, not drawn in the page design.
const NOT_IN_DESIGN_RE = /(^|\/)(favicon[^/]*|apple-touch-icon[^/]*|android-chrome-[^/]*|vite\.svg)$|\.ico$/i;
function isNotInDesign(slot: CloneSlot) {
  return slot.targetPaths.every((p) => NOT_IN_DESIGN_RE.test(p));
}

function fileNamesOf(target: CloneSlotTarget) {
  return target.targetPaths.map((p) => p.split("/").pop() ?? p);
}

export default function PsdMappingStep({
  gameId,
  slots,
  excludedIds,
  onApply,
  onContinue,
}: {
  gameId: string;
  slots: CloneSlot[];
  excludedIds: Record<string, boolean>;
  onApply: (entries: PsdApplyEntry[]) => void;
  onContinue: () => void;
}) {
  const [psds, setPsds] = useState<Partial<Record<PsdDevice, LoadedPsd>>>({});
  const [uploading, setUploading] = useState<PsdDevice | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [assign, setAssign] = useState<Record<string, Assignment | null>>({});
  const [pickerKey, setPickerKey] = useState<string | null>(null);
  const [urlDrafts, setUrlDrafts] = useState<Partial<Record<PsdDevice, string>>>({});
  const [applying, setApplying] = useState(false);
  const [appliedCount, setAppliedCount] = useState<number | null>(null);

  const rows: Row[] = useMemo(
    () =>
      slots
        .filter((s) => !excludedIds[s.id] && !isNotInDesign(s))
        .sort((a, b) => a.sectionOrder - b.sectionOrder)
        .flatMap((slot) => slot.targets.map((target) => ({ key: `${slot.id}::${target.device}`, slot, target }))),
    [slots, excludedIds]
  );

  // Which PSD feeds a target: mobile targets use the mobile PSD, desktop ones
  // the desktop PSD, and "shared" images use desktop (falling back to mobile).
  function sourceFor(target: CloneSlotTarget, loaded: Partial<Record<PsdDevice, LoadedPsd>>): PsdDevice | null {
    if (target.device === "mobile") return loaded.mobile ? "mobile" : null;
    if (target.device === "desktop") return loaded.desktop ? "desktop" : null;
    return loaded.desktop ? "desktop" : loaded.mobile ? "mobile" : null;
  }

  function matchTargetOf(row: Row): MatchTarget {
    return {
      key: row.key,
      label: row.slot.label,
      fileNames: fileNamesOf(row.target),
      width: row.target.width,
      height: row.target.height,
    };
  }

  function runAutoMatch(loaded: Partial<Record<PsdDevice, LoadedPsd>>, prev: Record<string, Assignment | null>) {
    const pools: Record<string, MatchLayer[]> = {};
    for (const row of rows) {
      const src = sourceFor(row.target, loaded);
      pools[row.key] = src ? toMatchLayers(src, loaded[src]) : [];
    }
    const matches = autoMatch(rows.map(matchTargetOf), pools);
    const next: Record<string, Assignment | null> = {};
    for (const row of rows) {
      const existing = prev[row.key];
      // Keep what the operator chose by hand; recompute everything else.
      if (existing && (existing.kind === "file" || !existing.auto)) {
        next[row.key] = existing;
        continue;
      }
      const m = matches[row.key];
      if (m) next[row.key] = { kind: "layer", source: m.source as PsdDevice, layerId: m.layerId, auto: true, confidence: m.confidence, ambiguous: m.ambiguous, pending: !(m.confidence === "high" || m.nameHit) };
    }
    return next;
  }

  async function uploadPsd(device: PsdDevice, src: File | string) {
    setUploading(device);
    setError(null);
    setAppliedCount(null);
    try {
      const form = new FormData();
      if (typeof src === "string") form.append("url", src);
      else form.append("file", src);
      const res = await fetch("/api/psd", { method: "POST", body: form });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error ?? `Lỗi ${res.status}`);
      const loaded = { ...psds, [device]: { ...(body as PsdInfo), fileName: (body as { fileName?: string }).fileName ?? (typeof src === "string" ? src : src.name) } };
      setPsds(loaded);
      setAssign((prev) => runAutoMatch(loaded, prev));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setUploading(null);
    }
  }

  function removePsd(device: PsdDevice) {
    const loaded = { ...psds };
    delete loaded[device];
    setPsds(loaded);
    setAppliedCount(null);
    setAssign((prev) => {
      const next: Record<string, Assignment | null> = {};
      for (const [k, a] of Object.entries(prev)) {
        if (a && a.kind === "layer" && a.source === device) continue;
        next[k] = a;
      }
      return next;
    });
  }

  function setAssignment(key: string, a: Assignment | null) {
    setAppliedCount(null);
    setAssign((prev) => ({ ...prev, [key]: a }));
  }

  function pickFile(row: Row, file: File | null) {
    if (!file) return;
    setAssignment(row.key, { kind: "file", file, url: URL.createObjectURL(file) });
  }

  // A suggestion that matched on shape/size alone is only a hint: checked against
  // a real PSD, such matches were mostly the wrong picture, so they wait for a click.
  const isPending = (a: Assignment | null | undefined) => a?.kind === "layer" && !!a.pending;
  const assignedRows = rows.filter((r) => assign[r.key] && !isPending(assign[r.key]));
  const pendingCount = rows.filter((r) => isPending(assign[r.key])).length;

  async function apply() {
    setApplying(true);
    setError(null);
    try {
      const entries: PsdApplyEntry[] = [];
      for (const row of assignedRows) {
        const a = assign[row.key]!;
        let file: File;
        if (a.kind === "file") {
          file = a.file;
        } else {
          const psd = psds[a.source];
          if (!psd) continue;
          const res = await fetch(layerUrl(psd.psdId, a.layerId));
          if (!res.ok) throw new Error("Không tải được layer từ PSD — hãy tải lại file PSD");
          const layer = psd.layers.find((l) => l.id === a.layerId);
          const safe = (layer?.name ?? `layer-${a.layerId}`).replace(/[^\w.-]+/g, "_");
          file = new File([await res.blob()], `${safe}.png`, { type: "image/png" });
        }
        entries.push({ slotId: row.slot.id, device: row.target.device, targetPaths: row.target.targetPaths, file });
      }
      onApply(entries);
      setAppliedCount(entries.length);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setApplying(false);
    }
  }

  function warningsFor(row: Row, layer: PsdLayerInfo): string[] {
    const { width: tw, height: th } = row.target;
    if (!tw || !th) return ["Chưa biết kích thước ảnh gốc — kiểm tra thủ công"];
    const out: string[] = [];
    if (layer.width < tw * 0.9 || layer.height < th * 0.9) {
      out.push(`Layer nhỏ hơn ảnh gốc (${layer.width}×${layer.height} < ${tw}×${th}) — ảnh sẽ bị phóng to, có thể mờ`);
    }
    if (Math.abs(Math.log(layer.width / layer.height / (tw / th))) > 0.05) {
      out.push("Tỉ lệ lệch ảnh gốc — ảnh sẽ bị cắt bớt");
    }
    return out;
  }

  const uploadBox = (device: PsdDevice, title: string) => {
    const psd = psds[device];
    return (
      <div className="card" style={{ flex: 1, minWidth: 260 }}>
        <h3 style={{ marginBottom: 6 }}>{title}</h3>
        {psd ? (
          <div style={{ fontSize: 12.5, lineHeight: 1.6 }}>
            <div className="mono" title={psd.fileName}>{psd.fileName}</div>
            <div className="hint" style={{ marginBottom: 6 }}>
              {psd.width}×{psd.height}px · {psd.layers.length} layer/nhóm dùng được
            </div>
            <button type="button" className="chip" onClick={() => removePsd(device)}>Bỏ file này</button>
          </div>
        ) : (
          <>
          <label className="tile-btn primary" style={{ display: "inline-block", cursor: uploading ? "wait" : "pointer" }}>
            {uploading === device ? <><Spinner />Đang phân tích PSD…</> : "Chọn file .psd"}
            <input
              type="file"
              accept=".psd"
              disabled={uploading !== null}
              style={{ display: "none" }}
              onChange={(e) => {
                const f = e.target.files?.[0];
                e.target.value = "";
                if (f) void uploadPsd(device, f);
              }}
            />
          </label>
          <div style={{ display: "flex", gap: 6, marginTop: 8 }}>
            <input
              type="text"
              placeholder="hoặc dán link .psd (Drive, Dropbox, link tải trực tiếp)"
              value={urlDrafts[device] ?? ""}
              disabled={uploading !== null}
              onChange={(e) => setUrlDrafts((d) => ({ ...d, [device]: e.target.value }))}
              style={{ flex: 1, fontSize: 12, minWidth: 0 }}
            />
            <button
              type="button"
              className="chip"
              disabled={uploading !== null || !(urlDrafts[device] ?? "").trim()}
              onClick={() => void uploadPsd(device, urlDrafts[device]!.trim())}
            >
              Tải link
            </button>
          </div>
          </>
        )}
      </div>
    );
  };

  const hasPsd = !!(psds.desktop || psds.mobile);
  const sections = [...new Set(rows.map((r) => r.slot.section))];

  return (
    <section className="block" style={{ marginTop: 24 }}>
      <h2>Ghép asset từ file thiết kế PSD</h2>
      <div className="hint">
        Bước này không bắt buộc. Tải PSD bản máy tính và/hoặc bản điện thoại — tool tự đề xuất layer cho từng asset dựa trên tỉ lệ và kích thước
        (tên layer chỉ để tham khảo). Chỉ tự gán khi có bằng chứng (tên layer khớp hoặc khớp rất sát); các dòng còn lại là gợi ý chờ bạn bấm duyệt, dòng trống thì chọn tay bằng &quot;Đổi layer&quot;. Bạn có thể đổi layer hoặc tải ảnh khác cho từng dòng trước khi áp dụng.
      </div>

      <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginTop: 12 }}>
        {uploadBox("desktop", "PSD máy tính (PC)")}
        {uploadBox("mobile", "PSD điện thoại (Mobile)")}
      </div>
      {error && <div style={{ color: "var(--warn)", fontSize: 12.5, marginTop: 10 }}>{error}</div>}

      {hasPsd && (
        <>
          <h3 style={{ marginTop: 24 }}>
            Danh sách asset sau khi ghép ({assignedRows.length}/{rows.length} đã có ảnh{pendingCount > 0 ? `, ${pendingCount} gợi ý chờ duyệt` : ""})
          </h3>
          {sections.map((section) => {
            const sectionRows = rows.filter((r) => r.slot.section === section);
            return (
              <div key={section} style={{ marginBottom: 20 }}>
                <h4 style={{ fontSize: 13, textTransform: "uppercase", letterSpacing: "0.04em", color: "var(--muted)", margin: "0 0 8px" }}>
                  {sectionRows[0].slot.sectionLabel}
                </h4>
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {sectionRows.map((row) => {
                    const a = assign[row.key];
                    const src = sourceFor(row.target, psds);
                    const layer = a?.kind === "layer" ? psds[a.source]?.layers.find((l) => l.id === a.layerId) : undefined;
                    const layerPsd = a?.kind === "layer" ? psds[a.source] : undefined;
                    const warns = layer ? warningsFor(row, layer) : [];
                    return (
                      <div key={row.key} className="card" style={{ padding: 10 }}>
                        <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
                          <div style={{ width: 120, textAlign: "center" }}>
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img
                              src={`/api/asset-image?path=${encodeURIComponent(row.target.previewPath)}&game=${gameId}`}
                              alt={row.slot.label}
                              style={{ maxWidth: 120, maxHeight: 80, objectFit: "contain", background: "rgba(128,128,128,.12)" }}
                            />
                            <div className="hint" style={{ margin: 0, fontSize: 10.5 }}>Ảnh gốc</div>
                          </div>
                          <span aria-hidden>←</span>
                          <div style={{ width: 120, textAlign: "center" }}>
                            {a ? (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img
                                src={a.kind === "file" ? a.url : layerUrl(layerPsd!.psdId, a.layerId, true)}
                                alt="ảnh mới"
                                style={{ maxWidth: 120, maxHeight: 80, objectFit: "contain", background: "rgba(128,128,128,.12)" }}
                              />
                            ) : (
                              <div className="hint" style={{ margin: 0, height: 80, display: "flex", alignItems: "center", justifyContent: "center" }}>
                                {src ? "Chưa ghép" : "Chưa có PSD cho thiết bị này"}
                              </div>
                            )}
                            <div className="hint" style={{ margin: 0, fontSize: 10.5 }}>Ảnh mới</div>
                          </div>
                          <div style={{ flex: 1, minWidth: 200, fontSize: 12.5, lineHeight: 1.55 }}>
                            <div>
                              <strong>{row.slot.label}</strong>{" "}
                              <span className="chip" style={{ fontSize: 10.5, padding: "0 6px" }}>{row.target.label}</span>
                            </div>
                            <div className="hint" style={{ margin: 0 }}>
                              Cần: {row.target.width && row.target.height ? `${row.target.width}×${row.target.height}px` : "không rõ kích thước"}
                            </div>
                            {a?.kind === "layer" && layer && (
                              <div style={{ marginTop: 2 }}>
                                Layer: <span className="mono">{layer.path}</span> ({layer.width}×{layer.height}px
                                {layer.kind === "group" ? ", nhóm" : ""}){" "}
                                {a.pending && (
                                  <>
                                    <span style={{ color: CONFIDENCE_COLOR.low, fontWeight: 600 }}>Gợi ý — chưa áp dụng, cần xem lại</span>{" "}
                                    <button type="button" className="chip" onClick={() => setAssignment(row.key, { ...a, pending: false, auto: false })}>
                                      Dùng layer này
                                    </button>
                                  </>
                                )}
                                {!a.pending && a.auto && a.confidence && (
                                  <span style={{ color: CONFIDENCE_COLOR[a.confidence], fontWeight: 600 }}>
                                    {CONFIDENCE_LABEL[a.confidence]}
                                    {a.ambiguous ? " · có layer tương tự, kiểm tra lại" : ""}
                                  </span>
                                )}
                                {!a.auto && <span className="hint" style={{ margin: 0 }}>(chọn tay)</span>}
                              </div>
                            )}
                            {a?.kind === "file" && <div style={{ marginTop: 2 }}>Ảnh tải lên: <span className="mono">{a.file.name}</span></div>}
                            {warns.map((w) => (
                              <div key={w} style={{ color: "var(--warn)" }}>⚠ {w}</div>
                            ))}
                          </div>
                          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                            <button type="button" className="tile-btn" disabled={!src} onClick={() => setPickerKey(pickerKey === row.key ? null : row.key)}>
                              {pickerKey === row.key ? "Đóng danh sách layer" : "Đổi layer"}
                            </button>
                            <label className="tile-btn">
                              Tải ảnh khác
                              <input type="file" accept="image/*" style={{ display: "none" }} onChange={(e) => { pickFile(row, e.target.files?.[0] ?? null); e.target.value = ""; }} />
                            </label>
                            {a && (
                              <button type="button" className="tile-btn" onClick={() => setAssignment(row.key, null)}>
                                Bỏ ghép (giữ ảnh gốc)
                              </button>
                            )}
                          </div>
                        </div>

                        {pickerKey === row.key && src && (
                          <LayerPicker
                            row={row}
                            psds={psds}
                            initialSource={src}
                            current={a?.kind === "layer" ? a : undefined}
                            matchTarget={matchTargetOf(row)}
                            onPick={(source, layerId) => {
                              setAssignment(row.key, { kind: "layer", source, layerId, auto: false });
                              setPickerKey(null);
                            }}
                          />
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </>
      )}

      <div style={{ marginTop: 24, display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
        {hasPsd && (
          <button className="rescan-btn btn-loading" style={{ marginLeft: 0 }} disabled={applying || assignedRows.length === 0} onClick={apply}>
            {applying ? <><Spinner />Đang xuất layer…</> : `Áp dụng ${assignedRows.length} ảnh`}
          </button>
        )}
        <button className="chip" onClick={onContinue}>
          {hasPsd ? "Tiếp tục →" : "Bỏ qua, tiếp tục →"}
        </button>
        {appliedCount !== null && (
          <span className="hint" style={{ margin: 0 }}>
            Đã áp dụng {appliedCount} ảnh — xem và chỉnh tiếp ở bước &quot;Nội dung &amp; hình ảnh&quot;.
          </span>
        )}
      </div>
    </section>
  );
}

function LayerPicker({
  psds,
  initialSource,
  current,
  matchTarget,
  onPick,
}: {
  row: Row;
  psds: Partial<Record<PsdDevice, LoadedPsd>>;
  initialSource: PsdDevice;
  current?: { source: PsdDevice; layerId: number };
  matchTarget: MatchTarget;
  onPick: (source: PsdDevice, layerId: number) => void;
}) {
  const [source, setSource] = useState<PsdDevice>(initialSource);
  const [query, setQuery] = useState("");
  const psd = psds[source];

  const sorted = useMemo(() => {
    if (!psd) return [];
    const q = query.trim().toLowerCase();
    return psd.layers
      .filter((l) => !q || l.path.toLowerCase().includes(q))
      .map((l) => ({ l, score: scorePair({ source, id: l.id, name: l.name, path: l.path, width: l.width, height: l.height }, matchTarget) }))
      .sort((a, b) => b.score - a.score || b.l.width * b.l.height - a.l.width * a.l.height);
  }, [psd, query, source, matchTarget]);

  return (
    <div style={{ marginTop: 10, borderTop: "1px solid var(--border, rgba(128,128,128,.3))", paddingTop: 10 }}>
      <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 8, flexWrap: "wrap" }}>
        {psds.desktop && psds.mobile && (
          <select value={source} onChange={(e) => setSource(e.target.value as PsdDevice)}>
            <option value="desktop">PSD máy tính</option>
            <option value="mobile">PSD điện thoại</option>
          </select>
        )}
        <input type="text" placeholder="Lọc theo tên layer / nhóm" value={query} onChange={(e) => setQuery(e.target.value)} style={{ minWidth: 220 }} />
        <span className="hint" style={{ margin: 0 }}>Layer phù hợp kích thước nhất xếp trước</span>
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, maxHeight: 280, overflowY: "auto" }}>
        {sorted.slice(0, 80).map(({ l, score }) => {
          const selected = current?.source === source && current.layerId === l.id;
          return (
            <button
              key={l.id}
              type="button"
              onClick={() => onPick(source, l.id)}
              title={l.path}
              style={{
                width: 110,
                padding: 4,
                textAlign: "center",
                cursor: "pointer",
                background: "none",
                color: "inherit",
                border: selected ? "2px solid var(--accent)" : "1px solid rgba(128,128,128,.35)",
                borderRadius: 6,
              }}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={layerUrl(psd!.psdId, l.id, true)} alt={l.name} loading="lazy" style={{ maxWidth: 100, maxHeight: 64, objectFit: "contain", background: "rgba(128,128,128,.12)" }} />
              <div style={{ fontSize: 10.5, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{l.name}</div>
              <div className="hint" style={{ margin: 0, fontSize: 10 }}>
                {l.width}×{l.height}{score > 0 ? " ✓" : ""}
              </div>
            </button>
          );
        })}
        {sorted.length === 0 && <div className="hint">Không có layer nào khớp bộ lọc.</div>}
      </div>
    </div>
  );
}
