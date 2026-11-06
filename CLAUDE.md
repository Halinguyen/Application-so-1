# Application-so-1

Trước khi làm việc: đọc `Application số 1/Structure/PROJECT-OVERVIEW.md` (tổng quan → chi tiết dự án) thay vì đọc lại toàn bộ code.

Quy tắc tài liệu: mọi commit đổi mã của công cụ (`asset-detector-web/src`, `public/ve`, `scripts`, `deploy`, `template-registry`…) phải cập nhật `PROJECT-OVERVIEW.md` trong cùng commit
(sửa mục liên quan + thêm dòng vào "Nhật ký cập nhật"). Hook `.claude/hooks/check-overview-doc.mjs` chặn `git commit` nếu thiếu; bỏ qua bằng `[skip-docs]` trong message khi thay đổi không ảnh hưởng tài liệu.
