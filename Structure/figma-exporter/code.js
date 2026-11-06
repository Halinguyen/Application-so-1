// Runs inside Figma. Exports every candidate node of the selected frames as a PNG named after its node id, plus nodes.json with
// what the asset mapper needs (id, layer name, type, parent, size, visibility, text). The ZIP is assembled in ui.html and loaded
// into the wizard ("Nhập ZIP export từ Figma"). Nothing leaves the machine: the manifest allows no network access.

figma.showUI(__html__, { width: 380, height: 360 });

var CANDIDATE_TYPES = { RECTANGLE: true, INSTANCE: true, GROUP: true, FRAME: true, COMPONENT: true };
var MAX_SIDE = 4000; // a full-page background is not a slot-sized asset and would make the ZIP huge

function sanitize(id) {
  return id.replace(/[:;]/g, "_");
}

function hasImageFill(node) {
  return Array.isArray(node.fills) && node.fills.some(function (f) {
    return f.type === "IMAGE" && f.visible !== false;
  });
}

function isSolid(node) {
  return node.type === "RECTANGLE" && !hasImageFill(node) && Array.isArray(node.fills) && node.fills.some(function (f) {
    return f.type === "SOLID" && f.visible !== false;
  });
}

figma.ui.onmessage = async function (msg) {
  if (msg.type === "close") {
    figma.closePlugin();
    return;
  }
  if (msg.type !== "export") return;

  var frames = figma.currentPage.selection.filter(function (n) {
    return n.type === "FRAME";
  });
  if (frames.length === 0) {
    figma.ui.postMessage({ type: "error", message: "Chọn ít nhất một frame (ví dụ Trang chủ, Bảng xếp hạng) rồi bấm lại." });
    return;
  }

  var scale = msg.scale === 1 ? 1 : 2;
  var nodes = [];
  var queue = []; // nodes that get a PNG

  function walk(node, parentId, frameId) {
    var box = node.absoluteBoundingBox;
    if (parentId !== null && box) {
      var info = {
        id: node.id,
        name: node.name,
        type: node.type,
        parent: parentId,
        frame: frameId,
        w: Math.round(box.width),
        h: Math.round(box.height),
        visible: node.visible !== false,
        hasImage: hasImageFill(node),
        solid: isSolid(node)
      };
      if (node.type === "TEXT") info.text = String(node.characters || "").slice(0, 60);
      nodes.push(info);
      if (info.visible && CANDIDATE_TYPES[node.type] && info.w >= 8 && info.h >= 8 && info.w <= MAX_SIDE && info.h <= MAX_SIDE) queue.push(node);
    }
    if ("children" in node) {
      for (var i = 0; i < node.children.length; i++) walk(node.children[i], node.id, frameId);
    }
  }

  frames.forEach(function (frame) {
    var box = frame.absoluteBoundingBox;
    nodes.push({
      id: frame.id, name: frame.name, type: frame.type, parent: null, frame: frame.id,
      w: Math.round(box ? box.width : frame.width), h: Math.round(box ? box.height : frame.height),
      visible: true, hasImage: false, solid: false
    });
    for (var c = 0; c < frame.children.length; c++) walk(frame.children[c], frame.id, frame.id);
  });

  for (var i = 0; i < queue.length; i++) {
    var node = queue[i];
    try {
      // useAbsoluteBounds keeps the node's whole box (a group whose text is narrower than the box is not trimmed)
      var bytes = await node.exportAsync({ format: "PNG", constraint: { type: "SCALE", value: scale }, useAbsoluteBounds: true });
      figma.ui.postMessage({ type: "file", name: "assets/" + sanitize(node.id) + ".png", bytes: bytes });
    } catch (e) {
      figma.ui.postMessage({ type: "warn", message: node.name + " (" + node.id + "): " + String(e) });
    }
    if (i % 10 === 0) figma.ui.postMessage({ type: "progress", done: i + 1, total: queue.length });
  }

  figma.ui.postMessage({
    type: "done",
    meta: { fileKey: figma.fileKey || null, exportedAt: new Date().toISOString(), scale: scale, frames: frames.map(function (f) { return { id: f.id, name: f.name }; }), nodes: nodes }
  });
};
