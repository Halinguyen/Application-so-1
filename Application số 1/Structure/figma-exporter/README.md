# Asset Mapping Export (plugin Figma)

Xuất **một lần** thiết kế Figma thành ZIP để wizard ghép ảnh cho từng slot mà không cần gọi Figma API (gói Starter bị giới hạn rất nhỏ).

```
Figma (plugin này)  →  figma-export.zip  →  wizard "Nhập ZIP export từ Figma"  →  kho cục bộ
     nodes.json + assets/<nodeId>.png          (snapshot node + .figma-cache)
                                                   ↓
                              Mapping Agent: node Figma ↔ slot (kích thước, vai trò, chữ trong node, JSX)
                                                   ↓
                              Mapping Results: asset path + node id + confidence (+ kết quả duyệt)
```

## Cài plugin (một lần)

1. Figma desktop → mở file thiết kế.
2. Menu **Plugins → Development → Import plugin from manifest…** → chọn `figma-exporter/manifest.json`.

## Xuất

1. Chọn các **frame** cần dùng trên canvas (ví dụ *Trang chủ*, *Bảng xếp hạng*). Không chọn frame mobile nếu chưa cần bộ `768`.
2. **Plugins → Development → Asset Mapping Export**.
3. Dán **File key** (đoạn sau `/design/` trong đường link Figma, ví dụ `wDARmroVWOMtuCENhzj8aB`) rồi bấm **Xuất ZIP**.
4. Trình duyệt tải `figma-export.zip`.

## Nhập vào wizard

Bước **Nội dung & hình ảnh** → panel *Gợi ý ảnh từ Figma* → **Nhập ZIP export từ Figma**. Trang tự tải lại và hiện đề xuất.
Nhập lại ZIP mới sẽ thay các frame có trong ZIP và giữ nguyên frame khác.

**Lưu ý:** wizard cần biết *section nào của website ứng với frame nào* (`frameBySection`). Game đã có sẵn trong `asset-detector-web/src/detector/figma-snapshots/<game>.json`
thì giữ nguyên; game mới phải khai báo `frameBySection` (có thể thêm vào `nodes.json` trong ZIP).

## Định dạng ZIP

- `nodes.json`: `{ fileKey, exportedAt, scale, frames, frameBySection?, nodes: [{ id, name, type, parent, frame, w, h, visible, hasImage, solid, text? }] }`
- `assets/<nodeId>.png`: `:` và `;` trong id đổi thành `_` (ví dụ `I74:387;74:370` → `I74_387_74_370.png`).

## Giới hạn

- Plugin chưa được chạy thử trong Figma thật (chỉ kiểm tra cú pháp và bộ ghi ZIP bằng thư viện giải nén). Nếu có lỗi, xem *Plugins → Development → Open console*.
- Không xuất node lớn hơn 4000px mỗi cạnh (nền toàn trang), node ẩn, hay TEXT/VECTOR.
- Mapping chỉ hỗ trợ Figma. Phần PSD của kiến trúc ban đầu **không** được làm: dự án đã bỏ đọc PSD ngày 2026-10-29.
