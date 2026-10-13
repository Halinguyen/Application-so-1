import { NextRequest, NextResponse } from "next/server";
import { parsePsd, MAX_PSD_BYTES } from "@/detector/psd-parse";
import { fetchPsdFromUrl, PsdUrlError } from "@/detector/fetch-psd-url";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const MAX_BYTES = MAX_PSD_BYTES;

// POST multipart { file } or { url } → layer list of the PSD (thumbnails/full
// PNGs are served by /api/psd/layer from the temp-dir cache this call fills).
export async function POST(request: NextRequest) {
  const form = await request.formData().catch(() => null);
  const file = form?.get("file");
  const url = form?.get("url");

  let buf: Buffer;
  let fileName: string;
  if (file instanceof File) {
    if (!/\.psd$/i.test(file.name)) {
      return NextResponse.json({ error: "Chỉ hỗ trợ file .psd" }, { status: 400 });
    }
    if (file.size > MAX_BYTES) {
      return NextResponse.json({ error: `File quá lớn (tối đa ${MAX_BYTES / 1048576}MB)` }, { status: 413 });
    }
    buf = Buffer.from(await file.arrayBuffer());
    fileName = file.name;
  } else if (typeof url === "string" && url.trim()) {
    try {
      ({ buf, fileName } = await fetchPsdFromUrl(url));
    } catch (e) {
      if (e instanceof PsdUrlError) return NextResponse.json({ error: e.message }, { status: 422 });
      return NextResponse.json({ error: `Không tải được link: ${e instanceof Error ? e.message : String(e)}` }, { status: 502 });
    }
  } else {
    return NextResponse.json({ error: "Thiếu file PSD hoặc link" }, { status: 400 });
  }

  try {
    const info = await parsePsd(buf);
    if (info.layers.length === 0) {
      return NextResponse.json({ error: "Không tìm thấy layer ảnh nào trong PSD (layer ẩn hoặc không có pixel)" }, { status: 422 });
    }
    return NextResponse.json({ ...info, fileName });
  } catch (e) {
    return NextResponse.json(
      { error: `Không đọc được PSD: ${e instanceof Error ? e.message : String(e)}` },
      { status: 422 }
    );
  }
}
