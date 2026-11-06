/** Turns common "share" links into direct-download links. */
export function toDirectUrl(raw: string): URL {
  let u: URL;
  try {
    u = new URL(raw.trim());
  } catch {
    throw new Error("Link không hợp lệ");
  }
  if (u.protocol !== "http:" && u.protocol !== "https:") throw new Error("Chỉ hỗ trợ link http/https");

  if (u.hostname === "drive.google.com") {
    const id = u.pathname.match(/\/file\/d\/([^/]+)/)?.[1] ?? u.searchParams.get("id");
    if (id) return new URL(`https://drive.google.com/uc?export=download&id=${id}`);
  }
  if (/(^|\.)dropbox\.com$/.test(u.hostname)) {
    u.searchParams.delete("dl");
    u.searchParams.set("dl", "1");
  }
  return u;
}
