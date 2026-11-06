// PreToolUse hook (Bash): before `git commit`, require PROJECT-OVERVIEW.md to be staged
// whenever tool source files are staged. Escape hatch: put [skip-docs] in the commit message.
import { execSync } from "node:child_process";
let raw = "";
for await (const c of process.stdin) raw += c;
let input; try { input = JSON.parse(raw); } catch { process.exit(0); }
const cmd = input?.tool_input?.command ?? "";
if (!/\bgit\s+(-C\s+\S+\s+)?commit\b/.test(cmd) || /\[skip-docs\]/.test(cmd)) process.exit(0);
let staged = [];
try {
  const cwd = input.cwd || process.cwd();
  // -c core.quotepath=off keeps Vietnamese paths readable; -a/--all commits are included below
  const flag = /\s-[a-zA-Z]*a|--all/.test(cmd) ? "HEAD" : "--cached";
  staged = execSync(`git -c core.quotepath=off diff ${flag} --name-only`, { cwd, encoding: "utf8" }).split("\n").filter(Boolean);
} catch { process.exit(0); }
const DOC = "PROJECT-OVERVIEW.md";
const relevant = staged.filter((f) =>
  /asset-detector-web\/(src|public\/ve|scripts|deploy|template-registry|Dockerfile|Jenkinsfile|package\.json)/.test(f) ||
  /Structure\/(clone-schemas|template-store)\//.test(f));
if (relevant.length === 0 || staged.some((f) => f.endsWith(DOC))) process.exit(0);
process.stdout.write(JSON.stringify({
  hookSpecificOutput: {
    hookEventName: "PreToolUse",
    permissionDecision: "deny",
    permissionDecisionReason:
      `Commit này đổi ${relevant.length} file của công cụ (vd: ${relevant.slice(0, 3).join(", ")}) nhưng chưa cập nhật ` +
      `Application số 1/Structure/${DOC}. Hãy sửa mục liên quan trong tài liệu (module, bảng game, việc còn mở, ` +
      `thêm 1 dòng vào "Nhật ký cập nhật"), \`git add\` file đó rồi commit lại. ` +
      `Nếu thay đổi không ảnh hưởng tài liệu, thêm [skip-docs] vào message commit.`,
  },
}));
