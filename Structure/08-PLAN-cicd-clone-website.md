# Kế hoạch CI/CD tự động cho website clone

Trạng thái: **bản nháp, chờ xác nhận mục 8** trước khi làm. Dựa trên cấu hình CI/CD đọc được trong `game-template-repo/*` (Jenkinsfile, Dockerfile, `deploy/*/deploy.yaml`) và code `asset-detector-web`. Mọi điểm chưa chắc được đánh dấu **[CẦN XÁC NHẬN]**, không tự quyết.

## 1. Flow đã chốt (theo user)

1. User yêu cầu một game → nhận lại **domain** được cấp.
2. User điền domain vào ô nhập trong wizard "website clone".
3. Thay asset → xem preview.
4. **Deploy lên môi trường dev** với đúng domain đó.
5. **Production chỉ được duyệt bởi một bên khác** (không phải user tạo clone, không phải tool).

Hệ quả thiết kế: tool chỉ đẩy tới **dev**; bước lên production nằm ngoài quyền của tool và user, chỉ người duyệt mới kích hoạt được.

## 2. Hiện trạng cấu hình CI/CD (đã kiểm chứng)

| Hạng mục | Thực tế |
|---|---|
| `Jenkinsfile` | 1–2 dòng gọi thư viện dùng chung `@Library('jenkins-libs')`: `VTVliveVplayNodeJS` (Next), `VTVliveVplayNodeJSautodev` (Vite/Next), `VTVLiveVplayNetcoreautodev` (.NET). Tham số: `domain`, `container_port`, `service_path`, `namespace`, `service_name`. **Mã nguồn thư viện không nằm trong repo nào.** |
| `Dockerfile` | `ARG DEPLOY`; `COPY deploy/${DEPLOY}/.env.example ./.env`; `npm run build`. Next: cổng 3000 (`npm run start`); Vite: 4173 (`preview`); .NET: 8080. |
| `deploy/{develop,production}/deploy.yaml` | ConfigMap (`.env`) + Deployment + Service + Ingress, dùng biến `${SERVICE_NAME} ${NAMESPACE} ${IMAGE} ${CONTAINER_PORT} ${DOMAIN} ${SERVICE_PATH}`. Khác nhau giữa develop và production: URL API và `replicas` (1 vs 3) (kiểm ở `than-ma-ao-hoa`). |
| `deploy/*/.env.example` | Biến `NEXT_PUBLIC_*`, được build vào bundle lúc `npm run build`. |
| Domain | Jenkinsfile ghi domain **production** (`thanmaaohoa.vplay.vn`); `NEXT_PUBLIC_DOMAIN` ở develop ghi dạng `dev-thanmaloanvu.vplay.vn`. Cách thư viện suy ra domain dev **chưa biết**. |
| Nhánh / trigger | Không thấy trong repo (nằm trong thư viện hoặc cấu hình job Jenkins). |
| Git | README trỏ tới `source.vtvlive.vn/vtvlive-game-website/<mã>/home-page.git` (GitLab nội bộ). |

## 3. Khoảng trống cần xử lý

| # | Vấn đề | Bằng chứng | Mức |
|---|---|---|---|
| G1 | Clone **mất thư mục `deploy/`** nhưng Dockerfile vẫn `COPY deploy/${DEPLOY}/.env.example` → `docker build` lỗi | `SKIP_TOP_LEVEL` trong `api/clone/route.ts` có `deploy`; `home-page-clone/` không có `deploy/` | Chặn |
| G2 | Clone **giữ nguyên Jenkinsfile của game gốc** (cùng `domain`, `service_name`) → deploy sẽ **đè website game gốc** | `*/home-page-clone/Jenkinsfile` trùng hệt bản gốc | Nghiêm trọng |
| G3 | 6 bản `-web` (Nhóm C) chưa có `Dockerfile`/`Jenkinsfile`/`deploy.yaml`; bản .NET dùng lib .NET, cổng 8080 | `*-web/` chỉ có `deploy/develop/.env.example` | Chặn với 6 game này |
| G4 | **Bí mật nằm trong `deploy.yaml`** được commit (vd `CLIENT_SECRET`, cả develop lẫn production) | `than-ma-ao-hoa/.../deploy/*/deploy.yaml` | Bảo mật |
| G5 | Không đồng nhất: Node 20 / 20.2 / 22.6 / 22.15, npm vs yarn, `phuong-hoang-tru-tien` chạy `npm run dev` trong image, `nginx.conf` không dùng | các Dockerfile | Trung bình |
| G6 | Clone ghi `.env` và `.env.local`; Dockerfile ghi đè `.env` bằng bản deploy, còn `.env.local` (Next ưu tiên cao hơn) vẫn theo clone → có thể lệch môi trường | `api/clone/route.ts` (`envWritten`) | Cần kiểm |
| G7 | Wizard **chưa có** ô nhập domain, nút Deploy, theo dõi trạng thái build | `WizardShell.tsx` | Tính năng mới |
| G8 | Không có kiểm tra chống trùng domain/`service_name` với game khác | — | Nghiêm trọng (cùng G2) |

## 4. Kiến trúc đích

```
Wizard (asset-detector-web)
  ├─ Bước 1  Nhập domain được cấp  ──► kiểm tra: đúng định dạng, không trùng game gốc / clone khác
  ├─ Bước 2  Thay asset (đã có)
  ├─ Bước 3  Cấu hình (đã có)
  ├─ Bước 4  Preview (đã có)
  └─ Bước 5  Deploy dev  ──► POST /api/deploy
                               1. Sinh repo clone đầy đủ: code + Dockerfile + Jenkinsfile + deploy/ (render từ template chuẩn,
                                  thay domain/service_name/namespace theo domain nhập)
                               2. Đẩy lên git (nhánh develop)
                               3. Jenkins build → image → K8s (develop, replicas 1, Ingress host = domain)
                               4. Wizard theo dõi trạng thái, hiện link khi xong

Production:  ngoài wizard. Nhánh/tag production + cổng duyệt thủ công do bên duyệt nắm; tool và user tạo clone không có quyền.
```

Nguyên tắc:
- **Một nguồn sự thật cho file deploy**: template chuẩn theo stack (Next, Vite), tool chỉ render biến; không copy Jenkinsfile của game gốc.
- **Tool chỉ có quyền dev.** Thông tin đăng nhập production không bao giờ nằm trong tool.
- **Bí mật đưa ra khỏi repo** (Jenkins credentials hoặc K8s Secret); `deploy.yaml` chỉ tham chiếu.
- **Bất biến**: domain production hiện có (của các game gốc) nằm trong danh sách chặn; clone không được dùng.

## 5. Kế hoạch theo giai đoạn

### P0 — Chuẩn hóa template (không đụng hạ tầng)
- Tạo template chuẩn cho `nextjs` và `vite-spa`: `Dockerfile` (một phiên bản Node, một trình quản lý gói, `start` thật sự, `.dockerignore`), `Jenkinsfile`, `deploy/develop|production/{deploy.yaml,.env.example}` với biến `${DOMAIN} ${SERVICE_NAME} ${NAMESPACE}` thay cho giá trị cứng.
- Thống nhất tên biến và quy ước đặt `service_name` từ domain.
- Xong khi: một game mẫu build được image từ template chuẩn (docker build cục bộ) và chạy đúng.

### P1 — Dựng file deploy cho 6 bản `-web`
- Áp template P0 cho `giang-ho-ky-ngo`, `quy-mon-quan`, `samkok-tamquoc`, `ta-la-hac-ngokhong`, `thao-tung-tamquoc`, `thoi-khong-chi-mong` (và `huyen-anh-volam` đã có `-web`).
- Lấy env develop/production từ `appsettings.json` và `deploy.yaml` của bản .NET tương ứng (riêng `ta-la-hac-ngokhong`: develop 1044, production 43).
- `thao-tung-tamquoc`: đảm bảo `.env` production không trỏ `/api/mock`.
- Xong khi: 7 bản `-web` build image thành công bằng `docker build --build-arg DEPLOY=develop`.

### P2 — Sửa bộ sinh clone trong `asset-detector-web`
- Giữ `deploy/`, `Dockerfile`, `.dockerignore` khi tạo clone; **sinh lại** `Jenkinsfile` và `deploy.yaml` từ template với domain/service_name của clone (sửa G1, G2).
- Đồng bộ `.env`/`.env.local` với `deploy/develop/.env.example` (G6).
- Kiểm tra bắt buộc trước khi sinh: domain hợp lệ, không thuộc danh sách domain production/clone khác, `service_name` chưa tồn tại (G8).
- Xong khi: clone của mỗi game build được bằng `docker build` mà không đụng file/tên của game gốc.

### P3 — Tính năng wizard: nhập domain và Deploy dev
- Ô nhập domain (bước đầu hoặc bước cấu hình), lưu theo clone.
- Nút "Deploy dev" → `POST /api/deploy`: sinh repo, đẩy git, kích hoạt Jenkins; wizard poll trạng thái (đang build / lỗi + log rút gọn / xong + link).
- Chặn deploy nếu chưa có domain hoặc bước kiểm tra thất bại. Nhãn rõ: "Chỉ đưa lên dev".
- Xong khi: từ wizard, một clone lên được domain dev và truy cập được.

### P4 — Production có duyệt bởi bên khác
- Quy trình và cổng duyệt (xem [CẦN XÁC NHẬN] 8.4); tool chỉ tạo "yêu cầu lên production" (vd Merge Request) và hiển thị trạng thái, không tự duyệt, không giữ quyền production.
- Ghi vết: ai yêu cầu, ai duyệt, phiên bản nào.

### P5 — Bảo mật, quan sát, tài liệu
- Gỡ bí mật khỏi `deploy.yaml` đã commit (quay vòng khóa nếu đã lộ — cần bên sở hữu khóa).
- Dọn clone/preview cũ theo chính sách, thông báo khi build lỗi, cập nhật playbook/README.

## 6. Kiểm thử

- **Cục bộ:** `docker build` + `docker run` cho mỗi template và mỗi game; kiểm HTTP 200 và biến môi trường đúng.
- **Chống đè game gốc:** test tự động — sinh clone với domain trùng game gốc phải bị từ chối; `Jenkinsfile`/`deploy.yaml` sinh ra không chứa `domain`/`service_name` của game khác.
- **Dev thật:** deploy một clone thử lên một domain dev được cấp riêng, kiểm Ingress và log.
- **Quyền:** xác nhận tài khoản của tool **không** deploy được lên production.
- **Hồi quy:** Generate Clone cho cả 12 game vẫn trả 200 sau thay đổi.

## 7. Rủi ro chính

| Rủi ro | Giảm thiểu |
|---|---|
| Deploy nhầm đè game gốc | Danh sách chặn + sinh lại Jenkinsfile + test tự động (P2) |
| Không biết hành vi thư viện `jenkins-libs` | Xác nhận 8.2 trước P3; nếu không có quyền xem thì chỉ dùng các tham số đã thấy, thử trên domain dev thử |
| Bí mật lộ trong repo | P5; không nhân bản `deploy.yaml` có secret sang clone |
| Biến `NEXT_PUBLIC_*` bake lúc build nên sai môi trường | Mỗi môi trường build riêng từ `deploy/<env>/.env.example` |

## 8. Cần bạn xác nhận trước khi làm (chưa tự giả định)

1. **Hạ tầng Git:** mỗi clone là một repo mới trong GitLab `source.vtvlive.vn`, hay một nhánh trong repo game gốc, hay tool đẩy thẳng vào một repo "clone" chung? Ai cấp token cho tool?
2. **Thư viện Jenkins `jenkins-libs`:** tôi chưa xem được mã nguồn. Cần biết: (a) `VTVliveVplayNodeJS` và `...autodev` khác nhau thế nào (nhánh kích hoạt, môi trường); (b) domain dev được suy từ tham số `domain` ra sao (tiền tố `dev-`?); (c) registry image và cluster/namespace dev.
3. **Domain:** dạng domain được cấp cho clone (vd `<tên>.vplay.vn` production hay đã là domain dev)? Domain dev tương ứng do ai tạo (DNS, Ingress, chứng chỉ)? Có trường hợp một game có nhiều clone song song không?
4. **Production:** "bên khác duyệt" cụ thể là ai/nhóm nào và duyệt trên công cụ nào (Jenkins input, GitLab Merge Request, hệ thống khác)? Tool có được phép tạo "yêu cầu lên production" hay hoàn toàn không đụng tới?
5. **Bí mật:** `CLIENT_SECRET` và các khóa trong `deploy.yaml` hiện đang commit có phải khóa thật đang dùng không? Ai quyết định quay vòng?
6. **Chuẩn Node/package manager:** thống nhất Node 22 + npm cho Next/Vite, hay giữ theo từng game?
7. **Phạm vi làm trước:** làm P0–P2 (chuẩn hóa + sửa lỗi clone, không cần hạ tầng) ngay, còn P3–P5 chờ trả lời các mục trên — bạn đồng ý thứ tự này không?
8. **Bản .NET gốc:** sau khi có `-web`, pipeline .NET cũ (`VTVLiveVplayNetcoreautodev`) có tiếp tục chạy cho production hiện tại cho tới khi chuyển hẳn không? Thời điểm chuyển domain production sang bản Next do ai quyết định?

9. **Chân lý cấu hình:** đối chiếu `.env.example` × `deploy.yaml` cho thấy 8 điểm lệch/nghi vấn (N1–N8) cần bạn xác nhận, xem [`08a-APPENDIX-config-truth.md`](08a-APPENDIX-config-truth.md). P1 chỉ dựng `develop` cho bản `-web` đến khi N3–N6 được xác nhận.

10. **Tham số của 2 API (config hub, ranking):** đã rà 12 game, xem [`08b-APPENDIX-two-api-params.md`](08b-APPENDIX-two-api-params.md) (API ranking có 4 biến thể; wizard bước 3 dùng khóa `VITE_*` không khớp game Next.js; nghi vấn N-B1…N-B9).

> **Cập nhật 2026-09-30:** game `thao-tung-tamquoc` (R005) đã bị **loại khỏi tool** (game lỗi thời) — các dòng/mục nhắc tới game này trong tài liệu chỉ còn giá trị lịch sử. Thư mục trên ổ đĩa vẫn còn, chưa xóa.

11. **Quyết định 2026-09-30:** bỏ production khỏi phạm vi; GameId nhập trên form; ranking chỉ dùng game-services-api; mode/scope theo bản được clone — xem mục 6 của [`08b-APPENDIX-two-api-params.md`](08b-APPENDIX-two-api-params.md).

12. **Stack:** mọi clone chỉ dùng Next.js hoặc React (Vite); bản MVC dùng bản `-web` Next.js đã port và template Next.js của CI/CD; .NET ra khỏi pipeline — xem mục 7 của [`08b-APPENDIX-two-api-params.md`](08b-APPENDIX-two-api-params.md).

13. **Git (trả lời mục 8.1, 2026-09-30):** user sẽ cấp **token cho một GitLab group**; **mỗi bản clone là 1 project trong group đó**. Hệ quả: P3 tạo project mới trong group cho mỗi clone (đẩy code lên nhánh develop), không dùng repo game gốc. Còn cần xác nhận: URL group, phạm vi token (đề xuất `api` + `write_repository`), quy tắc đặt tên project, tên nhánh kích hoạt Jenkins, chế độ hiển thị (private), có cho phép tool xóa project không. Token chỉ được lưu ở biến môi trường của server chạy tool (vd `GITLAB_TOKEN`), **không** ghi vào repo, tài liệu hay chat.

14. **Trả lời 2026-09-30 (mục 13):** URL group và phạm vi token — trao đổi sau; nhánh kích hoạt Jenkins — đang xem xét (chưa chốt, mặc định tạm `develop`); **quyền của tool chỉ gồm tạo project và đẩy code, không được vượt quyền** (không xóa, không đổi cài đặt project/group, không force-push, không gọi API khác ngoài tạo project và push). **Tên dự án** nhập trên wizard theo định dạng `[mã game]-[tên game]` (vd `t050-ten-game`), dùng làm tên project GitLab; đã có ô nhập và kiểm tra định dạng ở bước 3 của wizard (`^[a-z][0-9]{3}-[a-z0-9]+(-[a-z0-9]+)*$`, bắt buộc để sang bước 4).

15. **Test trên GitHub (2026-09-30):** user sẽ thử luồng tạo repo trên GitHub (organization riêng), mỗi clone một repo tên `projectName`; quyền tối thiểu = tạo repo + đẩy code, token chỉ qua biến môi trường `GITHUB_TOKEN`. Cần xác nhận: tên organization, loại token, cách kích hoạt CI (GitHub Actions hay webhook sang Jenkins).

16. **Tạo repo GitHub từ wizard (2026-09-30, chưa CI/CD):** bước 4 của wizard có nút "Tạo repo trên GitHub" → `POST /api/repo` (`src/app/api/repo/route.ts`, logic ở `src/detector/github-publish.ts`). Tạo repo **private** tên `projectName` trong organization `tool-hompage-auto` (đúng chính tả user cung cấp) rồi đẩy bản clone vừa sinh (`home-page-clone`). Chỉ dùng hai thao tác: tạo repo (`POST /orgs/{org}/repos`) và `git push` thường (fast-forward, **không force-push**; đẩy lại = thêm commit). Token lấy từ `GITHUB_TOKEN` (env của máy chạy tool; mẫu ở `.env.local.example`), truyền cho git qua biến môi trường nên không nằm trong URL/argv/`.git/config`. Không đẩy: `node_modules`, `.next`, `dist`, `.git`, `.idea`, log, mọi file `.env*` trừ `.env.example`. **Quét bí mật trước khi tạo repo**: thấy giá trị trông như secret trong file sắp đẩy thì dừng, chưa tạo gì. Giới hạn: file >95 MB hoặc tổng >300 MB thì dừng.
   Còn mở: clone **chưa có `deploy/`** (G1) nên repo chưa đủ để CI/CD sau này; `Jenkinsfile` của clone vẫn mang domain/service_name của game gốc (G2) — phải sinh lại trước khi bật CI. Dung lượng bản clone lớn: `huyen-anh-volam` ~267 MB, `than-ma-ao-hoa` ~188 MB, `giang-ho-ky-ngo` ~130 MB, `tamquoc-quan-anh` ~80 MB (ảnh/video trong `public/`).
