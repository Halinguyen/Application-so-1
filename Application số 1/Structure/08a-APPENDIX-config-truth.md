# Phụ lục — "Chân lý" cấu hình: đối chiếu `.env.example` × `deploy.yaml`

Phục vụ [`08-PLAN-cicd-clone-website.md`](08-PLAN-cicd-clone-website.md). Đọc toàn bộ `deploy/*/.env.example`, `deploy/*/deploy.yaml` (ConfigMap / ExternalSecret / Deployment), `Dockerfile`, `appsettings*.json` của 15 template. Giá trị bí mật không được chép vào đây. Mục 4 là **các điểm nghi vấn cần bạn xác nhận**, chưa được tự sửa.

## 1. Quy tắc xác định "nguồn đúng" cho từng stack

Giá trị thật mà website chạy phụ thuộc **lúc nào** biến được đọc, nên nguồn đúng khác nhau:

| Stack / cách chạy | Biến đọc lúc | Nguồn đúng (đã kiểm chứng) | Nguồn chỉ mang tính tham khảo |
|---|---|---|---|
| **Next.js** (`next start`), `NEXT_PUBLIC_*` | **Build** (Dockerfile copy `deploy/${DEPLOY}/.env.example` → `.env`, rồi `npm run build`) | **`.env.example`** của đúng môi trường build | ConfigMap trong `deploy.yaml` (nhiều game không hề mount nó — `than-ma-ao-hoa`, `luctung-tamquoc`) |
| **Vite, `vite preview`** (`tamquoc-quan-anh`) | Build | **`.env.example`** | ConfigMap mount đè `.env` nhưng bundle đã build xong, không đổi |
| **Vite, `npm run dev`** (`phuong-hoang-tru-tien`, `tuyetdinh-chiengioi`) | **Chạy** (dev server đọc `.env` lúc khởi động) | **ConfigMap `.env` trong `deploy.yaml`** (mount đè lên `.env` của image) | `.env.example` chỉ là giá trị lúc build |
| **.NET develop** | Chạy | `appsettings.json` trong ConfigMap `deploy/develop/deploy.yaml` (mount đè) | `appsettings.json` trong repo (giá trị chạy cục bộ: `SiteUrl: localhost`, `CacheInstance: T027_local`) |
| **.NET production** (có ConfigMap): `huyen-anh-volam`, `ta-la-hac-ngokhong`, `samkok-tamquoc` | Chạy | ConfigMap `deploy/production/deploy.yaml` | — |
| **.NET production** (ExternalSecret): `quy-mon-quan` (`R015/homepage/prod`), `thao-tung-tamquoc` (`R005/prod`), `thoi-khong-chi-mong` | Chạy | **Kho bí mật `secretstore-vplay` — KHÔNG có trong repo** | — |
| **.NET production** `giang-ho-ky-ngo` | Chạy | Không có ConfigMap/Secret: dùng `appsettings.json` đóng trong image (chỉ có `AppHubId: 36`); URL hub/services nằm trong `sdk.js` (có cả bản dev và prod) | — |

**Hệ quả:** không thể dựng cấu hình production cho `quy-mon-quan`, `thao-tung-tamquoc`, `thoi-khong-chi-mong` từ repo; phải lấy từ kho bí mật (người có quyền).

## 2. Nhóm Node (Vite/Next): kết quả đối chiếu

| Game | develop | production | Ghi chú |
|---|---|---|---|
| `than-ma-ao-hoa` | trùng hệt | trùng hệt | ConfigMap **không mount** → thừa, `.env.example` là nguồn duy nhất |
| `luctung-tamquoc` | trùng hệt | trùng hệt | ConfigMap không mount |
| `tamquoc-daiminhtinh` | trùng hệt | trùng hệt | |
| `phong-ma-daosi` | trùng hệt | **lệch `CLIENT_ID` và `CLIENT_SECRET`** | xem nghi vấn N1 |
| `tamquoc-quan-anh` | **lệch `VITE_APP_CDN_IMAGE`** (example rỗng, yaml `https://cdn.vplay.vn`) | trùng hệt | `vite preview` dùng bản build → CDN rỗng ở develop |
| `phuong-hoang-tru-tien` | **yaml thiếu 3 khóa** (`VITE_APP_REDIRECT_URL`, `VITE_APP_API_GAME_SERVICES`, `VITE_APP_CDN_IMAGE`) | như develop | chạy `npm run dev` → ConfigMap mới là thật → xem N2 |
| `tuyetdinh-chiengioi` | **yaml thiếu 4 khóa** (3 khóa trên + `VITE_APP_CLUB`) | như develop | như trên |
| `dau-than-tuyet-the` | không có `.env.example` | không có | không thể đối chiếu |

Cả 3 khóa thiếu ở `phuong-hoang-tru-tien` đều **được code dùng** (mỗi khóa xuất hiện trong 1–2 file `src/`); `VITE_APP_CLUB` cũng được dùng ở `tuyetdinh-chiengioi`.

## 3. .NET → bản `-web`: giá trị đang dùng so với nguồn đúng

`-web` hiện chỉ có `deploy/develop/.env.example` (không có production).

| Game | `.env.example` (`-web`, develop) | Nguồn đối chiếu | Kết luận |
|---|---|---|---|
| `huyen-anh-volam` | HUB dev; `GAME_ID=1039`; `RANKING_API=https://game-services-api.vplay.vn`; `RANKING_GAME_ID=30` | develop `HubGameId=1039` ✔. Ranking: bản C# gốc **gắn cứng** URL production `game-services-api.vplay.vn` và gameId 30 (là `HubGameId` production) | Đúng theo bản gốc, nhưng develop đang gọi ranking production → N3 |
| `giang-ho-ky-ngo` | `HUB=https://vplay.vn/website-api` (**production**); `GAME_ID=36` | develop `AppHubId=36`; URL lấy từ `sdk.js` (có cả dev/prod) | URL production trong file develop → N4 |
| `samkok-tamquoc` | `HUB=https://vplay.vn/website-api` (**production**); `GAME_ID=34` | `AppHubId=34` cả develop lẫn production | như trên → N4 |
| `ta-la-hac-ngokhong` | HUB dev; `GAME_ID=1044` | develop `GameId=1044` ✔; production 43; `appsettings.json` 1052 (chỉ chạy cục bộ) | Đúng. Đã chốt 1044 theo bạn |
| `thao-tung-tamquoc` | HUB dev; `GAME_ID=1042`; ranking `sgpayvtvlive.jfungame.com` | `AppId=1042` (appsettings và develop yaml) ✔ | Đúng. Production chưa biết (ExternalSecret `R005/prod`) |
| `thoi-khong-chi-mong` | HUB dev; `GAME_ID=1036`; `RANKING_GAME_ID=29` | `AppId=1036` ✔; gameId ranking 29 **gắn cứng** trong `HomeController.cs` | Đúng theo bản gốc. Production chưa biết |
| `quy-mon-quan` | HUB dev; `GAME_ID=1036`; `RANKING_GAME_ID=29` | `AppId=1036`, ranking `gameId=29` | **Trùng hệt `thoi-khong-chi-mong`** → N5 |

## 4. Nghi vấn cần bạn xác nhận

Mỗi mục kèm bằng chứng và hướng xử lý đề xuất. **Chưa áp dụng mục nào.**

| # | Nghi vấn | Bằng chứng | Đề xuất (nếu bạn đồng ý) |
|---|---|---|---|
| N1 | `phong-ma-daosi` production: `.env.example` có `CLIENT_ID` **trùng với production của `than-ma-ao-hoa`**, còn `deploy.yaml` có ID khác. Next đóng `NEXT_PUBLIC_*` lúc build từ `.env.example` → bản production có thể đang dùng ID của game khác | `CLIENT_ID=97158af7fd8e46f8` ở cả hai game; yaml của `phong-ma-daosi` ghi ID khác | Coi `deploy.yaml` là đúng, sửa `.env.example`; **cần bạn xác nhận ID nào đúng** |
| N2 | `phuong-hoang-tru-tien`, `tuyetdinh-chiengioi`: ConfigMap mount đè `.env` khi chạy `npm run dev`, nhưng thiếu 3–4 khóa mà code dùng → có thể `undefined` ở runtime | xem mục 2 | Bổ sung khóa thiếu vào ConfigMap (lấy từ `.env.example`); **bạn xác nhận** vì sẽ đổi hành vi bản đang chạy. Đồng thời nên bỏ `npm run dev` trong image (kế hoạch G5) |
| N3 | `huyen-anh-volam`: bản develop của `-web` gọi ranking **production** (`game-services-api.vplay.vn`, gameId 30) | C# gốc gắn cứng như vậy | Giữ nguyên hay đổi sang `dev-game-services-api.vplay.vn` với gameId của develop? **Bạn chọn** |
| N4 | `giang-ho-ky-ngo`, `samkok-tamquoc`: file `.env.example` **develop** đang chứa URL hub production | bản `-web` lấy từ `sdk.js` (prod) | Đổi develop sang `https://dev.vplay.vn/website-api` (và `dev-game-services-api.vplay.vn`); **cần bạn xác nhận** gameId develop của 2 game này (hiện chỉ biết `AppHubId` 36 và 34 dùng chung cho cả hai môi trường) |
| N5 | `quy-mon-quan` giống hệt `thoi-khong-chi-mong`: `AppId 1036`, ranking `gameId=29`, `HubGiftCodeId`; `PublicUrl` develop là `dev-thoikhongchimong.vplay.vn` → nhiều khả năng **bị sao chép từ game khác** | hai `appsettings.json` và `deploy/develop/deploy.yaml` | **Bạn cho biết `AppId` và `gameId` ranking đúng của `quy-mon-quan`** (mã R015). Đến khi đó không deploy game này |
| N6 | Production của `quy-mon-quan`, `thao-tung-tamquoc`, `thoi-khong-chi-mong` nằm trong kho bí mật, `giang-ho-ky-ngo` không có cấu hình production trong repo | mục 1 | Ai cấp giá trị production cho bản `-web`? Nếu production do bên duyệt tự cấu hình thì `-web` chỉ cần develop |
| N7 | ConfigMap "chết" (không mount) ở `than-ma-ao-hoa`, `luctung-tamquoc` — trùng hệt `.env.example` | mục 2 | Xóa ConfigMap thừa trong template chuẩn, hoặc thống nhất mount cho mọi game: **bạn chọn** |
| N8 | `tamquoc-quan-anh` develop: `VITE_APP_CDN_IMAGE` rỗng trong `.env.example` nhưng yaml ghi `https://cdn.vplay.vn` | mục 2 | Dùng giá trị của yaml (vì code cần CDN); **bạn xác nhận** |

## 5. Ảnh hưởng đến kế hoạch CI/CD

1. **Một nguồn sự thật cho template:** mỗi môi trường chỉ giữ **một** file cấu hình (`deploy/<env>/.env.example`), và `deploy.yaml` sinh ConfigMap từ chính file đó, không gõ tay hai nơi (tránh các lệch ở mục 2).
2. **Bản clone** phải nhận đúng `.env.example` của môi trường dev và không được kế thừa giá trị production của game gốc (nhất là `CLIENT_ID`, `CLIENT_SECRET`).
3. **Bí mật** (`CLIENT_SECRET`) chuyển khỏi repo, dùng kho bí mật như cách `ExternalSecret` đang làm với các game .NET.
4. **Bản `-web`:** P1 của kế hoạch chỉ dựng `develop` cho đến khi N3–N6 được xác nhận; `production` do bên duyệt cung cấp.
5. **Quy tắc dựng `-web`:** giá trị develop lấy từ `deploy/develop/deploy.yaml` (ConfigMap) của bản .NET, **không** từ `appsettings.json` trong repo (đó là giá trị chạy cục bộ).

> **Cập nhật 2026-09-30:** game `thao-tung-tamquoc` (R005) đã bị **loại khỏi tool** (game lỗi thời) — các dòng/mục nhắc tới game này trong tài liệu chỉ còn giá trị lịch sử. Thư mục trên ổ đĩa vẫn còn, chưa xóa.
