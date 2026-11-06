import { mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { getGameDisplayName, resolveGame } from "./config";
import { detectRepo, runDetection } from "./run";
import { freezeTemplate, materializeTemplate, hashTree, listFiles, readManifest } from "./template-store";
import {
  CURRENT_SCHEMA_VERSION,
  detectionSignature,
  diffSignatures,
  readCloneSchema,
  toStoredDetection,
  writeCloneSchema,
  type CloneSchema,
  type SchemaVerification,
} from "./clone-schema";

/**
 * "Chốt" a game: snapshot the live template, detect it, then PROVE the
 * snapshot is enough by extracting it into a scratch dir and detecting again.
 * The schema becomes `frozen` (live template deletable) only when both the
 * file tree and the detection are identical; otherwise it stays `draft`.
 */
export async function freezeGame(gameId: string): Promise<CloneSchema> {
  const resolved = resolveGame(gameId);
  if (resolved.gameId !== gameId) throw new Error(`Không tìm thấy game "${gameId}".`);
  if (resolved.source !== "live") {
    throw new Error(`"${gameId}" đang chạy từ snapshot — cần template gốc (live) để chốt phiên bản mới.`);
  }

  const detection = await runDetection(gameId, { force: true });
  const manifest = freezeTemplate(gameId, resolved.repoPath);
  const stored = toStoredDetection(detection);

  const verification = await verifySnapshot(gameId, manifest, detectionSignature(stored));

  const prev = readCloneSchema(gameId);
  const now = new Date().toISOString();
  const schema: CloneSchema = {
    schemaVersion: CURRENT_SCHEMA_VERSION,
    gameId,
    displayName: getGameDisplayName(gameId),
    status: verification.treeHashMatches && verification.detectionMatches ? "frozen" : "draft",
    templateRef: {
      version: manifest.version,
      contentHash: manifest.contentHash,
      archiveSha256: manifest.archiveSha256,
      repoDir: manifest.repoDir,
      sourceCommit: manifest.sourceCommit,
    },
    framework: detection.framework,
    detection: stored,
    verification,
    createdAt: prev?.createdAt ?? now,
    updatedAt: now,
  };
  writeCloneSchema(schema);
  return schema;
}

async function verifySnapshot(
  gameId: string,
  ref: NonNullable<ReturnType<typeof readManifest>>,
  expectedSignature: string[]
): Promise<SchemaVerification> {
  const scratch = mkdtempSync(path.join(os.tmpdir(), "template-verify-"));
  const mismatches: string[] = [];
  try {
    // materializeTemplate already throws on a bad archive hash; a tree-hash
    // mismatch is reported as a failed check instead of aborting the freeze.
    let repoPath: string | null = null;
    let treeHashMatches = true;
    try {
      repoPath = materializeTemplate(gameId, ref, scratch);
    } catch (e) {
      treeHashMatches = false;
      mismatches.push(e instanceof Error ? e.message : String(e));
    }

    let detectionMatches = false;
    let assetCount = 0;
    if (repoPath) {
      // Belt and braces: materialize checks this too, but the value is cheap
      // to show and keeps the two checks independent in the report.
      treeHashMatches = hashTree(repoPath, listFiles(repoPath)).hash === ref.contentHash;
      if (!treeHashMatches) mismatches.push("hash cây file sau giải nén khác manifest");
      const again = toStoredDetection(await detectRepo(gameId, repoPath));
      assetCount = again.assets.length;
      const diff = diffSignatures(expectedSignature, detectionSignature(again));
      detectionMatches = diff.length === 0;
      mismatches.push(...diff.slice(0, 20));
    }
    return { verifiedAt: new Date().toISOString(), treeHashMatches, detectionMatches, assetCount, mismatches };
  } finally {
    rmSync(scratch, { recursive: true, force: true });
  }
}
