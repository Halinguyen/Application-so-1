"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import type { CloneSlot, CloneParam, CloneExternalSlot, CloneTextSlot, CropAnchor } from "./types";
import Spinner from "../Spinner";
import AssetCompareTile from "./AssetCompareTile";
import ConfigStep from "./ConfigStep";
import HoverHint from "./HoverHint";
import PreviewPane, { type CloneResult, type PreviewResult } from "./PreviewPane";

const STEPS = [
  { n: 2, label: "Nội dung & hình ảnh" },
  { n: 3, label: "Cấu hình" },
  { n: 4, label: "Xem trước & Hoàn tất" },
] as const;

// Only plain strings/records are persisted — File objects can't be
// JSON-serialized, so an uploaded replacement is lost on refresh and the
// operator has to re-pick it. Everything else (which step they were on,
// typed text/config values, pasted URLs) survives an accidental reload.
interface PersistedState {
  currentStep: number;
  textValues: Record<string, string>;
  values: Record<string, string>;
  urlValues: Record<string, string>;
  externalUrlValues: Record<string, string>;
  excludedIds: Record<string, boolean>;
  projectName: string;
}

// Project name of the clone (becomes its GitLab project): "[game_code]-[game-name]",
// lowercase, no accents — e.g. "t050-ten-game". Game code = 1 letter + 3 digits.
const PROJECT_NAME_RE = /^[a-z][0-9]{3}-[a-z0-9]+(-[a-z0-9]+)*$/;

interface RepoResult {
  org: string;
  repo: string;
  repoUrl: string;
  created: boolean;
  branch: string;
  commit: string;
  updatedExisting: boolean;
  fileCount: number;
  totalBytes: number;
}

function storageKey(gameId: string) {
  return `wizard-state:${gameId}`;
}

function loadPersisted(gameId: string): Partial<PersistedState> {
  try {
    const raw = localStorage.getItem(storageKey(gameId));
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

export default function WizardShell({
  gameId,
  displayName,
  iconUrl,
  slots,
  params,
  externalSlots,
  textSlots,
}: {
  gameId: string;
  displayName?: string;
  iconUrl?: string | null;
  slots: CloneSlot[];
  params: CloneParam[];
  externalSlots: CloneExternalSlot[];
  textSlots: CloneTextSlot[];
}) {
  const persisted = useMemo(() => loadPersisted(gameId), [gameId]);

  const [currentStep, setCurrentStep] = useState<number>(persisted.currentStep ?? 2);
  const [files, setFiles] = useState<Record<string, File>>({});
  const [previews, setPreviews] = useState<Record<string, string>>({});
  const [urlValues, setUrlValues] = useState<Record<string, string>>(persisted.urlValues ?? {});
  const [anchors] = useState<Record<string, CropAnchor>>({});
  const [externalFiles, setExternalFiles] = useState<Record<string, File>>({});
  const [externalPreviews, setExternalPreviews] = useState<Record<string, string>>({});
  const [externalUrlValues, setExternalUrlValues] = useState<Record<string, string>>(
    persisted.externalUrlValues ?? {}
  );
  const [externalAnchors] = useState<Record<string, CropAnchor>>({});
  const [textValues, setTextValues] = useState<Record<string, string>>(
    persisted.textValues ?? Object.fromEntries(textSlots.map((t) => [t.id, t.defaultValue]))
  );
  const [values, setValues] = useState<Record<string, string>>(
    persisted.values ?? Object.fromEntries(params.map((p) => [p.envKey, p.defaultValue]))
  );
  // Assets the operator marked "không dùng" in step 2 — hidden from the
  // review gallery and skipped when building the clone request, but never
  // deleted from `slots`/`externalSlots` so a restore chip can bring them
  // back without re-running detection.
  const [excludedIds, setExcludedIds] = useState<Record<string, boolean>>(persisted.excludedIds ?? {});
  const [projectName, setProjectName] = useState<string>(persisted.projectName ?? "");
  const projectNameValid = PROJECT_NAME_RE.test(projectName);
  const [publishing, setPublishing] = useState(false);
  const [publishResult, setPublishResult] = useState<RepoResult | null>(null);
  const [publishError, setPublishError] = useState<{ message: string; secretFiles?: { file: string; key: string }[] } | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<CloneResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [previewing, setPreviewing] = useState(false);
  const [previewResult, setPreviewResult] = useState<PreviewResult | null>(null);

  useEffect(() => {
    const toSave: PersistedState = { currentStep, textValues, values, urlValues, externalUrlValues, excludedIds, projectName };
    try {
      localStorage.setItem(storageKey(gameId), JSON.stringify(toSave));
    } catch {
      // best-effort — private-browsing/storage-full shouldn't break the wizard
    }
  }, [gameId, currentStep, textValues, values, urlValues, externalUrlValues, excludedIds, projectName]);

  function setExcluded(id: string, excluded: boolean) {
    setExcludedIds((prev) => {
      if (!excluded) {
        const next = { ...prev };
        delete next[id];
        return next;
      }
      return { ...prev, [id]: true };
    });
  }

  // Step 4: create the GitHub repo for this clone and push the generated clone.
  async function publishRepo() {
    setPublishing(true);
    setPublishError(null);
    setPublishResult(null);
    try {
      const form = new FormData();
      form.append("gameId", gameId);
      form.append("projectName", projectName);
      const res = await fetch("/api/repo", { method: "POST", body: form });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setPublishError({ message: body.error ?? `Lỗi ${res.status}`, secretFiles: body.secretFiles });
      } else {
        setPublishResult(body as RepoResult);
      }
    } catch (e) {
      setPublishError({ message: e instanceof Error ? e.message : String(e) });
    } finally {
      setPublishing(false);
    }
  }

  const bySection = useMemo(() => {
    const map = new Map<string, CloneSlot[]>();
    for (const s of slots) {
      if (!map.has(s.section)) map.set(s.section, []);
      map.get(s.section)!.push(s);
    }
    // Top-to-bottom page order (see sectionOrder), not alphabetical, so the
    // list reads like the site the operator is picturing.
    return [...map.entries()].sort(
      (a, b) => (a[1][0]?.sectionOrder ?? 0) - (b[1][0]?.sectionOrder ?? 0) || a[0].localeCompare(b[0])
    );
  }, [slots]);

  function onFilePicked(slot: CloneSlot, file: File | null) {
    setFiles((prev) => {
      const next = { ...prev };
      if (file) next[slot.id] = file;
      else delete next[slot.id];
      return next;
    });
    setPreviews((prev) => {
      const next = { ...prev };
      if (file) next[slot.id] = URL.createObjectURL(file);
      else delete next[slot.id];
      return next;
    });
    if (file) setUrlValues((prev) => { const next = { ...prev }; delete next[slot.id]; return next; });
  }

  function onUrlPasted(slot: CloneSlot, raw: string) {
    const url = raw.trim();
    setUrlValues((prev) => {
      const next = { ...prev };
      if (url) next[slot.id] = url;
      else delete next[slot.id];
      return next;
    });
    if (url) {
      setFiles((prev) => { const next = { ...prev }; delete next[slot.id]; return next; });
      setPreviews((prev) => { const next = { ...prev }; delete next[slot.id]; return next; });
    }
  }

  function clearSlot(slot: CloneSlot) {
    onFilePicked(slot, null);
    setUrlValues((prev) => { const next = { ...prev }; delete next[slot.id]; return next; });
  }

  function onExternalFilePicked(slot: CloneExternalSlot, file: File | null) {
    setExternalFiles((prev) => {
      const next = { ...prev };
      if (file) next[slot.id] = file;
      else delete next[slot.id];
      return next;
    });
    setExternalPreviews((prev) => {
      const next = { ...prev };
      if (file) next[slot.id] = URL.createObjectURL(file);
      else delete next[slot.id];
      return next;
    });
    if (file) setExternalUrlValues((prev) => { const next = { ...prev }; delete next[slot.id]; return next; });
  }

  function onExternalUrlPasted(slot: CloneExternalSlot, raw: string) {
    const url = raw.trim();
    setExternalUrlValues((prev) => {
      const next = { ...prev };
      if (url) next[slot.id] = url;
      else delete next[slot.id];
      return next;
    });
    if (url) {
      setExternalFiles((prev) => { const next = { ...prev }; delete next[slot.id]; return next; });
      setExternalPreviews((prev) => { const next = { ...prev }; delete next[slot.id]; return next; });
    }
  }

  function clearExternalSlot(slot: CloneExternalSlot) {
    onExternalFilePicked(slot, null);
    setExternalUrlValues((prev) => { const next = { ...prev }; delete next[slot.id]; return next; });
  }

  async function generateClone() {
    setSubmitting(true);
    setError(null);
    setResult(null);
    setPreviewResult(null);
    try {
      const form = new FormData();
      form.append("gameId", gameId);
      form.append("projectName", projectName);
      for (const slot of slots) {
        if (excludedIds[slot.id]) continue;
        const file = files[slot.id];
        const url = urlValues[slot.id];
        const key = `file:${JSON.stringify({ targetPaths: slot.targetPaths, anchor: anchors[slot.id] || "attention" })}`;
        if (file) form.append(key, file);
        else if (url) form.append(key, url);
      }
      for (const slot of externalSlots) {
        if (excludedIds[slot.id]) continue;
        const file = externalFiles[slot.id];
        const url = externalUrlValues[slot.id];
        const key = `external:${JSON.stringify({
          url: slot.url,
          localPath: slot.localPath,
          refFiles: slot.refFiles,
          anchor: externalAnchors[slot.id] || "attention",
        })}`;
        if (file) form.append(key, file);
        else if (url) form.append(key, url);
      }
      const expanded: Record<string, string> = { ...values };
      for (const p of params) {
        for (const extra of p.alsoEnvKeys ?? []) expanded[extra] = values[p.envKey] ?? "";
      }
      for (const [envKey, value] of Object.entries(expanded)) {
        if (value.trim() !== "") form.append(`param:${envKey}`, value.trim());
      }
      for (const slot of textSlots) {
        const value = textValues[slot.id];
        if (value && value.trim() !== "" && value.trim() !== slot.defaultValue) {
          form.append(`text:${slot.id}`, value.trim());
        }
      }
      const res = await fetch("/api/clone", { method: "POST", body: form });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Không tạo được bản sao");
      setResult(json);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSubmitting(false);
    }
  }

  async function startPreview() {
    setPreviewing(true);
    setPreviewResult(null);
    try {
      const res = await fetch(`/api/clone/preview?game=${gameId}`, { method: "POST" });
      const json = await res.json();
      setPreviewResult(json);
    } catch (e) {
      setPreviewResult({ error: e instanceof Error ? e.message : String(e) });
    } finally {
      setPreviewing(false);
    }
  }

  const replacedCount =
    Object.keys(files).length +
    Object.keys(urlValues).length +
    Object.keys(externalFiles).length +
    Object.keys(externalUrlValues).length;

  return (
    <div className="wrap" style={{ paddingTop: 28 }}>
      <header style={{ marginBottom: 8 }}>
        <h1>Tạo bản sao website</h1>
        <div className="subtitle" style={{ color: "var(--muted)", fontSize: 13, marginTop: 4 }}>
          Game:{" "}
          {iconUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={iconUrl} alt="" width={22} height={22} style={{ borderRadius: 5, verticalAlign: "middle", marginRight: 4 }} />
          )}
          <strong>{displayName ?? gameId}</strong> —{" "}
          <Link href="/" style={{ color: "var(--accent)" }}>
            đổi game khác
          </Link>
        </div>
      </header>

      <nav className="wizard-steps">
        <div className="wizard-step done">1. Chọn game</div>
        {STEPS.map((s) => (
          <button
            key={s.n}
            type="button"
            className={`wizard-step${currentStep === s.n ? " active" : currentStep > s.n ? " done" : ""}`}
            onClick={() => setCurrentStep(s.n)}
          >
            {s.n}. {s.label}
          </button>
        ))}
      </nav>

      {currentStep === 2 && (
        <section className="block" style={{ marginTop: 24 }}>
          {textSlots.length > 0 && (
            <div style={{ marginBottom: 28 }}>
              <h2>Nội dung chữ</h2>
              <div className="hint">Tiêu đề, mô tả trang, tên game hiển thị — sửa trực tiếp bên dưới.</div>
              <div style={{ marginTop: 8, display: "flex", flexDirection: "column", gap: 10, maxWidth: 560 }}>
                {textSlots.map((slot) => (
                  <label key={slot.id} style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 12.5 }}>
                    <span>{slot.label}</span>
                    <input
                      type="text"
                      value={textValues[slot.id] ?? ""}
                      onChange={(e) => setTextValues((v) => ({ ...v, [slot.id]: e.target.value }))}
                      placeholder={slot.defaultValue}
                    />
                  </label>
                ))}
              </div>
            </div>
          )}

          <h2>Hình ảnh & video ({slots.length} mục)</h2>
          <div className="hint">
            Sắp xếp theo vị trí trên trang, từ trên xuống dưới (đầu trang → nội dung → chân trang). Gồm cả favicon và icon trang. Để trống ô nào thì giữ nguyên ảnh gốc của ô đó.
          </div>
          <ul className="hint" style={{ margin: "6px 0 12px 18px", lineHeight: 1.6 }}>
            <li><strong>Khu vực</strong>: ảnh nằm ở phần nào của trang.</li>
            <li><strong>Kích thước ảnh gốc</strong>: nên chọn ảnh có cùng tỉ lệ; tool tự cắt và nén cho vừa.</li>
            <li><strong>Hiển thị / Mỗi thiết bị dùng ảnh riêng</strong>: cho biết ảnh bạn tải lên sẽ thay ở máy tính, máy tính bảng hay điện thoại.</li>
            <li><strong>Tải ảnh mới lên</strong>: thay ảnh. <strong>Không dùng asset này</strong>: ẩn ảnh, không đưa vào bản sao (bấm ↺ ở mục "Đã ẩn" để hiện lại).</li>
          </ul>
          {bySection.map(([section, sectionSlots], sectionIndex) => {
            const visibleSlots = sectionSlots.filter((s) => !excludedIds[s.id]);
            const hiddenSlots = sectionSlots.filter((s) => excludedIds[s.id]);
            return (
              <div key={section} style={{ marginBottom: 24 }}>
                <h3 style={{ fontSize: 14, textTransform: "uppercase", letterSpacing: "0.04em", color: "var(--muted)", marginBottom: sectionSlots[0]?.sectionPosition ? 2 : 8 }}>
                  {sectionIndex + 1}. {sectionSlots[0]?.sectionLabel ?? section} ({visibleSlots.length})
                </h3>
                {sectionSlots[0]?.sectionPosition && (
                  <div className="hint" style={{ marginBottom: 8 }}>
                    {sectionSlots[0].sectionPosition}
                  </div>
                )}
                <div className="gallery">
                  {visibleSlots.map((slot) => (
                    <AssetCompareTile
                      key={slot.id}
                      slot={slot}
                      originalUrl={`/api/asset-image?path=${encodeURIComponent(slot.previewPath)}&game=${gameId}`}
                      replacedPreviewUrl={previews[slot.id] || urlValues[slot.id] || null}
                      hasReplacement={!!files[slot.id] || !!urlValues[slot.id]}
                      onFilePicked={(f) => onFilePicked(slot, f)}
                      onUrlPasted={(u) => onUrlPasted(slot, u)}
                      onClear={() => clearSlot(slot)}
                      onExclude={() => setExcluded(slot.id, true)}
                    />
                  ))}
                </div>
                {hiddenSlots.length > 0 && (
                  <div style={{ marginTop: 8, display: "flex", flexWrap: "wrap", gap: 6, alignItems: "center" }}>
                    <span className="hint" style={{ marginBottom: 0 }}>Đã ẩn ({hiddenSlots.length}):</span>
                    {hiddenSlots.map((slot) => (
                      <button
                        key={slot.id}
                        type="button"
                        className="chip"
                        onClick={() => setExcluded(slot.id, false)}
                        title="Hiện lại asset này"
                      >
                        {slot.label} ↺
                      </button>
                    ))}
                  </div>
                )}
              </div>
            );
          })}

          {externalSlots.length > 0 && (
            <div style={{ marginTop: 24 }}>
              <h2>Asset tải từ CDN ngoài ({externalSlots.length})</h2>
              <div className="hint">
                Ảnh/video này nằm ở máy chủ ngoài, không phải file trong repo — tải file mới lên đây để thay.
              </div>
              <div className="gallery">
                {externalSlots.filter((slot) => !excludedIds[slot.id]).map((slot) => {
                  const replaced = !!externalFiles[slot.id] || !!externalUrlValues[slot.id];
                  return (
                    <HoverHint
                      key={slot.id}
                      className="tile"
                      style={replaced ? { outline: "2px solid var(--accent)" } : undefined}
                      hint={
                        <>
                          <div className="hover-hint-title">{slot.label}</div>
                          <div>
                            <strong>Khu vực:</strong> {slot.sectionLabel} — đang lấy từ máy chủ ngoài (CDN)
                          </div>
                          <div>{slot.responsiveLabel}</div>
                        </>
                      }
                    >
                      <div className="thumb">
                        {slot.type === "video" ? (
                          <video src={externalPreviews[slot.id] || externalUrlValues[slot.id] || slot.url} muted controls style={{ width: "100%" }} />
                        ) : (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={externalPreviews[slot.id] || externalUrlValues[slot.id] || slot.url} alt={slot.label} />
                        )}
                        {replaced && <span className="badge">Đã thay</span>}
                      </div>
                      <div className="meta">
                        <div className="fname" title={slot.label}>{slot.label}</div>
                        <label className="tile-btn primary" style={{ marginTop: 8 }}>
                          {externalFiles[slot.id] ? "Đổi file khác" : "Tải file mới lên"}
                          <input
                            type="file"
                            accept={slot.type === "video" ? "video/*" : "image/*"}
                            style={{ display: "none" }}
                            onChange={(e) => onExternalFilePicked(slot, e.target.files?.[0] ?? null)}
                          />
                        </label>
                        <input
                          type="text"
                          placeholder={`hoặc dán link ${slot.type === "video" ? "video" : "ảnh"}`}
                          value={externalUrlValues[slot.id] ?? ""}
                          onChange={(e) => onExternalUrlPasted(slot, e.target.value)}
                          style={{ fontSize: 10, width: "100%", marginTop: 4 }}
                        />
                        {replaced && (
                          <button
                            type="button"
                            onClick={() => clearExternalSlot(slot)}
                            style={{ fontSize: 10, color: "var(--muted)", background: "none", border: "none", cursor: "pointer", padding: 0, marginTop: 2 }}
                          >
                            bỏ thay đổi
                          </button>
                        )}
                        <button
                          type="button"
                          className="tile-btn"
                          onClick={() => setExcluded(slot.id, true)}
                          title="Ẩn khỏi danh sách — không áp dụng vào bản sao"
                        >
                          Không dùng asset này
                        </button>
                      </div>
                    </HoverHint>
                  );
                })}
              </div>
              {externalSlots.some((s) => excludedIds[s.id]) && (
                <div style={{ marginTop: 8, display: "flex", flexWrap: "wrap", gap: 6, alignItems: "center" }}>
                  <span className="hint" style={{ marginBottom: 0 }}>
                    Đã ẩn ({externalSlots.filter((s) => excludedIds[s.id]).length}):
                  </span>
                  {externalSlots.filter((s) => excludedIds[s.id]).map((slot) => (
                    <button
                      key={slot.id}
                      type="button"
                      className="chip"
                      onClick={() => setExcluded(slot.id, false)}
                      title="Hiện lại asset này"
                    >
                      {slot.label} ↺
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          <div style={{ marginTop: 24 }}>
            <button className="rescan-btn" style={{ marginLeft: 0 }} onClick={() => setCurrentStep(3)}>
              Tiếp tục →
            </button>
          </div>
        </section>
      )}

      {currentStep === 3 && (
        <section className="block" style={{ marginTop: 24 }}>
          <h2>Thông tin bản sao</h2>
          <div className="hint">
            GameId dùng chung cho lấy cấu hình (nút tải, liên kết) và bảng xếp hạng của bản sao. Các giá trị khác lấy nguyên theo game được clone.
          </div>
          <ConfigStep params={params} values={values} onChange={(k, v) => setValues((old) => ({ ...old, [k]: v }))} />
          <div className="card" style={{ marginTop: 14 }}>
            <h3>Tên dự án</h3>
            <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 12.5, marginTop: 12 }}>
              <span>Tên dự án *</span>
              <input
                type="text"
                value={projectName}
                onChange={(e) => setProjectName(e.target.value.trim().toLowerCase())}
                placeholder="t050-ten-game"
                aria-invalid={projectName !== "" && !projectNameValid}
              />
            </label>
            <div className="hint" style={{ marginTop: 6 }}>
              Định dạng <strong>[mã game]-[tên game]</strong>: chữ thường không dấu, nối bằng dấu gạch ngang. Mã game gồm 1 chữ cái và 3 chữ số. Ví dụ: t050-ten-game.
            </div>
            {projectName !== "" && !projectNameValid && (
              <div style={{ color: "var(--warn)", fontSize: 12, marginTop: 4 }}>
                Tên chưa đúng định dạng [mã game]-[tên game] (ví dụ: t050-ten-game).
              </div>
            )}
          </div>
          <div style={{ marginTop: 24, display: "flex", gap: 10 }}>
            <button className="chip" onClick={() => setCurrentStep(2)}>
              ← Quay lại
            </button>
            <button
              className="rescan-btn"
              style={{ marginLeft: 0 }}
              disabled={!projectNameValid}
              title={projectNameValid ? undefined : "Nhập tên dự án đúng định dạng [mã game]-[tên game] để tiếp tục"}
              onClick={() => setCurrentStep(4)}
            >
              Tiếp tục →
            </button>
          </div>
        </section>
      )}

      {currentStep === 4 && (
        <section className="block" style={{ marginTop: 24 }}>
          <h2>Xem trước & Hoàn tất</h2>
          <PreviewPane
            gameId={gameId}
            replacedCount={replacedCount}
            submitting={submitting}
            result={result}
            error={error}
            previewing={previewing}
            previewResult={previewResult}
            onGenerate={generateClone}
            onStartPreview={startPreview}
          />
          <div className="card" style={{ marginTop: 24 }}>
            <h3>Tạo repo trên GitHub</h3>
            <div className="hint" style={{ marginTop: 6 }}>
              Tạo repo private <strong>{projectName || "[mã game]-[tên game]"}</strong> trong organization và đẩy bản clone vừa tạo
              (không gồm node_modules, .next, file log và file .env). Bấm Generate Clone trước.
            </div>
            <div style={{ marginTop: 12 }}>
              <button
                className="rescan-btn btn-loading"
                style={{ marginLeft: 0 }}
                disabled={publishing || !result || !projectNameValid}
                title={
                  !result
                    ? "Bấm Generate Clone trước"
                    : !projectNameValid
                      ? "Tên dự án chưa đúng định dạng"
                      : undefined
                }
                onClick={publishRepo}
              >
                {publishing ? <><Spinner />Đang tạo repo và đẩy code…</> : "Tạo repo trên GitHub"}
              </button>
            </div>
            {publishing && (
              <>
                <div className="progress-note">
                  <Spinner /> Đang kiểm tra file, tạo repo và đẩy code lên GitHub — có thể mất một lúc với bản clone lớn.
                </div>
                <div className="progress-bar" />
              </>
            )}
            {publishError && (
              <div style={{ color: "var(--warn)", fontSize: 12.5, marginTop: 10 }}>
                {publishError.message}
                {publishError.secretFiles && (
                  <ul style={{ margin: "6px 0 0 18px" }}>
                    {publishError.secretFiles.map((h, i) => (
                      <li key={i} className="mono">
                        {h.file} — {h.key}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}
            {publishResult && (
              <div style={{ fontSize: 12.5, marginTop: 10, lineHeight: 1.7 }}>
                {publishResult.created ? "Đã tạo repo mới" : "Repo đã có sẵn — đã đẩy thêm một commit"}:{" "}
                <a href={publishResult.repoUrl} target="_blank" rel="noreferrer" style={{ color: "var(--accent)" }}>
                  {publishResult.repoUrl}
                </a>
                <div className="hint" style={{ marginBottom: 0 }}>
                  Nhánh {publishResult.branch} · commit <span className="mono">{publishResult.commit.slice(0, 8)}</span> ·{" "}
                  {publishResult.fileCount} file · {(publishResult.totalBytes / 1048576).toFixed(1)} MB
                </div>
              </div>
            )}
          </div>
          <div style={{ marginTop: 24 }}>
            <button className="chip" onClick={() => setCurrentStep(3)}>
              ← Quay lại
            </button>
          </div>
        </section>
      )}
    </div>
  );
}
