/**
 * Visual-editing inspector. Injected into the CLONE only (never the template).
 * Needs mapper.js and protocol.js loaded first, and config.js which sets
 * window.__VE_CONFIG__ = { editorOrigin }.
 *
 * It does nothing unless the page is inside an iframe AND messages come from the
 * configured editor origin. See Structure/14-PLAN-visual-editing.md section 6.
 */
(function () {
  var cfg = window.__VE_CONFIG__;
  var M = window.VEMapper;
  var P = window.VEProtocol;
  if (!cfg || !M || !P || window.parent === window) return;

  var editMode = false;
  var selected = null; // element
  var hovered = null;
  var drag = null; // { kind, el, id, startX, startY, start, ctx }
  var live = {}; // editId -> { breakpoint -> override } applied before it is saved
  var overlay, selBox, hoverBox, moveHandle, liveStyle;
  // resize handles: [x fraction, y fraction, cursor]; corners keep the ratio, edges change one side
  var HANDLE_DEFS = {
    nw: [0, 0, "nwse-resize"], n: [0.5, 0, "ns-resize"], ne: [1, 0, "nesw-resize"], e: [1, 0.5, "ew-resize"],
    se: [1, 1, "nwse-resize"], s: [0.5, 1, "ns-resize"], sw: [0, 1, "nesw-resize"], w: [0, 0.5, "ew-resize"],
  };
  var handles = {};
  function pct(n) {
    return Math.round(n * 1000) / 1000 + "%";
  }

  function send(type, payload) {
    window.parent.postMessage(P.make(type, payload), cfg.editorOrigin);
  }
  function fail(message) {
    send("ERROR", { message: message });
  }
  function currentBreakpoint() {
    return M.breakpointOf(window.innerWidth);
  }
  function editableOf(node) {
    return node && node.closest ? node.closest("[data-edit-id]") : null;
  }
  function byId(id) {
    return document.querySelector('[data-edit-id="' + id + '"]');
  }

  // ---------- coordinate context ----------
  function matrixOf(el) {
    var cs = getComputedStyle(el);
    if (cs.rotate && cs.rotate !== "none") throw new Error("rotated ancestors are not supported");
    // individual `scale` property is applied before `transform`; translate never affects a delta
    return M.multiply(M.parseScaleProperty(cs.scale), M.parseTransform(cs.transform));
  }

  /** True when this ancestor creates a containing block for absolute AND fixed descendants. */
  function createsBlock(c) {
    var set = function (v) {
      return v && v !== "none";
    };
    return (
      set(c.transform) || set(c.scale) || set(c.translate) || set(c.rotate) || set(c.perspective) || set(c.filter) ||
      /transform|filter|perspective/.test(c.willChange || "") || /paint|layout|strict|content/.test(c.contain || "")
    );
  }

  /**
   * The element whose padding box left/top/% really refer to, or null for the viewport / initial containing block.
   * - absolute: the nearest ancestor that is positioned OR creates a containing block;
   * - fixed: only an ancestor that creates one (this is what the templates' scale-to-fit wrapper does).
   * el.offsetParent is NOT used: it ignores ancestors that only carry the transform-like properties
   * (translate / scale / filter ...), which Tailwind 4 uses, and would give the wrong box.
   */
  function containingBlock(el, position) {
    for (var n = el.parentElement; n && n !== document.documentElement; n = n.parentElement) {
      var c = getComputedStyle(n);
      if (createsBlock(c)) return n;
      if (position === "absolute" && c.position !== "static") return n;
    }
    return null;
  }

  /**
   * "full": a positioned element (move, scale, restack, hide). "scale": a picture in the page flow, it has no
   * left/top to change, so it can only be zoomed about its own centre (and hidden). The injector marks those
   * with data-edit-mode; an element that is not absolute/fixed at this width is treated the same way.
   */
  function modeOf(el) {
    if (el.getAttribute("data-edit-mode") === "scale") return "scale";
    var p = getComputedStyle(el).position;
    return p === "absolute" || p === "fixed" ? "full" : "scale";
  }

  /**
   * Transform chain above the element + what its left/top refer to. Throws when it cannot be mapped safely.
   * unit: "%" of the containing block. For position:fixed straight in the viewport that is a % of the window:
   * templates author those as top-[80%] / top-1/2 (see FloatBxh, FloatHome), so % keeps their intent.
   */
  function contextOf(el) {
    var cs = getComputedStyle(el);
    if (cs.position === "static") throw new Error("element is not positioned");
    var parent = containingBlock(el, cs.position);
    var size;
    var chain = [];
    if (!parent) {
      if (cs.position === "fixed") {
        return {
          matrix: M.IDENTITY.slice(),
          parent: { width: window.innerWidth, height: window.innerHeight },
          container: null,
          boundsRect: { left: 0, top: 0, right: window.innerWidth, bottom: window.innerHeight },
          unit: "%",
        };
      }
      // absolute with nothing positioned above: the initial containing block
      size = { width: document.documentElement.clientWidth, height: document.documentElement.clientHeight };
      parent = document.documentElement;
    } else {
      size = { width: parent.clientWidth, height: parent.clientHeight };
    }
    for (var n = parent; n; n = n.parentElement) chain.unshift(matrixOf(n));
    var matrix = M.compose(chain);
    // Safety net: the matrix we computed must agree with what the browser actually draws.
    var rect = parent.getBoundingClientRect();
    if (parent.offsetWidth > 0) {
      var measured = rect.width / parent.offsetWidth;
      var computed = Math.hypot(matrix[0], matrix[1]);
      if (Math.abs(measured - computed) > 0.02 * Math.max(measured, 1e-6)) {
        throw new Error("cannot map coordinates (measured scale " + measured.toFixed(3) + " vs " + computed.toFixed(3) + ")");
      }
    }
    return { matrix: matrix, parent: size, container: parent, unit: "%" };
  }

  /** Other editable elements whose box meaningfully overlaps this one (ancestors/descendants excluded). */
  function overlapsOf(el) {
    var a = el.getBoundingClientRect();
    var out = [];
    var all = document.querySelectorAll("[data-edit-id]");
    for (var i = 0; i < all.length; i++) {
      var o = all[i];
      if (o === el || o.contains(el) || el.contains(o)) continue;
      var b = o.getBoundingClientRect();
      if (b.width === 0 || b.height === 0) continue;
      var w = Math.min(a.right, b.right) - Math.max(a.left, b.left);
      var h = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
      if (w <= 0 || h <= 0) continue;
      var smaller = Math.min(a.width * a.height, b.width * b.height);
      if (smaller > 0 && (w * h) / smaller > 0.25) out.push(o.getAttribute("data-edit-id"));
    }
    return out;
  }

  function px(v, fallback) {
    var n = parseFloat(v);
    return isNaN(n) ? fallback : n;
  }

  // ---------- live preview (before save) ----------
  function renderLive() {
    var byBp = { desktop: [], tablet: [], mobile: [] };
    Object.keys(live).forEach(function (id) {
      Object.keys(live[id]).forEach(function (bp) {
        var d = M.overrideDeclarations(live[id][bp]);
        if (d.length) byBp[bp].push('[data-edit-id="' + id + '"][data-edit-id] { ' + d.join("; ") + "; }");
      });
    });
    var css = Object.keys(byBp)
      .filter(function (bp) {
        return byBp[bp].length;
      })
      .map(function (bp) {
        return "@media " + M.BREAKPOINT_MEDIA[bp] + " {\n" + byBp[bp].join("\n") + "\n}";
      })
      .join("\n");
    liveStyle.textContent = css;
    syncOverlay();
  }
  function setLive(id, bp, override) {
    live[id] = live[id] || {};
    live[id][bp] = Object.assign({}, live[id][bp] || {}, override);
    renderLive();
  }

  // ---------- overlay ----------
  function buildOverlay() {
    if (overlay) return;
    liveStyle = document.createElement("style");
    liveStyle.id = "__ve_live";
    document.head.appendChild(liveStyle);

    overlay = document.createElement("div");
    overlay.style.cssText = "position:fixed;left:0;top:0;width:0;height:0;z-index:2147483647;pointer-events:none;";
    hoverBox = document.createElement("div");
    hoverBox.style.cssText = "position:fixed;border:1px dashed #3b82f6;display:none;box-sizing:border-box;";
    selBox = document.createElement("div");
    selBox.style.cssText = "position:fixed;border:2px solid #2563eb;display:none;box-sizing:border-box;";
    Object.keys(HANDLE_DEFS).forEach(function (dir) {
      var h = document.createElement("div");
      h.setAttribute("data-ve-handle", dir);
      h.style.cssText =
        "position:fixed;width:12px;height:12px;background:#2563eb;border:2px solid #fff;border-radius:3px;display:none;pointer-events:auto;box-sizing:border-box;cursor:" +
        HANDLE_DEFS[dir][2] +
        ";";
      handles[dir] = h;
    });
    // Always-on-top grip that moves the SELECTED element, so one that is covered by another
    // editable element (or sits under a full-width strip) can still be dragged.
    moveHandle = document.createElement("div");
    moveHandle.setAttribute("data-ve-move", "1");
    moveHandle.textContent = "✥";
    moveHandle.style.cssText =
      "position:fixed;width:20px;height:20px;line-height:20px;text-align:center;font-size:13px;color:#fff;background:#2563eb;border-radius:4px;display:none;pointer-events:auto;cursor:move;user-select:none;font-family:sans-serif;";
    overlay.appendChild(hoverBox);
    overlay.appendChild(selBox);
    Object.keys(handles).forEach(function (dir) {
      overlay.appendChild(handles[dir]);
    });
    overlay.appendChild(moveHandle);
    document.documentElement.appendChild(overlay);
  }
  function place(box, el) {
    if (!el || !document.contains(el)) return (box.style.display = "none");
    var r = el.getBoundingClientRect();
    if (r.width === 0 && r.height === 0) return (box.style.display = "none");
    box.style.display = "block";
    box.style.left = r.left + "px";
    box.style.top = r.top + "px";
    box.style.width = r.width + "px";
    box.style.height = r.height + "px";
  }
  function syncOverlay() {
    if (!overlay) return;
    overlay.style.display = editMode ? "block" : "none";
    place(selBox, editMode ? selected : null);
    place(hoverBox, editMode && hovered !== selected ? hovered : null);
    if (editMode && selected && selBox.style.display === "block") {
      var r = selected.getBoundingClientRect();
      // a very small box would be covered by its own edge handles: keep the corners only
      var small = Math.min(r.width, r.height) < 40;
      Object.keys(handles).forEach(function (dir) {
        var d = HANDLE_DEFS[dir];
        handles[dir].style.display = small && dir.length === 1 ? "none" : "block";
        handles[dir].style.left = r.left + r.width * d[0] - 6 + "px";
        handles[dir].style.top = r.top + r.height * d[1] - 6 + "px";
      });
      // grip sits just above the top-left corner; it stays on screen even when the corner is off it
      moveHandle.style.display = modeOf(selected) === "full" ? "block" : "none";
      moveHandle.style.left = Math.min(Math.max(r.left, 2), window.innerWidth - 24) + "px";
      moveHandle.style.top = Math.min(Math.max(r.top - 22, 2), window.innerHeight - 24) + "px";
    } else {
      Object.keys(handles).forEach(function (dir) {
        handles[dir].style.display = "none";
      });
      moveHandle.style.display = "none";
    }
  }

  // ---------- selection ----------
  function describe(el) {
    var cs = getComputedStyle(el);
    var r = el.getBoundingClientRect();
    // the pictures/videos this element shows right now (for <picture>: the source the browser picked at
    // this width): what the operator sees, so the editor can offer to replace exactly those files
    var media = [];
    var nodes = el.matches("img, video") ? [el] : el.querySelectorAll("img, video");
    for (var i = 0; i < nodes.length && media.length < 12; i++) {
      var n = nodes[i];
      var q = n.getBoundingClientRect();
      var src = n.currentSrc || n.getAttribute("src") || "";
      if (!src || q.width === 0 || q.height === 0) continue;
      media.push({
        kind: n.tagName.toLowerCase(),
        src: String(src).slice(0, 500),
        naturalWidth: n.naturalWidth || n.videoWidth || 0,
        naturalHeight: n.naturalHeight || n.videoHeight || 0,
        shownWidth: Math.round(q.width),
      });
    }
    var sc = null;
    try {
      var m = M.parseScaleProperty(cs.scale);
      sc = { x: Math.round(m[0] * 1000) / 1000, y: Math.round(m[3] * 1000) / 1000 };
    } catch (_) {
      /* an unusual scale value: the panel shows no numbers */
    }
    // the template scales this element by screen size itself (md:scale-[.65] lg:scale-[.85]): our scale is one
    // fixed value for the whole breakpoint range, so the operator must know it replaces that behaviour
    var responsiveScale = /(^|s)(sm|md|lg|xl|2xl):[^s]*scale-/.test(String(el.getAttribute("class") || ""));
    // the same JSX can be drawn many times (a list of news, slider slides): one id, one override for all of them
    var instances = document.querySelectorAll('[data-edit-id="' + el.getAttribute("data-edit-id") + '"]').length;
    return {
      dataDriven: el.getAttribute("data-edit-source") === "api",
      instances: instances,
      mode: modeOf(el),
      responsiveScale: responsiveScale,
      scale: sc,
      media: media,
      editId: el.getAttribute("data-edit-id"),
      breakpoint: currentBreakpoint(),
      hidden: cs.display === "none",
      rect: { x: r.left, y: r.top, width: r.width, height: r.height },
      current: { left: cs.left, top: cs.top, width: cs.width, height: cs.height, zIndex: cs.zIndex },
    };
  }
  function select(el) {
    selected = el;
    syncOverlay();
    send("SELECTED", el ? describe(el) : { editId: null });
  }

  // ---------- pointer interaction ----------
  function onPointerDown(e) {
    if (!editMode || e.button !== 0) return;
    var dir = e.target && e.target.getAttribute ? e.target.getAttribute("data-ve-handle") : null;
    if (dir && handles[dir] === e.target) return startResize(e, dir);
    if (e.target === moveHandle) {
      if (selected && modeOf(selected) === "full") startMove(e, selected);
      return;
    }
    var el = editableOf(e.target);
    if (!el) {
      select(null);
      return;
    }
    e.preventDefault();
    e.stopPropagation();
    if (el !== selected) select(el);
    // a picture in the page flow cannot be dragged: pressing it only selects it
    if (modeOf(el) === "scale") return;
    startMove(e, el);
  }
  function begin(kind, e, el, dir) {
    try {
      var ctx = contextOf(el);
      var cs = getComputedStyle(el);
      drag = {
        kind: kind,
        dir: dir,
        el: el,
        id: el.getAttribute("data-edit-id"),
        startX: e.clientX,
        startY: e.clientY,
        ctx: ctx,
        // limits are measured once, at the start, from what is really on screen
        box: el.getBoundingClientRect(),
        bounds: ctx.container ? ctx.container.getBoundingClientRect() : ctx.boundsRect,
        overlapsBefore: overlapsOf(el),
        start: {
          left: px(cs.left, el.offsetLeft),
          top: px(cs.top, el.offsetTop),
          width: el.offsetWidth,
          height: el.offsetHeight,
          // the scale the element has right now (the template's own, or one already saved)
          scaleX: M.parseScaleProperty(cs.scale)[0],
          scaleY: M.parseScaleProperty(cs.scale)[3],
        },
      };
      e.preventDefault();
      e.stopPropagation();
      // keep receiving move/up even when the pointer leaves the iframe, or the drag would hang
      try {
        (kind === "resize" ? handles[dir] : el).setPointerCapture(e.pointerId);
      } catch (_) {
        /* capture is a convenience; dragging still works inside the frame */
      }
    } catch (err) {
      drag = null;
      fail(err instanceof Error ? err.message : String(err));
    }
  }
  function startMove(e, el) {
    begin("move", e, el);
  }
  function startResize(e, dir) {
    if (!selected) return;
    if (modeOf(selected) === "scale") return beginScale(e, selected, dir);
    begin("resize", e, selected, dir);
  }

  /** Resize of a picture in the page flow: zoom about its centre, limited by the area it sits in. */
  function beginScale(e, el, dir) {
    try {
      var cs = getComputedStyle(el);
      var sc = M.parseScaleProperty(cs.scale);
      var cb = containingBlock(el, "absolute");
      var box = el.getBoundingClientRect();
      var own = el.offsetWidth > 0 ? box.width / (el.offsetWidth * sc[0]) : 1;
      drag = {
        kind: "resize",
        scaleOnly: true,
        dir: dir,
        el: el,
        id: el.getAttribute("data-edit-id"),
        startX: e.clientX,
        startY: e.clientY,
        box: box,
        bounds: (cb || document.documentElement).getBoundingClientRect(),
        unitScale: own > 0 ? own : 1,
        overlapsBefore: overlapsOf(el),
        start: { scaleX: sc[0], scaleY: sc[3] },
      };
      e.preventDefault();
      e.stopPropagation();
      try {
        handles[dir].setPointerCapture(e.pointerId);
      } catch (_) {
        /* capture is a convenience */
      }
    } catch (err) {
      drag = null;
      fail(err instanceof Error ? err.message : String(err));
    }
  }
  function onPointerMove(e) {
    if (!editMode) return;
    if (!drag) {
      var el = editableOf(e.target);
      if (el !== hovered) {
        hovered = el;
        syncOverlay();
      }
      return;
    }
    var dx = e.clientX - drag.startX;
    var dy = e.clientY - drag.startY;
    var bp = currentBreakpoint();
    if (drag.kind === "move") {
      // the element may not leave the container it is positioned in
      var c = M.clampDelta(drag.box, drag.bounds, dx, dy);
      setLive(drag.id, bp, M.dragToOverride(drag.start, c.x, c.y, drag.ctx.matrix, drag.ctx.parent, drag.ctx.unit));
    } else {
      resizeTo(bp, dx, dy, e.shiftKey);
    }
    e.preventDefault();
  }
  /**
   * Resize = scale. The new box is worked out in viewport space (limits, minimum size, ratio lock), then
   * turned into CSS `scale` factors relative to the element's current ones, so everything inside it
   * (pictures with fixed sizes, groups of pictures) changes size together. left/top are then corrected
   * by what the element REALLY draws, so the edge or corner opposite to the handle stays put whatever
   * the template's own anchoring (translate(-50%), right/bottom offsets, transform-origin) is.
   */
  function resizeTo(bp, dx, dy, free) {
    if (drag.scaleOnly) {
      var f = M.scaleAboutCenter(drag.box, drag.dir, dx, dy, { container: drag.bounds, minPx: M.MIN_SIZE * drag.unitScale, keepRatio: !free });
      var clamp = function (v) {
        return Math.round(Math.min(Math.max(v, 0.1), 5) * 1000) / 1000;
      };
      setLive(drag.id, bp, { scaleX: clamp(drag.start.scaleX * f.sx), scaleY: clamp(drag.start.scaleY * f.sy) });
      return;
    }
    var B = drag.box;
    var scale = Math.hypot(drag.ctx.matrix[0], drag.ctx.matrix[1]);
    var D = M.resizeBox(B, drag.dir, dx, dy, { container: drag.bounds, minPx: M.MIN_SIZE * scale, keepRatio: !free });
    var pw = drag.ctx.parent.width;
    var ph = drag.ctx.parent.height;
    var lim = function (v) {
      return Math.min(Math.max(v, 0.1), 5);
    };
    // left/top in the context's unit: % of the containing block, or px for a fixed element in the viewport
    var pos = function (v, size) {
      return drag.ctx.unit === "px" ? Math.round(v * 100) / 100 + "px" : pct((v / size) * 100);
    };
    var ov = {
      left: pos(drag.start.left, pw),
      top: pos(drag.start.top, ph),
    };
    // Always send BOTH axes: the CSS `scale` property takes both at once, and a missing axis would
    // read as 1 and visibly collapse the other one while dragging an edge.
    var round3 = function (v) {
      return Math.round(lim(v) * 1000) / 1000;
    };
    ov.scaleX = /[ew]/.test(drag.dir) ? round3(drag.start.scaleX * ((D.right - D.left) / (B.right - B.left))) : round3(drag.start.scaleX);
    ov.scaleY = /[ns]/.test(drag.dir) ? round3(drag.start.scaleY * ((D.bottom - D.top) / (B.bottom - B.top))) : round3(drag.start.scaleY);
    setLive(drag.id, bp, ov);
    var A = drag.el.getBoundingClientRect();
    var err = M.viewportDeltaToLocal(drag.ctx.matrix, D.left - A.left, D.top - A.top);
    setLive(drag.id, bp, {
      left: pos(drag.start.left + err.x, pw),
      top: pos(drag.start.top + err.y, ph),
    });
  }
  function onPointerUp() {
    if (!drag) return;
    var id = drag.id;
    var bp = currentBreakpoint();
    var o = live[id] && live[id][bp];
    // warn (not block) about overlaps this change created; ones that already existed are normal
    var warnings = [];
    if (o) {
      var before = drag.overlapsBefore;
      overlapsOf(drag.el).forEach(function (other) {
        if (before.indexOf(other) < 0) warnings.push("Đè lên " + other);
      });
    }
    drag = null;
    if (o) send("LAYOUT_CHANGED", { editId: id, breakpoint: bp, override: o, warnings: warnings.slice(0, 5) });
    if (selected) send("SELECTED", describe(selected));
  }
  // In edit mode the page is a canvas: links, buttons and native image drag must not fire.
  function swallow(e) {
    if (editMode) {
      e.preventDefault();
      e.stopPropagation();
    }
  }

  // ---------- commands from the editor ----------
  function handleCommand(type, p) {
    if (type === "INIT" || type === "SET_EDIT_MODE") {
      buildOverlay();
      editMode = p.editMode;
      if (!editMode) {
        hovered = null;
        selected = null;
      }
      syncOverlay();
      // READY is announced once at start-up; the editor answers it with INIT, so answering INIT
      // with READY again would ping-pong forever. STATE carries the same data and ends the exchange.
      if (type === "INIT") sendState("STATE");
    } else if (type === "SELECT") {
      var el = p.editId ? byId(p.editId) : null;
      if (p.editId && !el) return fail("element not found: " + p.editId);
      // picked from the editor's list: bring it on screen so the operator sees what was selected
      if (el && getComputedStyle(el).display !== "none") {
        try {
          el.scrollIntoView({ block: "center", inline: "nearest" });
        } catch (_) {
          el.scrollIntoView();
        }
      }
      select(el);
      setTimeout(syncOverlay, 120);
    } else if (type === "UPDATE_LAYOUT") {
      setLive(p.editId, p.breakpoint, p.override);
    } else if (type === "RESET") {
      if (p.editId) delete live[p.editId];
      else live = {};
      renderLive();
    } else if (type === "RELOAD_MEDIA") {
      reloadMedia(p.paths);
    } else if (type === "RELOAD_CSS") {
      live = {};
      var link = document.getElementById("__ve_css");
      if (link) link.href = link.getAttribute("data-base") + "?v=" + Date.now();
      renderLive();
    }
  }
  var lastIds = "";
  function currentPath() {
    return location.pathname + location.search;
  }
  function currentIds() {
    var ids = Array.prototype.map.call(document.querySelectorAll("[data-edit-id]"), function (n) {
      return n.getAttribute("data-edit-id");
    });
    return ids.filter(function (v, i) { return ids.indexOf(v) === i; });
  }
  /**
   * A picture file was replaced on disk: make the page fetch it again by adding a throw-away query to every
   * src / srcset / poster that points at it (the browser would otherwise keep showing the old bytes).
   */
  function reloadMedia(paths) {
    var stamp = String(Date.now());
    function hits(u) {
      try {
        var pn = new URL(u, location.href).pathname;
        return paths.some(function (w) {
          return pn === w || pn.endsWith(w);
        });
      } catch (_) {
        return false;
      }
    }
    function bump(u) {
      var url = new URL(u, location.href);
      url.searchParams.set("ve", stamp);
      return url.href;
    }
    var nodes = document.querySelectorAll("img, source, video");
    for (var i = 0; i < nodes.length; i++) {
      var n = nodes[i];
      ["src", "poster"].forEach(function (a) {
        var v = n.getAttribute(a);
        if (v && hits(v)) n.setAttribute(a, bump(v));
      });
      var ss = n.getAttribute("srcset");
      if (ss) {
        var changed = false;
        var out = ss.split(",").map(function (part) {
          var bits = part.trim().split(/\s+/);
          if (bits[0] && hits(bits[0])) {
            bits[0] = bump(bits[0]);
            changed = true;
          }
          return bits.join(" ");
        });
        if (changed) n.setAttribute("srcset", out.join(", "));
      }
    }
  }
  function sendState(type) {
    var ids = currentIds();
    lastIds = currentPath() + "#" + ids.join("|");
    send(type, { path: currentPath(), editIds: ids, viewport: { width: window.innerWidth, height: window.innerHeight } });
  }

  window.addEventListener("message", function (ev) {
    if (ev.source !== window.parent || ev.origin !== cfg.editorOrigin) return;
    var r = P.validate(ev.data, "toInspector");
    if (!r.ok) return fail("rejected message: " + r.reason);
    handleCommand(r.type, r.payload);
  });

  // read-only hook so the end-to-end tests measure against the SAME containing block the inspector uses
  window.__veContainerOf = function (el) {
    return containingBlock(el, getComputedStyle(el).position);
  };

  window.addEventListener("pointerdown", onPointerDown, true);
  window.addEventListener("pointermove", onPointerMove, true);
  window.addEventListener("pointerup", onPointerUp, true);
  window.addEventListener("click", swallow, true);
  window.addEventListener("dblclick", swallow, true);
  window.addEventListener("dragstart", swallow, true);
  window.addEventListener("submit", swallow, true);
  window.addEventListener("scroll", syncOverlay, true);
  window.addEventListener("resize", syncOverlay);
  setInterval(function () {
    if (editMode && !drag) syncOverlay();
    // elements appear after hydration / route changes: tell the editor when the set changes
    if (!drag && currentPath() + "#" + currentIds().join("|") !== lastIds) sendState("STATE");
  }, 300);

  // The editor answers READY with INIT; the editor may also INIT first.
  function announce() {
    buildOverlay();
    overlay.style.display = "none";
    sendState("READY");
  }
  if (document.readyState === "complete") announce();
  else window.addEventListener("load", announce);
})();
