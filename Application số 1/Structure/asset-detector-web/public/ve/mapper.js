/**
 * Coordinate mapper for the visual editor (Structure/14-PLAN-visual-editing.md, section 7).
 *
 * Plain UMD file so the SAME code runs inside the cloned site (loaded by
 * inspector.js) and in vitest. Only 2D affine matrices are needed:
 * [a, b, c, d, e, f] is CSS matrix(a, b, c, d, e, f), i.e.
 *   x' = a*x + c*y + e ;  y' = b*x + d*y + f
 *
 * Dragging only needs the LINEAR part (a, b, c, d) of the transform chain above
 * the element: a pointer delta in viewport pixels is turned into a delta in the
 * parent's own CSS pixels by the inverse linear part. The translation part and
 * transform-origin only move the whole box, never a delta, so they cancel out.
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.VEMapper = factory();
})(typeof self !== "undefined" ? self : this, function () {
  var IDENTITY = [1, 0, 0, 1, 0, 0];

  /** Parses a computed `transform` value ("none", matrix(...), matrix3d(...)). */
  function parseTransform(css) {
    if (!css || css === "none") return IDENTITY.slice();
    var m = /^(matrix3d|matrix)\(([^)]*)\)$/.exec(String(css).trim());
    if (!m) throw new Error("unsupported transform: " + css);
    var n = m[2].split(",").map(function (s) {
      return parseFloat(s);
    });
    if (n.some(isNaN)) throw new Error("bad transform numbers: " + css);
    if (m[1] === "matrix") {
      if (n.length !== 6) throw new Error("matrix() needs 6 numbers");
      return n;
    }
    if (n.length !== 16) throw new Error("matrix3d() needs 16 numbers");
    // column-major 4x4: m11 m12 . . | m21 m22 . . | . . . . | m41 m42 . .
    return [n[0], n[1], n[4], n[5], n[12], n[13]];
  }

  /** a · b : apply b first, then a. */
  function multiply(a, b) {
    return [
      a[0] * b[0] + a[2] * b[1],
      a[1] * b[0] + a[3] * b[1],
      a[0] * b[2] + a[2] * b[3],
      a[1] * b[2] + a[3] * b[3],
      a[0] * b[4] + a[2] * b[5] + a[4],
      a[1] * b[4] + a[3] * b[5] + a[5],
    ];
  }

  /** Composes ancestors given outermost first (document root ... direct parent). */
  function compose(chain) {
    return chain.reduce(multiply, IDENTITY.slice());
  }

  function invert(m) {
    var det = m[0] * m[3] - m[1] * m[2];
    if (!isFinite(det) || Math.abs(det) < 1e-12) throw new Error("transform is not invertible");
    return [
      m[3] / det,
      -m[1] / det,
      -m[2] / det,
      m[0] / det,
      (m[2] * m[5] - m[3] * m[4]) / det,
      (m[1] * m[4] - m[0] * m[5]) / det,
    ];
  }

  function applyToPoint(m, p) {
    return { x: m[0] * p.x + m[2] * p.y + m[4], y: m[1] * p.x + m[3] * p.y + m[5] };
  }

  /** Viewport pointer delta -> delta in the parent's local CSS pixels (linear part only). */
  function viewportDeltaToLocal(chainMatrix, dx, dy) {
    var inv = invert(chainMatrix);
    return { x: inv[0] * dx + inv[2] * dy, y: inv[1] * dx + inv[3] * dy };
  }

  /** Smallest size (design px) an element may be resized to. */
  var MIN_SIZE = 24;

  /**
   * Limits a viewport-pixel move so the element's box stays inside its container.
   * box/container: { left, top, right, bottom } in viewport px (getBoundingClientRect).
   * It never forces a move: an element that already sticks out may stay where it is,
   * it just cannot go further out. An axis where the box is larger than the container is left free.
   */
  function clampDelta(box, container, dx, dy) {
    function axis(bMin, bMax, cMin, cMax, d) {
      if (bMax - bMin >= cMax - cMin) return d;
      var lo = Math.min(0, cMin - bMin);
      var hi = Math.max(0, cMax - bMax);
      return Math.min(Math.max(d, lo), hi);
    }
    return {
      x: axis(box.left, box.right, container.left, container.right, dx),
      y: axis(box.top, box.bottom, container.top, container.bottom, dy),
    };
  }

  function round(n) {
    return Math.round(n * 1000) / 1000;
  }

  /**
   * Result of dragging a positioned element.
   * start: { left, top } computed px of the element inside its parent.
   * parent: { width, height } the parent's own (untransformed) CSS size in px.
   * Returns percentages of the parent so the result keeps following it.
   */
  function dragToOverride(start, dxView, dyView, chainMatrix, parent, unit) {
    var d = viewportDeltaToLocal(chainMatrix, dxView, dyView);
    // a position:fixed element straight in the viewport is saved in px (a % of the window would change with it)
    if (unit === "px") return { left: round(start.left + d.x) + "px", top: round(start.top + d.y) + "px" };
    return {
      left: round(((start.left + d.x) / parent.width) * 100) + "%",
      top: round(((start.top + d.y) / parent.height) * 100) + "%",
    };
  }

  /**
   * New box for a resize drag, in viewport pixels.
   * box: { left, top, right, bottom } at drag start.  handle: n ne e se s sw w nw.
   * dx/dy: pointer movement in viewport px.
   * opts.container: { left, top, right, bottom }  the box may not grow past it.
   * opts.minPx: smallest allowed side in viewport px.
   * opts.keepRatio: corner handles keep the aspect ratio (edge handles always change one side only).
   * An edge never moves the opposite edge. An element already past the container may stay, not grow further out.
   */
  function resizeBox(box, handle, dx, dy, opts) {
    var w0 = box.right - box.left;
    var h0 = box.bottom - box.top;
    var east = handle.indexOf("e") >= 0;
    var west = handle.indexOf("w") >= 0;
    var south = handle.indexOf("s") >= 0;
    var north = handle.indexOf("n") >= 0;
    var c = opts.container;
    var minW = Math.min(opts.minPx, w0);
    var minH = Math.min(opts.minPx, h0);
    var l = box.left;
    var r = box.right;
    var t = box.top;
    var b = box.bottom;

    if ((east || west) && (south || north) && opts.keepRatio) {
      // corner, proportional: one scale for both sides, limited by every edge that moves
      var nw = w0 + (east ? dx : -dx);
      var nh = h0 + (south ? dy : -dy);
      var sx = nw / w0;
      var sy = nh / h0;
      var s = Math.abs(sx - 1) >= Math.abs(sy - 1) ? sx : sy;
      var maxS = Infinity;
      if (east) maxS = Math.min(maxS, (Math.max(c.right, box.right) - box.left) / w0);
      if (west) maxS = Math.min(maxS, (box.right - Math.min(c.left, box.left)) / w0);
      if (south) maxS = Math.min(maxS, (Math.max(c.bottom, box.bottom) - box.top) / h0);
      if (north) maxS = Math.min(maxS, (box.bottom - Math.min(c.top, box.top)) / h0);
      var minS = Math.max(minW / w0, minH / h0);
      s = Math.max(Math.min(s, Math.max(maxS, 1)), Math.min(minS, 1));
      if (east) r = l + w0 * s;
      else l = r - w0 * s;
      if (south) b = t + h0 * s;
      else t = b - h0 * s;
    } else {
      if (east) r = Math.min(box.right + dx, Math.max(c.right, box.right));
      if (west) l = Math.max(box.left + dx, Math.min(c.left, box.left));
      if (south) b = Math.min(box.bottom + dy, Math.max(c.bottom, box.bottom));
      if (north) t = Math.max(box.top + dy, Math.min(c.top, box.top));
      if (r - l < minW) {
        if (east) r = l + minW;
        else l = r - minW;
      }
      if (b - t < minH) {
        if (south) b = t + minH;
        else t = b - minH;
      }
    }
    return { left: l, top: t, right: r, bottom: b };
  }

  /**
   * Resize for a picture that cannot be moved (it flows in the page): it is zoomed about its own centre.
   * Same inputs as resizeBox. Returns { sx, sy }, the factors to multiply the element's CURRENT scale by.
   * A corner keeps the ratio unless keepRatio is false; an edge changes one axis. The zoomed box may not
   * leave the container (an element already outside is not forced back, it just cannot grow further out).
   */
  function scaleAboutCenter(box, handle, dx, dy, opts) {
    var w0 = box.right - box.left;
    var h0 = box.bottom - box.top;
    var unbounded = { left: -1e9, top: -1e9, right: 1e9, bottom: 1e9 };
    var D = resizeBox(box, handle, dx, dy, { container: unbounded, minPx: opts.minPx, keepRatio: opts.keepRatio });
    var sx = (D.right - D.left) / w0;
    var sy = (D.bottom - D.top) / h0;
    var c = opts.container;
    var cx = (box.left + box.right) / 2;
    var cy = (box.top + box.bottom) / 2;
    var maxX = Math.max(1, (2 * Math.min(cx - c.left, c.right - cx)) / w0);
    var maxY = Math.max(1, (2 * Math.min(cy - c.top, c.bottom - cy)) / h0);
    if (Math.abs(sx - sy) < 1e-9 && sx !== 1) {
      var s = Math.min(sx, maxX, maxY);
      return { sx: s, sy: s };
    }
    return { sx: Math.min(sx, maxX), sy: Math.min(sy, maxY) };
  }

  /**
   * Which layout breakpoint a viewport width belongs to. Mirrors
   * BREAKPOINT_MEDIA in layout-compile.ts (the template switches its scale
   * base at 768/769px): desktop > 768, tablet 481-768, mobile <= 480.
   */
  function breakpointOf(width) {
    if (width > 768) return "desktop";
    if (width > 480) return "tablet";
    return "mobile";
  }

  /** CSS `scale` property value ("none" | "s" | "sx sy") as a matrix; 3D/other forms are rejected. */
  function parseScaleProperty(v) {
    if (!v || v === "none") return IDENTITY.slice();
    var parts = String(v).trim().split(/\s+/).map(parseFloat);
    if (parts.length > 2 || parts.some(isNaN)) throw new Error("unsupported scale: " + v);
    return [parts[0], 0, 0, parts.length === 2 ? parts[1] : parts[0], 0, 0];
  }

  // Mirrors BREAKPOINT_MEDIA in layout-compile.ts (a test keeps them equal).
  var BREAKPOINT_MEDIA = {
    desktop: "(min-width: 769px)",
    tablet: "(min-width: 481px) and (max-width: 768px)",
    mobile: "(max-width: 480px)",
  };

  /** Declarations for one override; mirrors layout-compile.ts (a test keeps them equal). */
  function overrideDeclarations(o) {
    var d = [];
    if (o.left !== undefined) d.push("left: " + o.left.trim(), "right: auto");
    if (o.top !== undefined) d.push("top: " + o.top.trim(), "bottom: auto");
    if (o.width !== undefined) d.push("width: " + o.width.trim());
    if (o.height !== undefined) d.push("height: " + o.height.trim());
    // "scale" is the individual CSS property: it scales the element and everything in it (pictures with
    // their own fixed sizes, groups of pictures) and composes with the template's own transform.
    if (o.scaleX !== undefined || o.scaleY !== undefined) {
      var sx = o.scaleX !== undefined ? o.scaleX : 1;
      var sy = o.scaleY !== undefined ? o.scaleY : 1;
      d.push("scale: " + sx + " " + sy);
    }
    if (o.zIndex !== undefined) d.push("z-index: " + o.zIndex);
    if (o.hidden === true) d.push("display: none");
    return d;
  }

  return {
    MIN_SIZE: MIN_SIZE,
    clampDelta: clampDelta,
    BREAKPOINT_MEDIA: BREAKPOINT_MEDIA,
    overrideDeclarations: overrideDeclarations,
    breakpointOf: breakpointOf,
    parseScaleProperty: parseScaleProperty,
    IDENTITY: IDENTITY,
    parseTransform: parseTransform,
    multiply: multiply,
    compose: compose,
    invert: invert,
    applyToPoint: applyToPoint,
    viewportDeltaToLocal: viewportDeltaToLocal,
    dragToOverride: dragToOverride,
    resizeBox: resizeBox,
    scaleAboutCenter: scaleAboutCenter,
  };
});
