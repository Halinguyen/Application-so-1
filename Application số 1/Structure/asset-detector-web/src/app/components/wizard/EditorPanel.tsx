"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import protocol from "../../../../public/ve/protocol.js";
import type { EditManifest, LayoutBreakpoint, LayoutConflicts, LayoutFile } from "@/detector/layout-schema";
import { matchMediaToSlot, type EditSlot } from "@/detector/asset-match";
import type { RouteInfo } from "@/detector/routes";
import { fillRoute, paramsOf } from "@/detector/route-path";

interface Snapshot {
  layout: LayoutFile;
  manifest: EditManifest | null;
  conflicts: LayoutConflicts;
  history: string[];
  /** asset slots found when the clone was built: the files this editor may replace */
  slots?: EditSlot[];
  /** every page of the site and the files each draws */
  routes?: RouteInfo[];
}

interface Selected {
  editId: string | null;
  breakpoint?: LayoutBreakpoint;
  hidden?: boolean;
  current?: { left: string; top: string; width: string; height: string; zIndex: string };
  /** The pictures/videos the element shows right now (what the browser really loaded). */
  media?: { kind: string; src: string; naturalWidth: number; naturalHeight: number; shownWidth: number }[];
  /** The picture comes from data (API): place and size are editable, the content is not. */
  dataDriven?: boolean;
  /** How many copies of this element the page draws right now (list items, slides). */
  instances?: number;
  /** "full": positioned element. "scale": a picture in the page flow (zoom about its centre, hide; no move). */
  mode?: "full" | "scale";
  /** The template scales this element by screen size itself (md:/lg:/xl: scale classes). */
  responsiveScale?: boolean;
  /** Scale the element has now, 1 = the template's own size (null when not readable). */
  scale?: { x: number; y: number } | null;
}

const VIEWPORTS: { key: LayoutBreakpoint; label: string; width: number }[] = [
  { key: "desktop", label: "Desktop 1440", width: 1440 },
  { key: "tablet", label: "Tablet 768", width: 768 },
  { key: "mobile", label: "Mobile 375", width: 375 },
];

/**
 * Preview iframe + side panel for visual editing. The inspector inside the clone
 * does the picking/dragging; this component only talks to it through the
 * whitelisted postMessage protocol and saves results through /api/layout.
 */
export default function EditorPanel({ gameId, url }: { gameId: string; url: string }) {
  // one iframe per page, all drawn side by side; `frames` maps a page id to its iframe
  const frames = useRef(new Map<string, HTMLIFrameElement>());
  const activeId = useRef<string | null>(null);
  const [editMode, setEditMode] = useState(true);
  const [viewport, setViewport] = useState<LayoutBreakpoint>("desktop");
  const [snap, setSnap] = useState<Snapshot | null>(null);
  const [selected, setSelected] = useState<Selected>({ editId: null });
  // the pages shown side by side. Starts with every page that needs no parameter; the operator can add a page with parameters
  const [custom, setPages] = useState<{ id: string; path: string; label: string }[] | null>(null);
  const [routePick, setRoutePick] = useState<string>("/");
  const [params, setParams] = useState<Record<string, string>>({});
  const [message, setMessage] = useState<string | null>(null);
  // Full-screen editor: a fixed layer over the wizard with its own toolbar, stage and side panel,
  // so nothing is clipped by the wizard's scrolling. "Fit" scales the preview down to show more of the page.
  const [open, setOpen] = useState(true);
  const [fit, setFit] = useState(true);
  const stageRef = useRef<HTMLDivElement>(null);
  const [stage, setStage] = useState({ w: 1100, h: 700 });
  useEffect(() => {
    const el = stageRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      const r = entries[0].contentRect;
      if (r.width > 0 && r.height > 0) setStage({ w: r.width, h: r.height });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);
  const editModeRef = useRef(editMode);
  useEffect(() => {
    editModeRef.current = editMode;
  }, [editMode]);

  const origin = new URL(url).origin;

  // The preview server may still be starting when this opens (the first request also compiles
  // the page). Loading the iframe too early leaves a dead error page, so wait until it answers.
  const [up, setUp] = useState(false);
  useEffect(() => {
    let stop = false;
    (async () => {
      for (let i = 0; i < 160 && !stop; i++) {
        try {
          await fetch(url, { mode: "no-cors", cache: "no-store" });
          if (!stop) setUp(true);
          return;
        } catch {
          await new Promise((r) => setTimeout(r, 1500));
        }
      }
      if (!stop) setMessage("Bản xem trước không khởi động được — thử bấm Xem trước lại.");
    })();
    return () => {
      stop = true;
    };
  }, [url]);

  /** Send a command to one page (by id) or, without an id, to every page. */
  const post = useCallback(
    (type: string, payload: unknown, only?: string | null) => {
      const msg = protocol.make(type, payload);
      for (const [id, f] of frames.current) {
        if (only && id !== only) continue;
        f.contentWindow?.postMessage(msg, origin);
      }
    },
    [origin]
  );

  const call = useCallback(
    async (method: "GET" | "PUT" | "DELETE", opts: { body?: unknown; query?: string } = {}) => {
      const res = await fetch(`/api/layout?gameId=${encodeURIComponent(gameId)}${opts.query ?? ""}`, {
        method,
        headers: opts.body ? { "Content-Type": "application/json" } : undefined,
        body: opts.body ? JSON.stringify(opts.body) : undefined,
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Lỗi lưu layout");
      setSnap(json as Snapshot);
      return json as Snapshot;
    },
    [gameId]
  );

  useEffect(() => {
    let stop = false;
    (async () => {
      try {
        const res = await fetch(`/api/layout?gameId=${encodeURIComponent(gameId)}`);
        const json = await res.json();
        if (!res.ok) throw new Error(json.error || "Không đọc được layout");
        if (!stop) setSnap(json as Snapshot);
      } catch (e) {
        if (!stop) setMessage(e instanceof Error ? e.message : String(e));
      }
    })();
    return () => {
      stop = true;
    };
  }, [gameId]);

  const save = useCallback(
    async (editId: string, breakpoint: LayoutBreakpoint, patch: Record<string, unknown>) => {
      try {
        await call("PUT", { body: { gameId, editId, breakpoint, patch } });
        post("RELOAD_CSS", {});
        setMessage(null);
      } catch (e) {
        setMessage(e instanceof Error ? e.message : String(e));
      }
    },
    [call, gameId, post]
  );

  useEffect(() => {
    function onMessage(ev: MessageEvent) {
      if (ev.origin !== origin) return;
      let fromId: string | null = null;
      for (const [id, f] of frames.current) if (f.contentWindow === ev.source) fromId = id;
      if (!fromId) return;
      const r = protocol.validate(ev.data, "toEditor");
      if (!r.ok) return;
      if (r.type === "READY") {
        post("INIT", { editMode: editModeRef.current }, fromId);
      } else if (r.type === "SELECTED") {
        if (r.payload.editId === null) {
          // a page that merely cleared its own selection must not wipe the one picked on another page
          if (activeId.current === fromId) setSelected(r.payload);
          return;
        }
        // one selection at a time: clear it on the other pages
        const prev = activeId.current;
        activeId.current = fromId;
        if (prev && prev !== fromId) post("SELECT", { editId: null }, prev);
        setSelected(r.payload);
      } else if (r.type === "LAYOUT_CHANGED") {
        void save(r.payload.editId, r.payload.breakpoint, r.payload.override);
      } else if (r.type === "ERROR") {
        setMessage(r.payload.message);
      }
    }
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [origin, post, save]);

  useEffect(() => {
    post("SET_EDIT_MODE", { editMode });
  }, [editMode, post]);

  const bp = selected.breakpoint ?? viewport;
  const saved = selected.editId ? snap?.layout.elements[selected.editId]?.overrides[bp] : undefined;
  const routes: RouteInfo[] = snap?.routes && snap.routes.length > 0 ? snap.routes : [{ path: "/", label: "Trang chủ", dynamic: false, file: "", files: [] }];
  const pickedRoute = routes.find((r) => r.path === routePick) ?? null;

  // until the operator adds or removes a page: every page that needs no parameter
  const fixedPages = (snap?.routes ?? []).filter((r) => !r.dynamic).map((r, i) => ({ id: "p" + i, path: r.path, label: r.label }));
  const pages = custom ?? (fixedPages.length > 0 ? fixedPages : [{ id: "p0", path: "/", label: "Trang chủ" }]);

  /** Add a page that has parameters (or one that was removed), with the values typed in the toolbar. */
  function addPage(p: string) {
    const r = routes.find((x) => x.path === p);
    const target = r?.dynamic ? fillRoute(p, params) : p;
    if (target === null) {
      setMessage("Nhập đủ tham số của trang rồi bấm Thêm.");
      return;
    }
    setMessage(null);
    setPages([...pages, { id: "p" + Date.now(), path: target, label: r?.label ?? target }]);
  }

  /** A page scrolled far out of view is unloaded to save memory (its edits are already saved). */
  function hidePage(id: string) {
    frames.current.delete(id);
    if (activeId.current === id) {
      activeId.current = null;
      setSelected({ editId: null });
    }
  }

  function removePage(id: string) {
    frames.current.delete(id);
    if (activeId.current === id) {
      activeId.current = null;
      setSelected({ editId: null });
    }
    setPages(pages.filter((x) => x.id !== id));
  }

  const vw = VIEWPORTS.find((v) => v.key === viewport)!.width;

  const PAD = 12;
  const availW = Math.max(200, stage.w - PAD * 2);
  const availH = Math.max(200, stage.h - PAD * 2);
  const scale = fit ? Math.min(1, availW / (vw * Math.min(pages.length, 2) + 12 * (Math.min(pages.length, 2) - 1))) : 1;

  return (
    <>
      {!open && (
        <div style={{ marginTop: 8 }}>
          <button className="rescan-btn" style={{ marginLeft: 0 }} data-testid="ve-open" onClick={() => setOpen(true)}>
            Mở trình chỉnh layout toàn màn hình
          </button>
        </div>
      )}
      <div
        data-testid="ve-fullscreen"
        style={
          open
            ? { position: "fixed", inset: 0, zIndex: 1000, background: "var(--surface, #fff)", display: "flex", flexDirection: "column" }
            : { display: "none" }
        }
      >
        <div style={{ display: "flex", gap: 8, alignItems: "center", padding: "8px 12px", borderBottom: "1px solid var(--border)", flexWrap: "wrap" }}>
          <strong style={{ marginRight: 8 }}>Chỉnh layout</strong>
          {VIEWPORTS.map((v) => (
            <button
              key={v.key}
              className="chip"
              data-testid={`vp-${v.key}`}
              aria-pressed={viewport === v.key}
              style={viewport === v.key ? { borderColor: "var(--accent, #2563eb)", fontWeight: 600 } : undefined}
              onClick={() => setViewport(v.key)}
            >
              {v.label}
            </button>
          ))}
          <span style={{ width: 8 }} />
          <button
            className="chip"
            data-testid="zoom-toggle"
            aria-pressed={fit}
            title="Vừa khung: thu nhỏ để thấy nhiều trang hơn. 100%: kích thước thật."
            onClick={() => setFit((f) => !f)}
          >
            {fit ? `Vừa khung (${Math.round(scale * 100)}%)` : "100%"}
          </button>
          <span style={{ width: 8 }} />
          <label style={{ fontSize: 12.5 }}>
            Thêm trang{" "}
            <select data-testid="ve-route" value={routePick} onChange={(e) => setRoutePick(e.target.value)}>
              {routes.map((r) => (
                <option key={r.path} value={r.path}>
                  {r.label} ({r.path})
                </option>
              ))}
            </select>
          </label>
          {pickedRoute?.dynamic &&
            paramsOf(pickedRoute.path).map((k) => (
              <input
                key={k}
                data-testid={`ve-param-${k === "*" ? "rest" : k}`}
                placeholder={k === "*" ? "đường dẫn" : k}
                value={params[k] ?? ""}
                style={{ width: 110 }}
                onChange={(e) => setParams((cur) => ({ ...cur, [k]: e.target.value }))}
              />
            ))}
          <button className="chip" data-testid="ve-route-open" onClick={() => addPage(routePick)}>
            +
          </button>
          <label style={{ marginLeft: "auto", fontSize: 12.5 }}>
            <input data-testid="edit-mode" type="checkbox" checked={editMode} onChange={(e) => setEditMode(e.target.checked)} /> Chế độ chỉnh
            (tắt để thao tác trang như bình thường)
          </label>
          <button className="chip" data-testid="ve-close" onClick={() => setOpen(false)}>
            Đóng
          </button>
        </div>

        <div style={{ display: "flex", flex: 1, minHeight: 0 }}>
          <div ref={stageRef} data-testid="ve-stage" style={{ flex: 1, minWidth: 0, padding: PAD, overflow: "auto", background: "var(--bg, #f3f4f6)" }}>
            {!up && (
              <div className="hint" style={{ padding: 24 }} data-testid="ve-starting">
                Đang khởi động bản xem trước… (lần đầu có thể mất vài chục giây)
              </div>
            )}
            {up && (
              <div style={{ display: "flex", gap: 12, alignItems: "flex-start", width: "max-content" }}>
                {pages.map((pg) => (
                  <div key={pg.id} data-testid="ve-page" data-path={pg.path} style={{ flex: "none" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, marginBottom: 4, width: vw * scale }}>
                      <strong>{pg.label}</strong>
                      <span className="mono" style={{ color: "var(--muted)" }}>{pg.path}</span>
                      {pages.length > 1 && (
                        <button className="chip" style={{ marginLeft: "auto", padding: "0 6px" }} aria-label="Bỏ trang" onClick={() => removePage(pg.id)}>
                          ×
                        </button>
                      )}
                    </div>
                    <PageSlot root={stageRef} width={vw * scale} height={availH - 24} onHide={() => hidePage(pg.id)}>
                      <iframe
                        ref={(el) => {
                          if (el) frames.current.set(pg.id, el);
                          else frames.current.delete(pg.id);
                        }}
                        data-testid="ve-frame"
                        data-path={pg.path}
                        title={"Trang " + pg.label}
                        src={new URL(pg.path, url).href}
                        onLoad={() => post("INIT", { editMode: editModeRef.current }, pg.id)}
                        style={{
                          width: vw,
                          height: (availH - 24) / scale,
                          maxWidth: "none",
                          border: 0,
                          display: "block",
                          background: "#fff",
                          transform: `scale(${scale})`,
                          transformOrigin: "0 0",
                        }}
                      />
                    </PageSlot>
                  </div>
                ))}
              </div>
            )}
          </div>

          <aside
            className="card"
            style={{ flex: "0 0 320px", fontSize: 13, overflowY: "auto", margin: 0, borderRadius: 0, border: 0, borderLeft: "1px solid var(--border)" }}
            data-testid="ve-panel"
          >
        {message && (
          <div className="ext-note" style={{ borderColor: "var(--warn)", marginBottom: 8 }} data-testid="ve-message">
            {message}
          </div>
        )}
        {selected.editId ? (
          <div style={{ marginTop: 10 }} data-testid="ve-selected">
            {selected.scale && (
              <div style={{ display: "flex", gap: 10, marginTop: 8, flexWrap: "wrap" }}>
                {([["scaleX", "x", "Ngang"], ["scaleY", "y", "Dọc"]] as const).map(([key, axis, label]) => {
                  const current = saved?.[key] ?? selected.scale![axis];
                  return (
                    <label key={key}>
                      {label} (%){" "}
                      <input
                        data-testid={`ve-${key}`}
                        type="number"
                        step="1"
                        min={10}
                        max={500}
                        style={{ width: 70 }}
                        key={`${selected.editId}-${bp}-${key}-${current}`}
                        defaultValue={Math.round(current * 100)}
                        onBlur={(e) => {
                          const n = Number(e.target.value) / 100;
                          if (!Number.isFinite(n) || !selected.editId || Math.abs(n - current) < 0.0005) return;
                          void save(selected.editId, bp, { [key]: n });
                        }}
                      />
                    </label>
                  );
                })}
              </div>
            )}
            {selected.media && selected.media.length > 0 && (
              <div style={{ marginTop: 10 }} data-testid="ve-media">
                {selected.media.map((m, i) => (
                  <MediaReplacer
                    key={`${selected.editId}-${i}-${m.src.split("?")[0]}`}
                    index={i}
                    media={m}
                    slots={snap?.slots ?? []}
                    origin={origin}
                    gameId={gameId}
                    dataDriven={!!selected.dataDriven}
                    onDone={(paths) => {
                      post("RELOAD_MEDIA", { paths });
                      // read the element again so the thumbnail and sizes shown here are the new ones
                      setTimeout(() => selected.editId && post("SELECT", { editId: selected.editId }, activeId.current), 700);
                    }}
                  />
                ))}
              </div>
            )}
            {selected.mode !== "scale" && (
              <label style={{ display: "block", marginTop: 8 }}>
                z-index{" "}
                <input
                  data-testid="ve-zindex"
                  type="number"
                  min={-10}
                  max={999}
                  defaultValue={saved?.zIndex ?? (selected.current && selected.current.zIndex !== "auto" ? Number(selected.current.zIndex) : 0)}
                  key={`${selected.editId}-${bp}-${saved?.zIndex ?? "x"}`}
                  style={{ width: 70 }}
                  onBlur={(e) => {
                    const n = Number(e.target.value);
                    if (Number.isInteger(n) && selected.editId && n !== saved?.zIndex) void save(selected.editId, bp, { zIndex: n });
                  }}
                />
              </label>
            )}
            <label style={{ display: "block", marginTop: 6 }}>
              <input
                data-testid="ve-hidden"
                type="checkbox"
                checked={!!saved?.hidden}
                onChange={(e) => selected.editId && void save(selected.editId, bp, { hidden: e.target.checked ? true : null })}
              />{" "}
              Ẩn trên {bp}
            </label>
          </div>
        ) : null}

        <div style={{ marginTop: 14, display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button
            className="chip"
            data-testid="ve-reset-all"
            onClick={async () => {
              await call("DELETE");
              post("RESET", {});
              post("RELOAD_CSS", {});
              setSelected({ editId: null });
            }}
          >
            Reset toàn trang
          </button>
        </div>
          </aside>
        </div>
      </div>
    </>
  );
}

/**
 * Holds the iframe of one page and only renders it while the slot is near the visible part of the stage.
 * Eight full pages in iframes at once exhaust the browser's memory.
 */
function PageSlot({
  root,
  width,
  height,
  onHide,
  children,
}: {
  root: React.RefObject<HTMLDivElement | null>;
  width: number;
  height: number;
  onHide: () => void;
  children: React.ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [near, setNear] = useState(false);
  const hide = useRef(onHide);
  useEffect(() => {
    hide.current = onHide;
  });
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(
      (entries) => {
        const on = entries[entries.length - 1].isIntersecting;
        setNear(on);
        if (!on) hide.current();
      },
      { root: root.current, rootMargin: "0px 300px 0px 300px" }
    );
    io.observe(el);
    return () => io.disconnect();
  }, [root]);
  return (
    <div ref={ref} style={{ width, height, position: "relative", overflow: "hidden", boxShadow: "0 0 0 1px var(--border)", background: near ? undefined : "var(--bg, #f3f4f6)" }}>
      {near ? children : null}
    </div>
  );
}

const ANCHORS: [string, string][] = [
  ["attention", "Tự động (vùng nổi bật)"],
  ["top", "Giữ phần trên"],
  ["bottom", "Giữ phần dưới"],
  ["left", "Giữ bên trái"],
  ["right", "Giữ bên phải"],
  ["top-left", "Giữ góc trên trái"],
  ["top-right", "Giữ góc trên phải"],
  ["bottom-left", "Giữ góc dưới trái"],
  ["bottom-right", "Giữ góc dưới phải"],
];

/**
 * One picture the selected element shows: replace it by uploading a file or pasting a link, straight in the
 * preview. Same rules as the wizard's step 2 (cropped to the exact size of each file it replaces, kept for the
 * next "Generate clone"). Only pictures that belong to a detected asset slot and are served by the preview
 * itself can be replaced here; a picture loaded from a CDN would not change on screen.
 */
function MediaReplacer({
  index,
  media,
  slots,
  origin,
  gameId,
  dataDriven,
  onDone,
}: {
  index: number;
  media: NonNullable<Selected["media"]>[number];
  slots: EditSlot[];
  origin: string;
  gameId: string;
  dataDriven: boolean;
  onDone: (publicPaths: string[]) => void;
}) {
  const [file, setFile] = useState<File | null>(null);
  const [url, setUrl] = useState("");
  const [anchor, setAnchor] = useState("attention");
  const [onlyShown, setOnlyShown] = useState(false);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<{ ok: boolean; text: string } | null>(null);
  const { match, remote } = matchMediaToSlot(media.src, slots, origin);

  const targets = match ? (onlyShown ? [match.shownPath] : match.slot.targetPaths) : [];

  async function replace() {
    if (!match) return;
    setBusy(true);
    setNote(null);
    try {
      const form = new FormData();
      form.append("gameId", gameId);
      form.append("targetPaths", JSON.stringify(targets));
      form.append("anchor", anchor);
      if (file) form.append("file", file);
      else form.append("url", url.trim());
      const res = await fetch("/api/asset", { method: "POST", body: form });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Không thay được ảnh");
      setNote({ ok: true, text: `Đã thay ${json.replaced.length} file (đã cắt/nén đúng kích thước gốc).` });
      setFile(null);
      setUrl("");
      onDone(json.replaced.map((r: { publicPath: string }) => r.publicPath));
    } catch (e) {
      setNote({ ok: false, text: e instanceof Error ? e.message : String(e) });
    } finally {
      setBusy(false);
    }
  }

  async function restore() {
    if (!match) return;
    setBusy(true);
    setNote(null);
    try {
      const q = targets.map((t) => `&targetPath=${encodeURIComponent(t)}`).join("");
      const res = await fetch(`/api/asset?gameId=${encodeURIComponent(gameId)}${q}`, { method: "DELETE" });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Không khôi phục được");
      setNote({ ok: true, text: "Đã khôi phục ảnh gốc của template." });
      onDone(json.restored.map((r: { publicPath: string }) => r.publicPath));
    } catch (e) {
      setNote({ ok: false, text: e instanceof Error ? e.message : String(e) });
    } finally {
      setBusy(false);
    }
  }

  const name = media.src.split("?")[0].split("/").pop();
  const canReplace = !dataDriven && !!match && !remote && media.kind === "img";
  return (
    <div style={{ marginTop: 8, padding: 8, border: "1px solid var(--border)", borderRadius: 8 }} data-testid="ve-media-item" data-index={index}>
      <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
        {media.kind === "img" ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={media.src} alt="" data-testid="ve-media-thumb" style={{ width: 56, height: 56, objectFit: "contain", background: "#8884", borderRadius: 4 }} />
        ) : null}
        <div style={{ minWidth: 0, fontSize: 12 }}>
          <div className="mono" style={{ overflow: "hidden", textOverflow: "ellipsis" }}>{name}</div>
          <div style={{ color: "var(--muted)" }}>
            {media.naturalWidth} × {media.naturalHeight} px{match ? ` · ${match.slot.label}` : ""}
          </div>
        </div>
      </div>

      {canReplace && (
        <div style={{ marginTop: 6, display: "grid", gap: 6 }}>
          <input data-testid="ve-asset-file" type="file" accept="image/*" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
          <input
            data-testid="ve-asset-url"
            type="text"
            placeholder="…hoặc dán link ảnh"
            value={url}
            disabled={!!file}
            onChange={(e) => setUrl(e.target.value)}
          />
          <select data-testid="ve-asset-anchor" value={anchor} onChange={(e) => setAnchor(e.target.value)} title="Khi ảnh mới khác tỉ lệ, giữ phần nào">
            {ANCHORS.map(([v, label]) => (
              <option key={v} value={v}>{label}</option>
            ))}
          </select>
          <label style={{ fontSize: 12 }}>
            <input data-testid="ve-asset-only-shown" type="checkbox" checked={onlyShown} onChange={(e) => setOnlyShown(e.target.checked)} /> Chỉ bản đang
            hiển thị (không thì thay cho mọi kích thước màn hình: {match!.slot.targetPaths.length} file)
          </label>
          <div style={{ display: "flex", gap: 8 }}>
            <button className="chip" data-testid="ve-asset-replace" disabled={busy || (!file && url.trim() === "")} onClick={replace}>
              {busy ? "Đang thay…" : "Thay ảnh"}
            </button>
            <button className="chip" data-testid="ve-asset-restore" disabled={busy} onClick={restore}>
              Khôi phục gốc
            </button>
          </div>
        </div>
      )}
      {note && (
        <div className="ext-note" style={{ marginTop: 6, borderColor: note.ok ? "var(--border)" : "var(--warn)" }} data-testid={note.ok ? "ve-asset-ok" : "ve-asset-error"}>
          {note.text}
        </div>
      )}
    </div>
  );
}
