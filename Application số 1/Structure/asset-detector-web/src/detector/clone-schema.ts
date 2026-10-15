import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import type { DetectionResult, FrameworkInfo } from "./types";
import type { TemplateRef } from "./template-store";

// The long-lived record of a game: what the detector found + which frozen
// template it was found in. Committed to git (one JSON per game); the
// template archive itself lives in template-store/ and is only *referenced*
// here by version + hash.
//
//   draft  — schema exists but the snapshot is not proven; keep the live template.
//   frozen — snapshot re-extracted and re-detected to the same result; the
//            live template folder may be deleted.

export const SCHEMA_DIR = path.resolve(process.cwd(), "..", "clone-schemas");
export const CURRENT_SCHEMA_VERSION = 1;

export type SchemaStatus = "draft" | "frozen";

export interface SchemaVerification {
  verifiedAt: string;
  treeHashMatches: boolean; // extracted snapshot == hash recorded in the manifest
  detectionMatches: boolean; // re-detect on the extracted snapshot == stored detection
  assetCount: number;
  mismatches: string[]; // human-readable, empty when both flags are true
}

// Detection minus machine-specific / volatile fields (absolute repoPath,
// timestamp, duration) so the committed file diffs only on real changes.
export type StoredDetection = Omit<DetectionResult, "repoPath" | "detectedAt" | "durationMs">;

export interface CloneSchema {
  schemaVersion: number;
  gameId: string;
  displayName: string;
  status: SchemaStatus;
  templateRef: TemplateRef;
  framework: FrameworkInfo;
  detection: StoredDetection;
  verification: SchemaVerification;
  createdAt: string;
  updatedAt: string;
}

// Add an entry per old version: it receives the raw object and returns it
// upgraded by one version. Nothing to migrate yet (v1 is the first).
const MIGRATIONS: Record<number, (raw: Record<string, unknown>) => Record<string, unknown>> = {};

export function parseCloneSchema(raw: unknown): CloneSchema {
  if (!raw || typeof raw !== "object") throw new Error("schema không phải object");
  let obj = raw as Record<string, unknown>;
  if (typeof obj.schemaVersion !== "number") throw new Error("schema thiếu schemaVersion");
  let v: number = obj.schemaVersion;
  if (v > CURRENT_SCHEMA_VERSION) {
    throw new Error(`schemaVersion ${v} mới hơn tool hỗ trợ (${CURRENT_SCHEMA_VERSION}) — cập nhật tool.`);
  }
  while (v < CURRENT_SCHEMA_VERSION) {
    const step = MIGRATIONS[v];
    if (!step) throw new Error(`không có migration từ schemaVersion ${v}`);
    obj = step(obj);
    v = obj.schemaVersion as number;
  }
  const ref = obj.templateRef as TemplateRef | undefined;
  const ok =
    typeof obj.gameId === "string" &&
    (obj.status === "draft" || obj.status === "frozen") &&
    !!ref &&
    typeof ref.version === "number" &&
    typeof ref.contentHash === "string" &&
    typeof ref.archiveSha256 === "string" &&
    typeof ref.repoDir === "string" &&
    !!obj.detection &&
    typeof obj.detection === "object";
  if (!ok) throw new Error("schema thiếu trường bắt buộc (gameId/status/templateRef/detection)");
  return obj as unknown as CloneSchema;
}

function schemaPath(gameId: string): string {
  return path.join(SCHEMA_DIR, `${gameId}.json`);
}

/** null when the game has no schema; throws on a schema that exists but is invalid. */
export function readCloneSchema(gameId: string): CloneSchema | null {
  const file = schemaPath(gameId);
  if (!existsSync(file)) return null;
  return parseCloneSchema(JSON.parse(readFileSync(file, "utf8")));
}

export function writeCloneSchema(schema: CloneSchema): void {
  mkdirSync(SCHEMA_DIR, { recursive: true });
  writeFileSync(schemaPath(schema.gameId), JSON.stringify(schema, null, 2) + "\n");
}

export function listCloneSchemas(): CloneSchema[] {
  if (!existsSync(SCHEMA_DIR)) return [];
  return readdirSync(SCHEMA_DIR)
    .filter((f) => f.endsWith(".json"))
    .flatMap((f) => {
      try {
        return [parseCloneSchema(JSON.parse(readFileSync(path.join(SCHEMA_DIR, f), "utf8")))];
      } catch {
        return []; // a broken file must not hide the other games
      }
    });
}

export function toStoredDetection(d: DetectionResult): StoredDetection {
  const { repoPath: _r, detectedAt: _t, durationMs: _d, ...rest } = d;
  void _r;
  void _t;
  void _d;
  return rest;
}

/**
 * Order-independent fingerprint of what matters for cloning. Two detections
 * with the same signature produce the same wizard slots and the same clone.
 */
export function detectionSignature(d: StoredDetection | DetectionResult): string[] {
  return [
    ...d.assets.map((a) => `asset|${a.id}|${a.hash}|${a.section}|${a.responsive}`),
    ...d.dynamicBlocks.map((b) => `block|${b.id}|${b.type}|${b.apiEndpoint}`),
    ...d.swipers.map((s) => `swiper|${s.id}|${s.slideCount}`),
  ].sort();
}

export function diffSignatures(expected: string[], actual: string[]): string[] {
  const a = new Set(actual);
  const e = new Set(expected);
  return [
    ...expected.filter((x) => !a.has(x)).map((x) => `thiếu: ${x}`),
    ...actual.filter((x) => !e.has(x)).map((x) => `thừa: ${x}`),
  ];
}
