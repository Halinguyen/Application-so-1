// PoC step 1-2: build a clone with visual editing on, start its preview, print what was injected.
// Usage: node scripts/ve-poc-clone.mjs [gameId] [toolOrigin]
const gameId = process.argv[2] ?? "than-ma-ao-hoa";
const tool = process.argv[3] ?? "http://localhost:3100";

const form = new FormData();
form.append("gameId", gameId);
form.append("visualEdit", "1");
let res = await fetch(`${tool}/api/clone`, { method: "POST", body: form });
const clone = await res.json();
if (!res.ok) throw new Error(clone.error);
console.log("visualEditing:", JSON.stringify(clone.visualEditing));
console.log("warnings:", JSON.stringify(clone.warnings));

res = await fetch(`${tool}/api/clone/preview?game=${gameId}`, { method: "POST" });
const preview = await res.json();
console.log("preview:", JSON.stringify(preview));
for (let i = 0; i < 90 && !preview.ready; i++) {
  await new Promise((r) => setTimeout(r, 2000));
  const r = await fetch(preview.url).catch(() => null);
  if (r && r.ok) break;
}
console.log("PREVIEW_URL", preview.url);
