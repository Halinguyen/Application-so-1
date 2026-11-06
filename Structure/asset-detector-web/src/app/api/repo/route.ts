import { NextRequest, NextResponse } from "next/server";
import path from "node:path";
import { resolveGame } from "@/detector/config";
import {
  PROJECT_NAME_RE,
  checkLimits,
  cloneDirExists,
  createOrgRepo,
  listPublishable,
  pushClone,
  scanSecrets,
} from "@/detector/github-publish";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// POST /api/repo  (form: gameId, projectName)
// Creates a NEW private repo named `projectName` in the GitHub organization and
// pushes the already generated clone (home-page-clone) into it. Only two
// GitHub operations are ever used: create repo, and a normal git push.
// Config comes from the server environment: GITHUB_TOKEN (required),
// GITHUB_ORG (default below), GITHUB_BRANCH (default "main").
const DEFAULT_ORG = "tool-hompage-auto";

export async function POST(request: NextRequest) {
  try {
    const form = await request.formData();
    const gameId = typeof form.get("gameId") === "string" ? (form.get("gameId") as string) : undefined;
    const projectName = typeof form.get("projectName") === "string" ? (form.get("projectName") as string).trim() : "";

    if (!PROJECT_NAME_RE.test(projectName)) {
      return NextResponse.json(
        { error: "Tên dự án phải có định dạng [mã game]-[tên game], ví dụ t050-ten-game." },
        { status: 400 }
      );
    }

    const token = process.env.GITHUB_TOKEN ?? "";
    if (!token) {
      return NextResponse.json(
        { error: "Chưa cấu hình GITHUB_TOKEN trên máy chạy tool (đặt trong biến môi trường hoặc .env.local rồi chạy lại)." },
        { status: 400 }
      );
    }
    const org = process.env.GITHUB_ORG || DEFAULT_ORG;
    const branch = process.env.GITHUB_BRANCH || "main";

    const { repoPath } = resolveGame(gameId);
    const cloneDir = path.join(path.dirname(repoPath), "home-page-clone");
    if (!cloneDirExists(cloneDir)) {
      return NextResponse.json({ error: "Chưa có bản clone. Hãy bấm Generate Clone trước." }, { status: 400 });
    }

    const publishable = await listPublishable(cloneDir);
    const limitError = checkLimits(publishable);
    if (limitError) return NextResponse.json({ error: limitError }, { status: 400 });

    // Block BEFORE creating anything if a secret-looking value would be pushed.
    const secrets = await scanSecrets(cloneDir, publishable.files);
    if (secrets.length > 0) {
      return NextResponse.json(
        {
          error:
            "Dừng lại: phát hiện giá trị trông như bí mật (khóa/secret/token) trong các file sắp đẩy lên repo. Chưa tạo repo nào.",
          secretFiles: secrets,
        },
        { status: 422 }
      );
    }

    const repo = await createOrgRepo(org, projectName, token);
    const pushed = await pushClone({
      sourceDir: cloneDir,
      files: publishable.files,
      remoteUrl: repo.cloneUrl,
      token,
      branch,
      message: `Website clone ${projectName} (from ${gameId ?? "template"})`,
    });

    return NextResponse.json({
      org,
      repo: projectName,
      repoUrl: repo.htmlUrl,
      created: repo.created,
      branch: pushed.branch,
      commit: pushed.commit,
      updatedExisting: pushed.updatedExisting,
      fileCount: pushed.fileCount,
      totalBytes: publishable.totalBytes,
      skipped: publishable.skipped,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
