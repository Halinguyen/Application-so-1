# Homepage Automatic — công cụ tạo web clone từ template game

Công cụ nội bộ cho team vận hành (không cần biết code): chọn một game có sẵn làm template, thay ảnh/video/chữ/cấu hình, **xem trước**, chỉnh bố cục ngay trên trang xem trước, rồi đẩy bản clone lên GitHub để deploy ra domain dev.

- **Detect asset**: đọc repo template (Next.js hoặc Vite), tìm mọi ảnh/video/font, chỗ code dùng chúng, các khối gọi API (hub config, bảng xếp hạng), swiper.
- **Tạo clone**: sao chép template, thay asset (cắt/nén đúng kích thước gốc), vá chữ và biến môi trường, rồi chạy thử bản xem trước.
- **Trình chỉnh layout** (bước 4, toàn màn hình): chọn ảnh trên trang để kéo, phóng to/thu nhỏ, ẩn, đổi thứ tự lớp; thay ảnh bằng file hoặc link; duyệt qua mọi trang của site; chỉnh theo Desktop/Tablet/Mobile. Kết quả lưu thành `layout.json` và biên dịch thành **một file CSS override**, mã nguồn template không bị sửa. Chi tiết: [`docs/visual-editing.md`](docs/visual-editing.md).
- **Mã nguồn template không nằm trong repo này**: mỗi game có một manifest nhỏ trong [`template-registry/`](template-registry/) (địa chỉ git + commit đã ghim); tool tự lấy từ git khi cần.

## Chạy trên máy (phát triển)

Cần Node 22, npm và `git`.

```bash
npm ci
cp .env.example .env.local      # điền token nếu cần (xem bảng biến môi trường bên dưới)
npm run dev                     # http://localhost:3000
```

Dữ liệu làm việc (template tải từ git, bản clone, ảnh đã tải lên, layout, schema) nằm trong thư mục `data/` (đã git-ignore). Muốn đặt chỗ khác thì đặt các biến `TEMPLATE_ROOT`, `CLONE_SCHEMAS_DIR`, …; nếu máy đã có thư mục `../game-template-repo` thì tool vẫn dùng nó như trước.

Lần đầu mở một game, tool tự tải template từ git theo commit trong `template-registry/<game>.json` (cần `TEMPLATE_GIT_TOKEN` nếu repo riêng). Tải trước tất cả: `curl -X POST http://localhost:3000/api/templates/sync`; xem trạng thái: `GET /api/templates`.

## Lệnh thường dùng

| Lệnh | Việc |
|---|---|
| `npm test` | test đơn vị (vitest) |
| `npm run lint` | eslint |
| `npm run registry:generate` | sinh lại manifest trong `template-registry/` từ các repo template đang có trên máy (cần thư mục template có `.git`) |
| `npm run registry:check` | báo lỗi nếu manifest đã cũ (dùng cho CI) |
| `npm run e2e:visual-editing -- <game>` | kiểm thử trình chỉnh layout bằng Playwright qua wizard thật (cần tool đang chạy và Chrome; xem tham số ở đầu `scripts/ve-e2e.mjs`) |

## Cấu trúc

```
src/app/              giao diện wizard (bước 2 nội dung & ảnh, 3 cấu hình, 4 xem trước & chỉnh) và các API route
src/detector/         detect asset, dựng clone, trình chỉnh layout (edit-id, layout-*, ve-*), lấy template từ git
public/ve/            mã chạy trong trang xem trước (inspector, mapper, protocol); được chép vào bản clone
template-registry/    manifest từng game: git url, commit, framework
scripts/              sinh manifest, e2e trình chỉnh layout
deploy/develop/       cấu hình deploy dev (Kubernetes)
docs/                 tài liệu thiết kế
```

## Biến môi trường

Danh sách đầy đủ, có chú thích: [`.env.example`](.env.example). Không bao giờ commit giá trị thật.

## Tài liệu

- [`docs/visual-editing.md`](docs/visual-editing.md): thiết kế, giới hạn thao tác, kết quả kiểm chứng và các việc còn mở của trình chỉnh layout.
- [`docs/mvc-to-nextjs-playbook.md`](docs/mvc-to-nextjs-playbook.md): cách chuyển repo .NET MVC sang Next.js để đi qua cùng luồng clone.
- [`docs/plans/ai-asset-generation.md`](docs/plans/ai-asset-generation.md): kế hoạch tạo asset mới bằng AI (đang chờ quyết định).


## Deploy lên môi trường dev (Kubernetes)

Quy ước giống các repo template của công ty: `Dockerfile` (ARG `DEPLOY`), `Jenkinsfile` (shared library `VTVliveVplayNodeJSautodev`), `deploy/develop/deploy.yaml` + `deploy/develop/.env.example`.

**Pod cần có**: `git`, `npm` (đã cài trong image), mạng ra `source.vtvlive.vn` và npm registry. Chạy với cwd = thư mục app, user non-root (uid 1000).

**Volume (PVC mount `/data`, ReadWriteOnce, replicas 1)**:
- `/data/templates` (TEMPLATE_ROOT): source template lấy từ git
- `/data/template-store`: snapshot template đã freeze
- `/data/cache`: template đã materialize / preview
- `/data/clone-schemas`: schema detect

**Biến môi trường** (mẫu trong `.env.example`; token nằm trong Secret, không nằm trong ConfigMap):

| Biến | Ý nghĩa |
|---|---|
| FIGMA_TOKEN, GITHUB_TOKEN, TEMPLATE_GIT_TOKEN | Secret |
| GITHUB_ORG, GITHUB_BRANCH | Org/branch GitHub |
| TEMPLATE_SOURCE | `live` hoặc `snapshot` |
| TEMPLATE_ROOT / TEMPLATE_STORE_DIR / TEMPLATE_CACHE_DIR / CLONE_SCHEMAS_DIR | Đường dẫn dữ liệu (mặc định `../game-template-repo`, `../template-store`, `../template-materialized`, `../clone-schemas`) |
| TEMPLATE_REGISTRY_DIR | Mặc định `./template-registry` |
| TEMPLATE_GIT_USER | Mặc định `oauth2` |
| ALLOWED_DEV_ORIGINS | Danh sách origin, phân tách bằng dấu phẩy |

**Template đến từ đâu**: từ git, được ghim phiên bản bởi manifest trong `template-registry/`; tải lazy khi cần, hoặc chạy trước bằng `curl -X POST <địa chỉ tool>/api/templates/sync` (xem trạng thái ở `GET /api/templates`).

**Build image local**:
```bash
docker build --build-arg DEPLOY=develop -t asset-detector-web:dev .
docker run --rm -p 3000:3000 -v adw-data:/data asset-detector-web:dev
```
Health check: `GET /api/health`.

**Việc còn mở**
- (a) Preview server lắng nghe cổng ngẫu nhiên trong pod, KHÔNG truy cập được qua một Ingress: cần proxy theo host/port hoặc tách pod preview riêng.
- (b) 6 game đã chuyển sang Next.js (thư mục `*-web`) chưa có git remote.
- (c) Secret: các tiến trình preview con kế thừa môi trường của tool (kể cả token).
