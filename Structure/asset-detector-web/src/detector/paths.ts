import { existsSync } from "node:fs";
import os from "node:os";
import path from "node:path";

// Where the tool keeps its working data. Every folder can be moved with an environment variable (a Kubernetes volume,
// a laptop). Without one: the old sibling folder if it exists (the layout this tool grew up in, so an existing machine
// keeps working), otherwise a folder under APP_DATA_DIR (default ./data, git-ignored) so the app stands on its own.

const APP = process.cwd();
const PARENT = path.resolve(APP, "..");

function fromEnv(name: string): string | null {
  const v = process.env[name]?.trim();
  return v ? path.resolve(v) : null;
}

// On Vercel the deployment is read-only: /tmp is the only place a function may write (and it is lost with the instance).
const DATA = fromEnv("APP_DATA_DIR") ?? (process.env.VERCEL ? path.join(os.tmpdir(), "asset-detector") : path.join(APP, "data"));

function dataDir(envName: string, legacySibling: string, name: string): string {
  return fromEnv(envName) ?? (existsSync(legacySibling) ? legacySibling : path.join(DATA, name));
}

/** Template repos and, next to each, its clone / uploads / layout folders. */
export const TEMPLATE_ROOT = dataDir("TEMPLATE_ROOT", path.join(PARENT, "game-template-repo"), "templates");
/** Frozen template archives (legacy snapshots). */
export const STORE_DIR = dataDir("TEMPLATE_STORE_DIR", path.join(PARENT, "template-store"), "template-store");
/** Snapshots extracted on demand (a regenerable cache). */
export const MATERIALIZED_DIR = dataDir("TEMPLATE_CACHE_DIR", path.join(PARENT, "template-materialized"), "cache");
/** Verified detect schema of each game: data, read and written at runtime. */
export const SCHEMA_DIR = dataDir("CLONE_SCHEMAS_DIR", path.join(PARENT, "clone-schemas"), "clone-schemas");
/** One small manifest per game (git url + pinned commit): how a template is fetched when it is not on disk. Committed. */
export const REGISTRY_DIR = fromEnv("TEMPLATE_REGISTRY_DIR") ?? path.join(APP, "template-registry");
