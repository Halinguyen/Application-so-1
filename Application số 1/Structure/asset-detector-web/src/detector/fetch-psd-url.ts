import dns from "node:dns/promises";
import net from "node:net";
import { MAX_PSD_BYTES } from "./psd-parse";

// Downloads a PSD from an operator-pasted link. The server does the request, so
// we refuse anything that resolves to a private/loopback address (SSRF) and
// re-check every redirect hop.

const MAX_BYTES = MAX_PSD_BYTES;
const TIMEOUT_MS = 10 * 60_000;
const MAX_REDIRECTS = 5;

export class PsdUrlError extends Error {}

/** Turns common "share" links into direct-download links. */
export function toDirectUrl(raw: string): URL {
  let u: URL;
  try {
    u = new URL(raw.trim());
  } catch {
    throw new PsdUrlError("Link không hợp lệ");
  }
  if (u.protocol !== "http:" && u.protocol !== "https:") throw new PsdUrlError("Chỉ hỗ trợ link http/https");

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

function isPrivateIp(ip: string): boolean {
  if (net.isIPv6(ip)) {
    const l = ip.toLowerCase();
    if (l.startsWith("::ffff:")) return isPrivateIp(l.slice(7));
    return l === "::1" || l === "::" || l.startsWith("fc") || l.startsWith("fd") || l.startsWith("fe8") || l.startsWith("fe9") || l.startsWith("fea") || l.startsWith("feb");
  }
  const [a, b] = ip.split(".").map(Number);
  return (
    a === 0 || a === 10 || a === 127 ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 100 && b >= 64 && b <= 127)
  );
}

async function assertPublicHost(host: string) {
  const bare = host.replace(/^\[|\]$/g, "");
  const addrs = net.isIP(bare) ? [{ address: bare }] : await dns.lookup(bare, { all: true }).catch(() => []);
  if (addrs.length === 0) throw new PsdUrlError(`Không phân giải được tên miền ${host}`);
  if (addrs.some((a) => isPrivateIp(a.address))) throw new PsdUrlError("Không cho phép link tới địa chỉ nội bộ");
}

export async function fetchPsdFromUrl(raw: string): Promise<{ buf: Buffer; fileName: string }> {
  let url = toDirectUrl(raw);
  const signal = AbortSignal.timeout(TIMEOUT_MS);

  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    await assertPublicHost(url.hostname);
    const res = await fetch(url, { redirect: "manual", signal }).catch((e) => {
      throw new PsdUrlError(`Không tải được link: ${e instanceof Error ? e.message : String(e)}`);
    });
    if (res.status >= 300 && res.status < 400 && res.headers.get("location")) {
      url = toDirectUrl(new URL(res.headers.get("location")!, url).toString());
      continue;
    }
    if (!res.ok) throw new PsdUrlError(`Link trả về lỗi ${res.status} — kiểm tra file đã chia sẻ "bất kỳ ai có link" chưa`);
    if ((res.headers.get("content-type") ?? "").includes("text/html")) {
      throw new PsdUrlError("Link trả về trang web chứ không phải file PSD (có thể cần đăng nhập hoặc chưa chia sẻ công khai)");
    }
    const declared = Number(res.headers.get("content-length") ?? 0);
    if (declared > MAX_BYTES) throw new PsdUrlError(`File quá lớn (tối đa ${MAX_BYTES / 1048576}MB)`);

    const chunks: Buffer[] = [];
    let total = 0;
    for await (const chunk of res.body as unknown as AsyncIterable<Uint8Array>) {
      total += chunk.byteLength;
      if (total > MAX_BYTES) throw new PsdUrlError(`File quá lớn (tối đa ${MAX_BYTES / 1048576}MB)`);
      chunks.push(Buffer.from(chunk));
    }
    const buf = Buffer.concat(chunks);
    if (buf.subarray(0, 4).toString("latin1") !== "8BPS") throw new PsdUrlError("File tải về không phải PSD (thiếu chữ ký 8BPS)");
    const fromPath = decodeURIComponent(url.pathname.split("/").pop() ?? "");
    return { buf, fileName: /\.psd$/i.test(fromPath) ? fromPath : "design.psd" };
  }
  throw new PsdUrlError("Link chuyển hướng quá nhiều lần");
}
