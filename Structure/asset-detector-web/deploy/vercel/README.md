# Triển khai `asset-detector-web` lên Vercel

Tài liệu này dựa trên hướng dẫn của Vercel (https://vercel.com/get-started.md: cài CLI, thêm hướng dẫn cho agent, nối MCP) và trên cách công cụ này thực sự chạy.

## 0. Đọc trước: Vercel làm được gì, không làm được gì

| Chức năng | Trên Vercel | Ghi chú |
|---|---|---|
| Danh sách game, mở một game, rà soát asset / chữ / màu chữ ở bước 2 | **Chạy** | Mã game tải từ file lưu trữ khi cần (mục 4) |
| Quét asset (`/api/detect`), Figma, thông tin template | **Chạy** | `maxDuration` 60 giây |
| **Tạo bản sao** (`/api/clone`) | **Không chạy** | Cần `npm install`, build, ghi nhiều file. Trả HTTP 501 kèm giải thích |
| **Xem trước và chỉnh layout** (`/api/clone/preview`, editor) | **Không chạy** | Cần server nền trên cổng riêng. Trả HTTP 501 |
| Dữ liệu ghi (upload, layout) | Mất khi instance dừng | Chỉ có `/tmp` (≈512 MB) để ghi |

Muốn **đủ chức năng** (tạo bản sao, xem trước, editor kéo thả, đổi màu trực tiếp) thì chạy bản **Docker** trên một máy chủ chạy liên tục (mục 8). Vercel phù hợp để cho người xem duyệt danh sách game và asset.

## 1. Chuẩn bị máy (một lần)

Theo https://vercel.com/get-started.md:

```bash
npm install --global vercel@latest      # Vercel CLI (đã thử: 65.12.1)
vercel whoami                            # nếu "Logged out": chạy  vercel login
```

Không tạo hay liên kết project ở bước này.

## 2. (Tùy chọn) Hướng dẫn và MCP cho agent

Theo cùng tài liệu, chỉ làm một lần cho mỗi agent:

```bash
npx plugins add vercel/vercel-plugin                       # cần Node.js 18+; hoặc:  npx skills add vercel-labs/agent-skills --global
vercel mcp --clients "Claude Code"                         # nối https://mcp.vercel.com, đăng nhập OAuth trên trình duyệt
```

Sau OAuth, kiểm tra bằng `search_vercel_documentation` và `list_teams`. Giữ bật bước xác nhận của người dùng cho mọi thao tác ghi qua MCP. Phần này không cần cho việc deploy.

## 3. Tạo project trên Vercel

Import repo `Halinguyen/homepage-automatic` (hoặc `Application-so-1`) vào Vercel, rồi vào **Settings → General**:

| Mục | Giá trị |
|---|---|
| **Root Directory** | `Structure/asset-detector-web` |
| **Include source files outside of the Root Directory in the Build Step** | **Bật** (tool đọc `Structure/clone-schemas` và `Structure/template-store` nằm ngoài thư mục gốc) |
| Framework Preset | Next.js |
| Node.js Version | 20.x hoặc 22.x |
| Install / Build Command | mặc định (`npm install`, `npm run build`); đã có `vercel.json` |

Nhánh deploy: `main`. Nếu bạn đổi tên hay chuyển thư mục, phải sửa lại Root Directory, nếu không build báo không thấy thư mục.

## 4. Mã nguồn các game (bắt buộc, nếu không mở game sẽ lỗi)

`game-template-repo` và `template-store/**/template.tgz` bị `.gitignore`, nên **không có trên GitHub và không có trên Vercel**. Mở game sẽ báo "Chưa lấy được mã nguồn template…". Cách xử lý: đóng gói **mỗi game một file** rồi để tool tải khi cần.

**4.1. Đóng gói (trên máy có `game-template-repo`):**

```bash
cd Structure/asset-detector-web
node scripts/pack-templates.mjs --per-game --out-dir ../demo-seed
# tạo ../demo-seed/<gameId>.tgz  (9 – 187 MB mỗi game, 11 game)
```

Mỗi file chứa `templates/<gameId>/<repoDir>/…`, không có `node_modules`, `.git`, build, log. Gói gọn nhẹ vì Vercel chỉ cho ghi khoảng 512 MB vào `/tmp`; gói tất cả 11 game (≈700 MB) thì không vừa.

**4.2. Đưa lên nơi lưu trữ có địa chỉ HTTPS** (Vercel Blob, S3, hay máy chủ file nội bộ). Các file này là **mã nguồn của công ty**: đừng để công khai. Chọn nơi cần token, hoặc dùng địa chỉ không đoán được, và đặt `TEMPLATE_SEED_TOKEN` (tool gửi nó dưới dạng `Authorization: Bearer …`).

Địa chỉ phải có dạng `<TEMPLATE_SEED_BASE_URL>/<gameId>.tgz`, ví dụ `https://kho.example.com/seed/than-ma-ao-hoa.tgz`.

**4.3.** Khi có người mở game lần đầu, tool tải file của game đó về `/tmp`, giải nén, rồi dùng. Lần mở sau trên cùng instance đã có sẵn; instance mới thì tải lại.

## 5. Biến môi trường (Settings → Environment Variables)

| Biến | Bắt buộc | Ý nghĩa |
|---|---|---|
| `TEMPLATE_SEED_BASE_URL` | **Có** | Thư mục HTTPS chứa `<gameId>.tgz` (mục 4) |
| `TEMPLATE_SEED_TOKEN` | Nên có | Token gửi kèm khi tải file |
| `APP_DATA_DIR` | Không | Mặc định trên Vercel là `/tmp/asset-detector` |
| `TEMPLATE_GIT_TOKEN`, `TEMPLATE_GIT_USER` | Không | Chỉ để kéo từ git; Vercel không có `git` nên thường không dùng |
| `FIGMA_TOKEN` | Không | Nếu dùng phần Figma |
| `GITHUB_TOKEN`, `GITHUB_ORG`, `GITHUB_BRANCH` | Không | Chỉ cho nút "Tạo repo trên GitHub", phụ thuộc bản sao nên không dùng được trên Vercel |

Không đặt các token này trong mã hoặc trong repo.

## 6. Deploy

Đẩy lên `main` thì Vercel tự build. Hoặc từ máy:

```bash
cd Structure/asset-detector-web
vercel login         # lần đầu
vercel link          # chọn đúng team và project
vercel --prod
```

(`vercel deploy --temporary` chỉ để thử nhanh không cần tài khoản; không dùng cho dự án đã liên kết.)

## 7. Kiểm tra sau deploy

1. `https://<tên>.vercel.app/api/health` trả `{"ok":true,…}`.
2. Trang chủ liệt kê 11 game.
3. Bấm một game: hiện "Đang quét asset…" rồi wizard bước 2 (Nội dung chữ, Hình ảnh & video). Lần đầu có thể mất vài chục giây vì phải tải file game.
4. Bấm "Tạo bản sao": phải thấy thông báo "…không chạy được trên Vercel…" (HTTP 501), không phải lỗi trống.

**Thông báo lỗi thường gặp khi mở game**

| Thông báo | Nguyên nhân | Cách xử lý |
|---|---|---|
| `TEMPLATE_SEED_BASE_URL không hợp lệ` | Biến thiếu hoặc không phải `https://` | Đặt lại mục 5 |
| `tải …/<gameId>.tgz lỗi 401/403` | Sai hoặc thiếu `TEMPLATE_SEED_TOKEN` | Sửa token |
| `tải … lỗi 404` | Chưa tải file của game đó lên | Chạy lại mục 4.1–4.2 |
| `không chứa templates/<gameId>/<repoDir>` | File đóng gói sai cấu trúc | Đóng gói lại bằng `pack-templates.mjs` |
| `Không tìm thấy snapshot template …/template.tgz` | `TEMPLATE_SEED_BASE_URL` chưa đặt, game ở trạng thái "frozen" | Đặt biến ở mục 5 |
| `ENOSPC` | Hết `/tmp` (game quá nặng) | Chạy bản Docker (mục 8) |

## 8. Muốn đủ chức năng: chạy Docker

Trên một máy chủ chạy liên tục (VM, server, hoặc K8s):

```bash
cd Structure/asset-detector-web
node scripts/pack-templates.mjs                       # một file lớn cho thư mục /data
mkdir -p demo-data && tar xzf ../demo-seed/templates-seed.tgz -C demo-data
docker compose up -d --build                           # mở :3000 và các cổng xem trước 6000-6050
```

Máy chủ phải cho truy cập HTTP trực tiếp tới cổng 3000 và dải 6000–6050 (iframe xem trước dùng HTTP, đặt sau HTTPS sẽ bị trình duyệt chặn). Xem thêm `deploy/demo/README.md`. **`Dockerfile` và `docker-compose.yml` chưa được chạy thử trong container** (chỉ kiểm bước build của Next.js và logic từng phần).
