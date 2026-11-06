# Demo đủ chức năng bằng Docker (một máy chủ)

**Trạng thái:** `Dockerfile` và `docker-compose.yml` **chưa từng được build/chạy trong container** (Docker Desktop trên máy phát triển chưa được bật để thử). Các phần đã kiểm riêng: `next build` thành công, `PREVIEW_PORT_RANGE` (có test), đóng gói template (`scripts/pack-templates.mjs`). Hãy build thử trước khi hẹn demo.

## Cần
- Máy chủ Linux có Docker và Docker Compose, ≥ 4 GB RAM, ≥ 10 GB ổ đĩa (mỗi game cần `npm install` khi tạo bản sao).
- Cho phép truy cập **HTTP** tới cổng **3000** và dải **6000–6050** từ trình duyệt của người xem.
- Truy cập internet (npm registry) để `npm install` trong bản sao.

## Các bước
```bash
# trên máy có game-template-repo
cd Structure/asset-detector-web
node scripts/pack-templates.mjs --out ../demo-seed/templates-seed.tgz   # + templates-seed-schemas.tgz

# trên máy chủ (sau khi chép thư mục asset-detector-web và hai file .tgz lên)
mkdir -p demo-data
tar xzf templates-seed.tgz -C demo-data            # -> demo-data/templates/<game>/<repoDir>
tar xzf templates-seed-schemas.tgz -C demo-data    # -> demo-data/clone-schemas
sudo chown -R 1000:1000 demo-data                  # container chạy bằng uid 1000
docker compose up -d --build
```
Mở `http://<địa-chỉ-máy-chủ>:3000`.

## Lưu ý
- Mỗi lần chỉ một preview chạy; tạo preview cho game khác sẽ dừng preview cũ.
- Đặt token (nếu cần) trong biến môi trường của máy chủ hoặc file `.env` cạnh `docker-compose.yml`; đừng đưa vào git.
- Dữ liệu (bản sao, upload, layout) nằm trong `demo-data/` và còn nguyên sau khi khởi động lại.
