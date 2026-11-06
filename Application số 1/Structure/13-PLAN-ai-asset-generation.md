# Kế hoạch: Agent tạo asset mới (một phần) cho tool clone

Trạng thái: **chờ user xác nhận các điểm ở mục 4** (ghi 2026-10-29). Chưa viết code.

## 1. Yêu cầu đã chốt
- Không cần 100% asset do agent tạo. Mỗi game sẽ có asset tạo được và asset không tạo được.
- Asset không tạo được, hoặc tỉ lệ thành công dự kiến < 70%: **không sinh**, đánh dấu "cần upload".
- **Mọi** asset do agent tạo đều cần user vận hành duyệt. Không đúng ý thì upload thay thế.
- Đã bỏ hẳn đọc asset từ PSD/Figma (đã xoá code và tài liệu ngày 2026-10-29).
- Bản quyền: ảnh game là của công ty, dự án hợp pháp, được dùng làm tham chiếu.

## 2. Hiện trạng liên quan (đã đối chiếu code thật)
- Wizard đã có theo từng slot: upload file, dán link, làm trống ảnh, không dùng. Phần "upload thay thế" có sẵn.
- Game mẫu `phuong-hoang-tru-tien`: 62 asset, hầu hết `per-breakpoint` (3 file mỗi asset).
- `resize-upload.ts` dùng `sharp.resize(w, h, { fit: "cover" })`: ảnh lệch tỉ lệ sẽ bị cắt, khung/nút mất góc.
- Ảnh gốc thật: `btn-nap.png` (325x160) có chữ "NẠP TIỀN / RECHARGE" và nhân vật chibi in sẵn; `frame-tab-content.png` (1161x976) là khung đỏ phẳng nền trắng, không có hoa văn vàng.
- File `deepseek_markdown_20261029_b3bd7b.md` (5 loại asset game UI, pipeline Make.com + Drive) **không khớp** dự án: HP/Mana bar, item icon, character frame không có slot nào; prompt mẫu tạo ảnh khác ảnh gốc. Chỉ dùng làm tham khảo ý tưởng, không triển khai theo văn bản.

## 3. Thiết kế đề xuất
1. **Phân loại slot** (luật + Claude vision xem ảnh gốc): tạo được / không nên tạo (có chữ in sẵn, nhân vật, KV, logo, title) / độ tin cậy < 70% → "cần upload". Model sinh ảnh không tự chấm.
2. **Ngưỡng 70% là chính sách**, định nghĩa từ tín hiệu cụ thể (có chữ, có nhân vật, độ phức tạp, kích thước). Hiệu chỉnh bằng cách chạy thử trên 62 slot game mẫu và so với tỉ lệ operator duyệt thực tế.
3. **Kiểm tra tự động bằng code** (không nhờ LLM): đúng kích thước từng breakpoint, có alpha nếu ảnh gốc có, màu chủ đạo gần tham chiếu. Không qua thì không hiện như "đã tạo".
4. **Trạng thái duyệt từng slot:** chưa tạo → đã tạo, chờ duyệt → đã duyệt / từ chối → upload thay. `generateClone` chỉ ghi ảnh **đã duyệt**.
5. **Lưu ảnh đã sinh trên server** theo game + slot (không dùng localStorage), để tải lại trang không mất.
6. Không dùng pipeline Make.com / Google Drive: tích hợp thẳng vào bước "Nội dung & hình ảnh" của wizard như một nguồn ảnh bổ sung.
7. Chạy thử 5–10 slot không chữ (nền, icon, texture khung) trước, đo tỉ lệ duyệt rồi mới mở rộng.

Nhóm slot hợp để AI sinh: nền không chữ (vd `bg-rank.png`), icon trang trí nhỏ, texture khung (chưa kiểm tra CSS dùng khung kiểu ảnh cố định hay `border-image`).
Nhóm cần ảnh thiết kế thật: KV banner, `text-game`, `logo-game`, `title-rank`, nút có chữ.

## 4. Cần user xác nhận
1. **Nguồn "phong cách game mới" cho mỗi game:** gì làm tham chiếu (poster/key art operator upload? link?). Giờ không còn PSD/Figma.
2. **Nhà cung cấp sinh ảnh + API key.**
3. **Cách chạy:** sinh ngay trong wizard (operator chờ) hay chạy nền rồi quay lại duyệt.
4. Thang đo 70%: có chấp nhận định nghĩa theo tín hiệu ở mục 3.2, hiệu chỉnh bằng chạy thử trên game mẫu?
5. Có chấp nhận phạm vi thử ban đầu 5–10 slot không chữ?

## 5. Điều chưa kiểm chứng (đừng coi là sự thật)
- Giá "~0,17 USD / 5 ảnh" và tên model "GPT-Image-2" trong file deepseek: chưa xác nhận.
- Tham số `background: transparent` của Seedream 5.0 (chỉ image-to-image, đầu vào phải có alpha): chưa xác nhận; nếu đúng thì không giúp tạo từ đầu.
- Layer.ai tạo 9-slice: chưa xác nhận.
- Midjourney `--sref` không có API chính thức nên không nối tự động được.
