// Shared shapes for the operator wizard — built server-side in page.tsx from
// DetectedAsset/DynamicBlock/TextSlotValue (see @/detector/types,
// @/detector/site-text), flattened into what the client components need.

export type CropAnchor =
  | "attention"
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

export type PsdDevice = "mobile" | "desktop";

/**
 * One replaceable image of a slot for a given device. A per-breakpoint slot has
 * a target per device (each with its own real size); a shared slot has a single
 * "shared" target. PSD mapping works per target because the mobile and desktop
 * designs are separate PSD files.
 */
export interface CloneSlotTarget {
  device: PsdDevice | "shared";
  label: string;
  /** Repo path of the current image, used for the "original" thumbnail. */
  previewPath: string;
  targetPaths: string[];
  width?: number;
  height?: number;
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
  targets: CloneSlotTarget[];
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
}
