"use client";

import { useState } from "react";
import Spinner from "../Spinner";

interface ReplacedFile {
  targetPath: string;
  originalBytes: number;
  finalBytes: number;
  resized: boolean;
}

interface ExternalReplaced {
  id: string;
  url: string;
  localPath: string;
  refFilesPatched: string[];
  originalBytes: number;
  finalBytes: number;
  resized: boolean;
}

export interface CloneResult {
  cloneDir: string;
  filesReplaced: ReplacedFile[];
  externalReplaced: ExternalReplaced[];
  textReplaced: string[];
  envWritten: number;
  warnings?: string[];
}

export interface PreviewResult {
  gameId?: string;
  port?: number;
  url?: string;
  ready?: boolean;
  alreadyRunning?: boolean;
  error?: string;
  manualCommand?: string;
}

export default function PreviewPane({
  gameId,
  replacedCount,
  submitting,
  result,
  error,
  previewing,
  previewResult,
  onGenerate,
  onStartPreview,
}: {
  gameId: string;
  replacedCount: number;
  submitting: boolean;
  result: CloneResult | null;
  error: string | null;
  previewing: boolean;
  previewResult: PreviewResult | null;
  onGenerate: () => void;
  onStartPreview: () => void;
}) {
  const [loadedUrl, setLoadedUrl] = useState<string | null>(null);
  const frameLoaded = !!previewResult?.url && loadedUrl === previewResult.url;

  return (
    <div>
      <div className="hint">
        Xem lại những gì đã thay đổi, tạo bản sao chạy thật, rồi xem trước trước khi bàn giao.
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap", marginTop: 16 }}>
        <button className="rescan-btn btn-loading" style={{ marginLeft: 0 }} onClick={onGenerate} disabled={submitting}>
          {submitting ? <><Spinner />Đang tạo…</> : `Tạo bản sao (${replacedCount} mục đã thay)`}
        </button>
        {result && (
          <button className="chip btn-loading" onClick={onStartPreview} disabled={previewing}>
            {previewing ? <><Spinner />Đang khởi động…</> : "Xem trước"}
          </button>
        )}
      </div>

      {submitting && (
        <>
          <div className="progress-note">
            <Spinner /> Đang xử lý ảnh/video, ghi cấu hình và tạo bản sao — vui lòng không đóng trang.
          </div>
          <div className="progress-bar" />
        </>
      )}
      {previewing && (
        <>
          <div className="progress-note">
            <Spinner /> Đang khởi động bản xem trước (lần đầu có thể cần vài chục giây)…
          </div>
          <div className="progress-bar" />
        </>
      )}

      {error && (
        <div className="ext-note" style={{ marginTop: 12, borderColor: "var(--warn)" }}>
          Có lỗi khi tạo bản sao: {error}
        </div>
      )}

      {result && (
        <div className="ext-note" style={{ marginTop: 12 }}>
          <div style={{ fontWeight: 600, marginBottom: 6 }}>Đã tạo bản sao thành công</div>
          <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13, lineHeight: 1.7 }}>
            <li>{result.filesReplaced.length} ảnh/video đã thay</li>
            <li>{result.externalReplaced?.length ?? 0} asset ngoài (CDN) đã thay</li>
            <li>{result.textReplaced?.length ?? 0} đoạn text đã sửa</li>
            <li>{result.envWritten} cấu hình đã ghi</li>
          </ul>
          {result.warnings && result.warnings.length > 0 && (
            <div style={{ marginTop: 10 }}>
              <div style={{ fontWeight: 600, color: "var(--warn)" }}>Một số mục bị bỏ qua:</div>
              <ul style={{ margin: "4px 0 0", paddingLeft: 18, fontSize: 12.5, color: "var(--warn)" }}>
                {result.warnings.map((w, i) => (
                  <li key={i}>{w}</li>
                ))}
              </ul>
            </div>
          )}
          <details style={{ marginTop: 10 }}>
            <summary style={{ fontSize: 11, color: "var(--muted)", cursor: "pointer" }}>Chi tiết kỹ thuật</summary>
            <div className="mono" style={{ fontSize: 10.5, color: "var(--muted)", marginTop: 6 }}>
              Thư mục: {result.cloneDir}
            </div>
          </details>
        </div>
      )}

      {previewResult && (!previewResult.gameId || previewResult.gameId === gameId) && (
        <div style={{ marginTop: 16 }}>
          {previewResult.url ? (
            <>
              <div style={{ fontSize: 12.5, color: "var(--muted)", marginBottom: 8 }}>
                {previewResult.alreadyRunning
                  ? "Bản xem trước đang chạy sẵn:"
                  : previewResult.ready
                    ? "Bản xem trước đã sẵn sàng:"
                    : "Đang khởi động bản xem trước — có thể mất vài giây…"}
              </div>
              <div style={{ fontSize: 12, marginBottom: 6 }}>
                Game: <strong>{gameId}</strong> —{" "}
                <a href={previewResult.url} target="_blank" rel="noreferrer" className="mono">
                  {previewResult.url}
                </a>
              </div>
              <div className="preview-frame-wrap">
              {!frameLoaded && (
                <div className="preview-frame-loading">
                  <Spinner />
                  Đang tải bản xem trước…
                </div>
              )}
              <iframe
                key={previewResult.url}
                onLoad={() => setLoadedUrl(previewResult.url ?? null)}
                src={previewResult.url}
                title="Xem trước"
                style={{
                  width: "100%",
                  height: 640,
                  border: "1px solid var(--border)",
                  borderRadius: 10,
                  background: "var(--surface)",
                }}
              />
              </div>
            </>
          ) : (
            <div className="ext-note" style={{ borderColor: "var(--warn)" }}>
              {previewResult.error}
              {previewResult.manualCommand && (
                <>
                  <br />
                  Chạy thủ công: <span className="mono">{previewResult.manualCommand}</span>
                </>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
