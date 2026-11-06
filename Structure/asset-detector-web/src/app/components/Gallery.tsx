"use client";

import { useMemo, useState } from "react";

export interface GalleryAsset {
  id: string;
  fileName: string;
  canonicalPath: string;
  gameId: string;
  section: string;
  confidence: number;
  referenceCount: number;
  needsManualReview: boolean;
  isAutoManaged: boolean;
  isExternal: boolean;
  externalUrl?: string;
}

export default function Gallery({ assets }: { assets: GalleryAsset[] }) {
  const sections = useMemo(
    () => [...new Set(assets.map((a) => a.section))].sort(),
    [assets]
  );
  const [activeSection, setActiveSection] = useState("all");
  const [reviewOnly, setReviewOnly] = useState(false);

  const filtered = assets.filter(
    (a) =>
      (activeSection === "all" || a.section === activeSection) &&
      (!reviewOnly || a.needsManualReview)
  );
  const reviewCount = assets.filter((a) => a.needsManualReview).length;

  return (
    <div>
      <div className="filters">
        <button
          className="chip"
          aria-pressed={activeSection === "all"}
          onClick={() => setActiveSection("all")}
        >
          All ({assets.length})
        </button>
        {sections.map((s) => (
          <button
            key={s}
            className="chip"
            aria-pressed={activeSection === s}
            onClick={() => setActiveSection(s)}
          >
            {s}
          </button>
        ))}
        <button
          className="chip review"
          aria-pressed={reviewOnly}
          onClick={() => setReviewOnly((v) => !v)}
        >
          Needs review only ({reviewCount})
        </button>
      </div>

      <div className="gallery">
        {filtered.map((a) => (
          <div key={a.id} className={`tile${a.needsManualReview ? " review" : ""}`}>
            <div className="thumb">
              {a.isExternal ? (
                <div className="noimg">
                  external CDN
                  <br />
                  (not embeddable)
                </div>
              ) : (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={`/api/asset-image?path=${encodeURIComponent(a.canonicalPath)}&game=${a.gameId}`}
                  alt={a.fileName}
                  loading="lazy"
                />
              )}
              <span className="badge">{Math.round(a.confidence * 100)}%</span>
            </div>
            <div className="meta">
              <div className="fname" title={a.canonicalPath}>
                {a.fileName}
              </div>
              <div className="frow">
                <span className="sec">{a.section}</span>
                <span className="refs">
                  {a.referenceCount} ref{a.referenceCount === 1 ? "" : "s"}
                </span>
              </div>
            </div>
          </div>
        ))}
      </div>

      <div style={{ marginTop: 12, fontSize: 12, color: "var(--muted)" }}>
        Showing {filtered.length} of {assets.length} assets
      </div>
    </div>
  );
}
