// Shared shapes for the operator wizard — built server-side in page.tsx from
// DetectedAsset/DynamicBlock/TextSlotValue (see @/detector/types,
// @/detector/site-text), flattened into what the client components need.

export type CropAnchor =
  | "attention"
  | "crop"
  | "fit"
  | "original"
  | "top"
  | "bottom"
  | "left"
  | "right"
  | "top-left"
  | "top-right"
  | "bottom-left"
  | "bottom-right";

export interface AssetReferenceHint {
  file: string;
  line: number;
  usage: string;
  attribute?: string;
}

export interface CloneSlot {
  id: string;
  label: string;
  section: string;
  previewPath: string;
  targetPaths: string[];
  responsive: string;
  sectionLabel: string;
  sectionOrder: number;
  sectionPosition: string;
  sizeLabel: string;
  needsVisualProof: boolean;
  responsiveLabel: string;
  references: AssetReferenceHint[];
  /** the page draws this picture by its own proportion (w-full, height follows the file): the upload keeps its proportion */
  keepRatio?: boolean;
  /** set when several byte-identical pictures / the icon family were folded into this one slot */
  merged?: { count: number; kind: "icon-family" | "identical" };
}

export interface FigmaSuggestionView {
  slotId: string;
  nodeId: string;
  nodeName: string;
  fileKey: string;
  score: number;
  margin: number;
  status: "auto" | "review" | "none";
  reasons: string[];
  alternatives: { nodeId: string; nodeName: string; score: number }[];
  exportKind: "render" | "render-solid";
  /** One of the slots the matcher was measured on against a hand-checked mapping. */
  poc: boolean;
}

export interface CloneParam {
  /** Extra env keys that receive the same value (one GameId input feeds hub + ranking). */
  alsoEnvKeys?: string[];
  blockLabel: string;
  name: string;
  envKey: string;
  required: boolean;
  options?: string[];
  defaultValue: string;
}

export interface CloneExternalSlot {
  id: string;
  label: string;
  type: string; // "video" | "image"
  url: string;
  localPath: string;
  refFiles: string[];
  sectionLabel: string;
  needsVisualProof: boolean;
  responsiveLabel: string;
  references: AssetReferenceHint[];
}

export interface CloneTextSlot {
  id: string;
  label: string;
  defaultValue: string;
  /** the text is drawn on the page (not a <title>/meta tag): its colour can be changed */
  colorable?: boolean;
}
