"use client";

import { useState } from "react";
import type { CloneSlot } from "./types";
import HoverHint from "./HoverHint";

export default function AssetCompareTile({
  slot,
  originalUrl,
  replacedPreviewUrl,
  hasReplacement,
  onFilePicked,
  onUrlPasted,
  onClear,
  onExclude,
}: {
  slot: CloneSlot;
  originalUrl: string;
  replacedPreviewUrl: string | null;
  hasReplacement: boolean;
  onFilePicked: (file: File | null) => void;
  onUrlPasted: (url: string) => void;
  onClear: () => void;
  onExclude: () => void;
}) {
  const [showingAfter, setShowingAfter] = useState(true);
  const [urlDraft, setUrlDraft] = useState("");

  const displayUrl = hasReplacement && showingAfter ? replacedPreviewUrl || originalUrl : originalUrl;

  // The explanation lives in a hover card (not inside the tile) so tiles stay short.
  const hint = (
    <>
      <div className="hover-hint-title">{slot.label}</div>
      <div>
        <strong>Khu vực:</strong> {slot.sectionLabel}
        {slot.sectionPosition ? ` — ${slot.sectionPosition}` : ""}
      </div>
      {slot.needsVisualProof && (
        <div style={{ color: "var(--warn)" }}>Vị trí nhỏ/chi tiết, đối chiếu kỹ ảnh xem trước.</div>
      )}
      {slot.sizeLabel && (
        <div>
          <strong>Kích thước ảnh gốc:</strong> {slot.sizeLabel} — ảnh mới sẽ tự được cắt và nén cho khớp.
        </div>
      )}
      <div>{slot.responsiveLabel}</div>
    </>
  );

  return (
    <HoverHint
      className="tile compare-tile"
      style={hasReplacement ? { outline: "2px solid var(--accent)" } : undefined}
      hint={hint}
    >
      <div className="thumb">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={displayUrl} alt={slot.label} />
        <span className="hint-dot" aria-hidden>
          ⓘ
        </span>
        {hasReplacement && <span className="badge">Đã thay</span>}
        {hasReplacement && (
          <button
            type="button"
            className="compare-toggle"
            onClick={() => setShowingAfter((v) => !v)}
            title="So sánh trước / sau"
          >
            {showingAfter ? "Sau" : "Trước"}
          </button>
        )}
      </div>
      <div className="meta">
        <div className="fname" title={slot.label}>
          {slot.label}
        </div>
        <label className="tile-btn primary" style={{ marginTop: 8 }}>
          {hasReplacement ? "Đổi ảnh khác" : "Tải ảnh mới lên"}
          <input
            type="file"
            accept="image/*"
            style={{ display: "none" }}
            onChange={(e) => onFilePicked(e.target.files?.[0] ?? null)}
          />
        </label>
        <input
          type="text"
          placeholder="hoặc dán link ảnh"
          value={urlDraft}
          onChange={(e) => {
            setUrlDraft(e.target.value);
            onUrlPasted(e.target.value);
          }}
          style={{ fontSize: 10, width: "100%", marginTop: 4 }}
        />
        {hasReplacement && (
          <button
            type="button"
            onClick={() => {
              setUrlDraft("");
              onClear();
            }}
            style={{ fontSize: 10, color: "var(--muted)", background: "none", border: "none", cursor: "pointer", padding: 0, marginTop: 2 }}
          >
            bỏ thay đổi
          </button>
        )}
        <button
          type="button"
          className="tile-btn"
          onClick={onExclude}
          title="Ẩn khỏi danh sách — không áp dụng vào bản sao"
        >
          Không dùng asset này
        </button>
      </div>
    </HoverHint>
  );
}
