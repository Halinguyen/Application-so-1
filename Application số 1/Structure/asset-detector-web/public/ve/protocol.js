/**
 * postMessage protocol between the editor (parent page) and the inspector that
 * runs inside the cloned site's iframe. UMD: used by inspector.js, by the
 * editor, and by vitest. Only the commands listed here are accepted; nothing
 * a message carries is ever evaluated as code.
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.VEProtocol = factory();
})(typeof self !== "undefined" ? self : this, function () {
  var VERSION = 1;
  var BREAKPOINTS = ["desktop", "tablet", "mobile"];
  var EDIT_ID = /^[a-z0-9][a-z0-9._-]*(~\d+)?$/;
  var LENGTH = /^-?\d+(\.\d+)?(%|px|vw|vh|rem|em)?$/;

  // Operator limits. layout-schema.ts holds the same numbers (a test keeps them equal).
  var LIMITS = { zMin: -10, zMax: 999, pctMin: -50, pctMax: 150, sizePctMax: 200, absMax: 10000, scaleMin: 0.1, scaleMax: 5 };

  function scaleOk(v) {
    return typeof v === "number" && isFinite(v) && v >= LIMITS.scaleMin && v <= LIMITS.scaleMax;
  }

  /** key: left | top | width | height. Plain length, inside the allowed range, size strictly positive. */
  function lengthOk(key, v) {
    if (typeof v !== "string" || !LENGTH.test(v.trim())) return false;
    var n = parseFloat(v);
    var unit = v.trim().replace(/^-?[0-9.]+/, "");
    var size = key === "width" || key === "height";
    if (size && !(n > 0)) return false;
    if (unit === "%") return n <= (size ? LIMITS.sizePctMax : LIMITS.pctMax) && (size || n >= LIMITS.pctMin);
    return Math.abs(n) <= LIMITS.absMax;
  }

  function isOverride(o) {
    if (!o || typeof o !== "object") return false;
    var keys = ["left", "top", "width", "height"];
    for (var i = 0; i < keys.length; i++) {
      var v = o[keys[i]];
      if (v !== undefined && !lengthOk(keys[i], v)) return false;
    }
    if (o.scaleX !== undefined && !scaleOk(o.scaleX)) return false;
    if (o.scaleY !== undefined && !scaleOk(o.scaleY)) return false;
    if (o.zIndex !== undefined && !(Number.isInteger(o.zIndex) && o.zIndex >= LIMITS.zMin && o.zIndex <= LIMITS.zMax)) return false;
    if (o.hidden !== undefined && typeof o.hidden !== "boolean") return false;
    return Object.keys(o).every(function (k) {
      return keys.concat(["zIndex", "hidden", "scaleX", "scaleY"]).indexOf(k) >= 0;
    });
  }

  function isEditId(v) {
    return typeof v === "string" && EDIT_ID.test(v);
  }
  function isBreakpoint(v) {
    return BREAKPOINTS.indexOf(v) >= 0;
  }

  // editor -> inspector
  var TO_INSPECTOR = {
    INIT: function (p) {
      return !!p && typeof p.editMode === "boolean";
    },
    SET_EDIT_MODE: function (p) {
      return !!p && typeof p.editMode === "boolean";
    },
    SELECT: function (p) {
      return !!p && (p.editId === null || isEditId(p.editId));
    },
    UPDATE_LAYOUT: function (p) {
      return !!p && isEditId(p.editId) && isBreakpoint(p.breakpoint) && isOverride(p.override);
    },
    RESET: function (p) {
      return !!p && (p.editId === undefined || isEditId(p.editId));
    },
    RELOAD_CSS: function () {
      return true;
    },
    // after a picture file was replaced: the URL paths whose pictures the page must fetch again
    RELOAD_MEDIA: function (p) {
      return (
        !!p &&
        Array.isArray(p.paths) &&
        p.paths.length >= 1 &&
        p.paths.length <= 20 &&
        p.paths.every(function (x) {
          return typeof x === "string" && x.charAt(0) === "/" && x.length < 400 && x.indexOf("..") < 0;
        })
      );
    },
  };

  // inspector -> editor
  var TO_EDITOR = {
    READY: function (p) {
      return !!p && Array.isArray(p.editIds) && p.editIds.every(isEditId);
    },
    // Same payload as READY, but never answered with INIT (that loop would never end).
    STATE: function (p) {
      return !!p && Array.isArray(p.editIds) && p.editIds.every(isEditId);
    },
    SELECTED: function (p) {
      return !!p && (p.editId === null || isEditId(p.editId));
    },
    LAYOUT_CHANGED: function (p) {
      var w = p && p.warnings;
      var warningsOk =
        w === undefined ||
        (Array.isArray(w) &&
          w.length <= 10 &&
          w.every(function (x) {
            return typeof x === "string" && x.length < 200;
          }));
      return !!p && isEditId(p.editId) && isBreakpoint(p.breakpoint) && isOverride(p.override) && warningsOk;
    },
    // The colours at the point the operator pressed (any element, tagged or not): [{ prop, hex, selector }]
    // `selector` names exactly the element that carries the colour, so a change colours that area and nothing else.
    COLOR_PICKED: function (p) {
      return (
        !!p &&
        Array.isArray(p.colors) &&
        p.colors.length <= 3 &&
        p.colors.every(function (c) {
          return (
            !!c &&
            (c.prop === "background" || c.prop === "text" || c.prop === "border") &&
            /^#[0-9a-f]{6}$/.test(c.hex) &&
            typeof c.selector === "string" &&
            c.selector.length > 0 &&
            c.selector.length <= 600 &&
            /^[A-Za-z0-9_\-:#.>()+~ ]+$/.test(c.selector) &&
            (c.similar === undefined ||
              (typeof c.similar === "string" &&
                c.similar.length > 0 &&
                c.similar.length <= 600 &&
                /^[A-Za-z0-9_\-:#.>()+~ ]+$/.test(c.similar) &&
                typeof c.count === "number" &&
                c.count >= 2 &&
                c.count <= 5000))
          );
        })
      );
    },
    ERROR: function (p) {
      return !!p && typeof p.message === "string";
    },
  };

  /**
   * Returns { ok: true, type, payload } or { ok: false, reason }.
   * direction: "toInspector" | "toEditor"
   */
  function validate(msg, direction) {
    if (!msg || typeof msg !== "object") return { ok: false, reason: "not an object" };
    if (msg.channel !== "visual-editing") return { ok: false, reason: "wrong channel" };
    if (msg.protocolVersion !== VERSION) return { ok: false, reason: "protocol version" };
    var table = direction === "toInspector" ? TO_INSPECTOR : TO_EDITOR;
    if (typeof msg.type !== "string" || !Object.prototype.hasOwnProperty.call(table, msg.type)) {
      return { ok: false, reason: "unknown command " + String(msg.type) };
    }
    if (!table[msg.type](msg.payload)) return { ok: false, reason: "bad payload for " + msg.type };
    return { ok: true, type: msg.type, payload: msg.payload };
  }

  function make(type, payload) {
    return { channel: "visual-editing", protocolVersion: VERSION, type: type, payload: payload };
  }

  return { LIMITS: LIMITS, lengthOk: lengthOk, VERSION: VERSION, validate: validate, make: make, isOverride: isOverride, isEditId: isEditId };
});
