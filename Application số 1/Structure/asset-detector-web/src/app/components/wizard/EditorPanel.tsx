"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import protocol from "../../../../public/ve/protocol.js";
import type { EditManifest, LayoutBreakpoint, LayoutConflicts, LayoutFile } from "@/detector/layout-schema";
import { matchMediaToSlot, type EditSlot } from "@/detector/asset-match";
import type { RouteInfo } from "@/detector/routes";
import { fillRoute, matchRoute, paramsOf, routesOfFile } from "@/detector/route-path";

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
  const frameRef = useRef<HTMLIFrameElement>(null);
  const [editMode, setEditMode] = useState(true);
  const [viewport, setViewport] = useState<LayoutBreakpoint>("desktop");
  const [snap, setSnap] = useState<Snapshot | null>(null);
  const [selected, setSelected] = useState<Selected>({ editId: null });
  const [present, setPresent] = useState<string[] | null>(null);
  // which page the preview is on: the address we asked for, and an element to select as soon as the page it lives
  // on has loaded
  const [framePath, setFramePath] = useState<string>(() => new URL(url).pathname + new URL(url).search);
  const [routePick, setRoutePick] = useState<string>("/");
  const [params, setParams] = useState<Record<string, string>>({});
  const pendingSelect = useRef<string | null>(null);
  const routesRef = useRef<RouteInfo[]>([]);
  const [message, setMessage] = useState<string | null>(null);
  const [warnings, setWarnings] = useState<string[]>([]);
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

  const post = useCallback(
    (type: string, payload: unknown) => {
      frameRef.current?.contentWindow?.postMessage(protocol.make(type, payload), origin);
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
      if (ev.origin !== origin || ev.source !== frameRef.current?.contentWindow) return;
      const r = protocol.validate(ev.data, "toEditor");
      if (!r.ok) return;
      if (r.type === "READY" || r.type === "STATE") {
        setPresent(r.payload.editIds);
        // follow the page the preview is really on (the operator may have clicked a link with the edit mode off)
        if (typeof r.payload.path === "string") {
          const m = matchRoute(routesRef.current, r.payload.path);
          if (m) setRoutePick(m.path);
        }
        if (r.type === "READY") post("INIT", { editMode: editModeRef.current });
        // an element picked from another page: select it once that page is there
        const want = pendingSelect.current;
        if (want && r.payload.editIds.includes(want)) {
          pendingSelect.current = null;
          post("SELECT", { editId: want });
        }
      } else if (r.type === "SELECTED") {
        setSelected(r.payload);
      } else if (r.type === "LAYOUT_CHANGED") {
        setWarnings(r.payload.warnings ?? []);
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
  const entries = snap?.manifest?.entries ?? [];
  const routes: RouteInfo[] = snap?.routes && snap.routes.length > 0 ? snap.routes : [{ path: "/", label: "Trang chủ", dynamic: false, file: "", files: [] }];
  const pickedRoute = routes.find((r) => r.path === routePick) ?? null;
  useEffect(() => {
    routesRef.current = routes;
  });

  function openRoute(p: string) {
    const r = routes.find((x) => x.path === p);
    const target = r?.dynamic ? fillRoute(p, params) : p;
    if (target === null) {
      setMessage("Nhập đủ tham số của trang rồi bấm Mở.");
      return;
    }
    setMessage(null);
    setPresent(null);
    setFramePath(target);
  }

  /** Changing the screen size re-flows the page: ask for the selection again once it has settled. */
  function switchViewport(v: LayoutBreakpoint) {
    const id = selected.editId;
    setViewport(v);
    setTimeout(() => {
      if (id) post("SELECT", { editId: id });
    }, 900);
  }

  /** Select an element; when it lives on another page, open that page first and select it there. */
  function goTo(editId: string) {
    if (present?.includes(editId)) {
      post("SELECT", { editId });
      return;
    }
    const entry = entries.find((e) => e.editId === editId);
    const owners = entry ? routesOfFile(routes, entry.sourcePath) : [];
    const target = owners.find((r) => !r.dynamic) ?? owners[0];
    if (!target) {
      post("SELECT", { editId });
      return;
    }
    pendingSelect.current = editId;
    setRoutePick(target.path);
    if (target.dynamic) {
      setMessage(`"${editId}" nằm ở trang ${target.path}: nhập tham số rồi bấm Mở.`);
      return;
    }
    openRoute(target.path);
  }
  const skipped = snap?.manifest?.skipped.length ?? 0;
  const vw = VIEWPORTS.find((v) => v.key === viewport)!.width;

  const PAD = 12;
  const availW = Math.max(200, stage.w - PAD * 2);
  const availH = Math.max(200, stage.h - PAD * 2);
  const scale = fit ? Math.min(1, availW / vw) : 1;

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
            Trang{" "}
            <select
              data-testid="ve-route"
              value={routePick}
              onChange={(e) => {
                setRoutePick(e.target.value);
                const r = routes.find((x) => x.path === e.target.value);
                if (r && !r.dynamic) openRoute(r.path);
              }}
            >
              {routes.map((r) => (
                <option key={r.path} value={r.path}>
                  {r.label}
                  {r.dynamic ? " (cần tham số)" : ""} · {entries.filter((en) => r.files.includes(en.sourcePath)).length} phần tử
                </option>
              ))}
            </select>
          </label>
          {pickedRoute?.dynamic && (
            <span style={{ display: "inline-flex", gap: 6, alignItems: "center" }} data-testid="ve-route-params">
              {paramsOf(pickedRoute.path).map((k) => (
                <input
                  key={k}
                  data-testid={`ve-param-${k === "*" ? "rest" : k}`}
                  placeholder={k === "*" ? "đường dẫn" : k}
                  value={params[k] ?? ""}
                  style={{ width: 110 }}
                  onChange={(e) => setParams((p) => ({ ...p, [k]: e.target.value }))}
                />
              ))}
              <button className="chip" data-testid="ve-route-open" onClick={() => openRoute(pickedRoute.path)}>
                Mở
              </button>
            </span>
          )}
          <label style={{ marginLeft: "auto", fontSize: 12.5 }}>
            <input data-testid="edit-mode" type="checkbox" checked={editMode} onChange={(e) => setEditMode(e.target.checked)} /> Chế độ chỉnh
            (tắt để thao tác trang như bình thường)
          </label>
          <button className="chip" data-testid="ve-close" onClick={() => setOpen(false)}>
            Đóng
          </button>
        </div>

        <div style={{ display: "flex", flex: 1, minHeight: 0 }}>
          <div ref={stageRef} style={{ flex: 1, minWidth: 0, padding: PAD, overflow: fit ? "hidden" : "auto", background: "var(--bg, #f3f4f6)" }}>
            {!up && (
              <div className="hint" style={{ padding: 24 }} data-testid="ve-starting">
                Đang khởi động bản xem trước… (lần đầu có thể mất vài chục giây)
              </div>
            )}
            {up && (
              <div style={{ width: vw * scale, height: availH, margin: "0 auto", position: "relative", overflow: "hidden", boxShadow: "0 0 0 1px var(--border)" }}>
                <iframe
                  ref={frameRef}
                  data-testid="ve-frame"
                  title="Xem trước và chỉnh layout"
                  src={new URL(framePath, url).href}
                  onLoad={() => post("INIT", { editMode: editModeRef.current })}
                  style={{
                    width: vw,
                    height: availH / scale,
                    maxWidth: "none",
                    border: 0,
                    display: "block",
                    background: "#fff",
                    transform: `scale(${scale})`,
                    transformOrigin: "0 0",
                  }}
                />
              </div>
            )}
          </div>

          <aside
            className="card"
            style={{ flex: "0 0 320px", fontSize: 13, overflowY: "auto", margin: 0, borderRadius: 0, border: 0, borderLeft: "1px solid var(--border)" }}
            data-testid="ve-panel"
          >
        <h3 style={{ marginTop: 0 }}>Chỉnh layout</h3>
        {message && (
          <div className="ext-note" style={{ borderColor: "var(--warn)", marginBottom: 8 }} data-testid="ve-message">
            {message}
          </div>
        )}
        {snap && (snap.conflicts.templateChanged || snap.conflicts.missing.length > 0) && (
          <div className="ext-note" style={{ borderColor: "var(--warn)", marginBottom: 8 }} data-testid="ve-conflict">
            {snap.conflicts.templateChanged
              ? "Template đã đổi so với lúc lưu layout — layout cũ chưa được áp dụng."
              : `${snap.conflicts.missing.length} phần tử đã lưu không còn trong template (${snap.conflicts.missing.join(", ")}) — bỏ qua.`}
          </div>
        )}

        {warnings.length > 0 && (
          <div className="ext-note" style={{ borderColor: "var(--warn)", marginBottom: 8 }} data-testid="ve-warning">
            Lưu ý: {warnings.join("; ")}. Kiểm tra lại bố cục, hoặc bấm “Reset phần tử này”.
          </div>
        )}

        <div className="hint">
          Click một ảnh trong trang để chọn, kéo để dời (hoặc kéo nút ✥ khi ảnh bị lớp khác che; ảnh nằm trong luồng trang thì không dời được, chỉ phóng/thu nhỏ). Ảnh có 8 ô vuông để phóng to/thu nhỏ:
          4 góc giữ tỷ lệ (giữ <strong>Shift</strong> để kéo giãn tự do), 4 cạnh kéo giãn một chiều. Phóng cả ảnh bên trong, kể cả ảnh
          có kích thước cố định. Gõ số tỉ lệ bên dưới (100% = kích thước gốc của template).
          Đang chỉnh cho: <strong>{bp}</strong>. Kéo không ra ngoài khung chứa được, không nhỏ hơn 24px và không to quá khung chứa;
          tỉ lệ 10–500%; z-index từ −10 đến 999.
        </div>

        {selected.editId ? (
          <div style={{ marginTop: 10 }} data-testid="ve-selected">
            <div className="mono" style={{ fontSize: 12 }}>{selected.editId}</div>
            {saved && <div className="mono" style={{ fontSize: 11, color: "var(--muted)" }}>{JSON.stringify(saved)}</div>}
            {selected.responsiveScale && (
              <div className="ext-note" style={{ borderColor: "var(--warn)", marginTop: 8 }} data-testid="ve-responsive-scale">
                Phần tử này tự đổi tỉ lệ theo cỡ màn hình (md:/lg:/xl: scale). Tỉ lệ bạn chỉnh là một giá trị cố định cho cả dải
                {" "}{bp}, thay cho hành vi đó.
              </div>
            )}
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
                <div style={{ fontWeight: 600 }}>Ảnh trong phần tử ({selected.media.length})</div>
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
                      setTimeout(() => selected.editId && post("SELECT", { editId: selected.editId }), 700);
                    }}
                  />
                ))}
              </div>
            )}
            {selected.hidden && !saved?.hidden && (
              <div className="ext-note" style={{ borderColor: "var(--warn)", marginTop: 8 }} data-testid="ve-hidden-note">
                Phần tử này đang không hiển thị ở kích thước {bp} (template ẩn nó ở đây). Xem ở:{" "}
                {VIEWPORTS.filter((v) => v.key !== viewport).map((v) => (
                  <button key={v.key} className="chip" style={{ marginRight: 6 }} onClick={() => switchViewport(v.key)}>
                    {v.label}
                  </button>
                ))}
              </div>
            )}
            {selected.dataDriven && (
              <div className="hint" style={{ marginTop: 8 }} data-testid="ve-data-note">
                Ảnh lấy từ dữ liệu (API): nội dung không sửa được, chỉ chỉnh vị trí, kích thước và ẩn.
              </div>
            )}
            {(selected.instances ?? 1) > 1 && (
              <div className="hint" style={{ marginTop: 8 }} data-testid="ve-instances-note">
                Trang đang vẽ {selected.instances} bản giống nhau của phần tử này (dữ liệu lặp): chỉnh một bản là chỉnh tất cả.
              </div>
            )}
            {selected.mode === "scale" && (
              <div className="hint" style={{ marginTop: 8 }} data-testid="ve-flow-note">
                Ảnh này nằm trong luồng trang nên không dời được: chỉ phóng to/thu nhỏ (quanh tâm ảnh) hoặc ẩn. Muốn đổi chỗ phải sửa bố cục của trang.
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
            <button
              className="chip"
              data-testid="ve-reset-one"
              style={{ marginTop: 8 }}
              onClick={async () => {
                if (!selected.editId) return;
                await call("DELETE", { query: `&editId=${encodeURIComponent(selected.editId)}` });
                post("RESET", { editId: selected.editId });
                post("RELOAD_CSS", {});
              }}
            >
              Reset phần tử này
            </button>
          </div>
        ) : (
          <div className="hint" style={{ marginTop: 10 }}>Chưa chọn phần tử nào.</div>
        )}

        <div style={{ marginTop: 14, fontWeight: 600 }}>
          Phần tử chỉnh được ({entries.length}
          {present ? `, ${present.length} có trên trang này` : ""})
        </div>
        <ul style={{ margin: "6px 0 0", paddingLeft: 16, maxHeight: 160, overflow: "auto" }}>
          {entries.map((e) => (
            <li key={e.editId}>
              <button className="chip" style={{ fontSize: 11 }} onClick={() => goTo(e.editId)}>
                {e.editId}
              </button>
              {snap?.layout.elements[e.editId] ? " ✎" : ""}
              {present && !present.includes(e.editId) ? (
                <span style={{ color: "var(--muted)" }}> (trang: {routesOfFile(routes, e.sourcePath).slice(0, 2).map((r) => r.path).join(", ") || "khác"})</span>
              ) : null}
            </li>
          ))}
        </ul>
        {skipped > 0 && (
          <div className="hint" style={{ marginTop: 6 }}>
            {skipped} ảnh không chỉnh được vì nằm trong luồng trang (không có khung định vị) — giữ nguyên.
          </div>
        )}

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
          {snap && snap.history.length > 0 && (
            <select
              data-testid="ve-history"
              defaultValue=""
              onChange={async (e) => {
                if (!e.target.value) return;
                await call("PUT", { body: { gameId, restore: e.target.value } });
                post("RELOAD_CSS", {});
                e.target.value = "";
              }}
            >
              <option value="">Khôi phục bản cũ…</option>
              {snap.history.map((h) => (
                <option key={h} value={h}>{h.replace(".json", "")}</option>
              ))}
            </select>
          )}
        </div>
          </aside>
        </div>
      </div>
    </>
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

      {media.kind !== "img" && (
        <div className="hint" style={{ marginTop: 6 }}>Video: thay ở bước 2 (chưa hỗ trợ ngay trong bản xem trước).</div>
      )}
      {media.kind === "img" && dataDriven && (
        <div className="hint" style={{ marginTop: 6 }} data-testid="ve-media-data">
          Ảnh này đến từ dữ liệu (API) nên không có file để thay. Bạn vẫn chỉnh được vị trí và kích thước của nó.
        </div>
      )}
      {media.kind === "img" && !dataDriven && remote && (
        <div className="hint" style={{ marginTop: 6 }} data-testid="ve-media-remote">
          Ảnh này tải từ nguồn ngoài (CDN hoặc dữ liệu API) nên ảnh thay vào sẽ không hiện trong bản xem trước. Nếu là asset CDN thì thay ở bước 2; nếu là dữ liệu API thì không sửa được.
        </div>
      )}
      {media.kind === "img" && !dataDriven && !remote && !match && (
        <div className="hint" style={{ marginTop: 6 }} data-testid="ve-media-unknown">
          Ảnh này không thuộc asset nào đã nhận diện (ví dụ ảnh từ API) nên không thay ở đây.
        </div>
      )}

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
