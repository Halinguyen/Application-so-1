# Phụ lục — Tham số của 2 API dùng chung: "config hub" và "ranking"

Theo yêu cầu: mọi bản clone chỉ có 2 loại API — **lấy config hub** và **lấy bảng xếp hạng**. Phụ lục này liệt kê tham số cần cho 2 API đó ở **12 game trong tool**, và coi mọi tham số khác là ngoài phạm vi. Nguồn: `src/services/*` của từng game + `deploy/*/.env.example` + `deploy.yaml` + `appsettings*.json`. Mục 5 là các điểm **cần bạn xác nhận** (chưa tự sửa gì). Bổ sung cho [`08a-APPENDIX-config-truth.md`](08a-APPENDIX-config-truth.md).

## 1. API 1 — Lấy config hub

`GET {HUB}/api/frontend/config`

| Tham số | Bắt buộc | Ghi chú |
|---|---|---|
| `{HUB}` (base URL) | có | dev `https://dev.vplay.vn/website-api`, production `https://vplay.vn/website-api` |
| query `game_id` | có | ID game trên hub (khác nhau dev/prod) |
| query `language_name` | không | Có ở `phuong-hoang-tru-tien` (`localStorage 'lang'` hoặc `'vi'`), `ta-la-hac-ngokhong` (`'vi'`); các game khác không gửi. Mặc định `vi` |
| header `Accept: application/json` | không | chỉ một số game gửi |

Kết quả dùng: `data.data` (link tải iOS/Android/APK/PC, fanpage, nhóm, logo, hỗ trợ, sự kiện…).

## 2. API 2 — Lấy bảng xếp hạng (4 biến thể, không phải 1)

| Biến thể | Endpoint | Tham số | Game trong tool |
|---|---|---|---|
| **A** (phổ biến) | `GET {SERVICES}/api/Ranking/GetRanking` | `gameId`, `mode` (`user` \| `guild`), `scope` (`all` \| `area` \| `hero` \| `guild`); header `Accept: application/json`, `X-Core-Api-Version: v1` (chỉ thấy ở các bản `-web`) | `phuong-hoang-tru-tien`, `tuyetdinh-chiengioi`, `tamquoc-daiminhtinh`, `tamquoc-quan-anh`, `than-ma-ao-hoa`, `giang-ho-ky-ngo`, `quy-mon-quan`, `samkok-tamquoc`, `ta-la-hac-ngokhong`, `thoi-khong-chi-mong` |
| **A′** | `GET {SERVICES}/api/Ranking/GetRankingT027` | `gameId`, `mode=user`, `scope` (`all`\|`area`\|`guild`) | `huyen-anh-volam` (tên endpoint riêng) |
| **D** | `GET {RANKING}/VTVLiveGetRankList.php` | `server_id_list="*"`, `type="user"`, `top=1000`, `unixTime` (giây hiện tại) — **không có `gameId`** | `thao-tung-tamquoc` |
| (ngoài tool) | hub `power-rank` (`game_id,type,top,serverIds,extend_data`), CMS `GetDataRank` (`key,limit`) | — | `dau-than-tuyet-the`, `phong-ma-daosi` (không nằm trong `GAME_REPO_MAP`) |

Hình dạng phản hồi khác nhau: mảng thẳng hoặc `{ data: [...] }`; tên trường viết hoa/thường (`Name`/`name`, `Server`/`server`, `Power`/`power`).

## 3. Ma trận theo game (chỉ tham số của 2 API)

Dev/prod lấy từ `deploy/<env>/.env.example` (Node) hoặc nguồn .NET tương ứng. "?" = không có nguồn đáng tin trong repo.

| Game (mã) | `game_id` hub dev / prod | Ranking | `gameId` ranking | `mode` × `scope` đang dùng | Base ranking (dev) |
|---|---|---|---|---|---|
| Phượng Hoàng Tru Tiên (T029) | **1044** / 35 | A | = `game_id` hub | user×all, user×area | `https://dev-game-services-api.vplay.vn/api` |
| Tuyệt Đỉnh Chiến Giới (T032) | **41** / 41 | A | = `game_id` hub | user×all | `…/api` (dev-game-services) |
| Tam Quốc Đại Minh Tinh (T037) | **1041** / **1041** | A | = `game_id` hub | user×all | `…/api` |
| Tam Quốc Quần Anh (T203) | 1040 / 31 (khóa tên `VITE_GAME_ID`) | A | = `game_id` hub | user×all, user×area | `…/api` |
| Thần Ma Ảo Hóa (T018) | 23 / 23 | A | = `game_id` hub | user×all, user×area, user×hero | `https://dev-game-services-api.vplay.vn` (đường dẫn thêm `/api/…`) |
| Huyền Anh Võ Lâm (T027) | 1039 / 30 | A′ | **30** (gắn cứng ở C#, prod) | user×all, user×area, user×guild | `https://game-services-api.vplay.vn` (**prod ngay cả ở dev**) |
| Giang Hồ Kỳ Ngộ (T030) | 36 (`AppHubId`, cả dev/prod) | A | 36 | user×all, user×area | `game-services-api.vplay.vn` |
| Quỷ Môn Quan (R015) | 1036 (nghi vấn) / ? | A | **29** (gắn cứng ở C#) | user×all, guild×all, user×area | `dev-game-services-api.vplay.vn` |
| Samkok Tam Quốc (T028) | 34 (cả dev/prod) | A | 34 | user×area | `game-services-api.vplay.vn` |
| Ta Là Hắc Ngộ Không (T031) | 1044 (deploy.yaml) / 43; appsettings 1052 | A | 1044 | user×all | `dev-game-services-api.vplay.vn` |
| Thao Túng Tam Quốc (R005) | 1042 / ? | **D** | *(không có)* | `type=user`, `top=1000` | `https://sgpayvtvlive.jfungame.com` |
| Thời Không Chi Mộng (T022) | 1036 / ? | A | **29** (gắn cứng ở C#) | user×all, guild×all, user×area | `dev-game-services-api.vplay.vn/api` |

## 4. Bộ biến môi trường tối thiểu cho clone (chỉ phục vụ 2 API)

| Biến | Dùng cho | Áp dụng |
|---|---|---|
| `…_HUB` | API 1 base | mọi game |
| `…_HUB_GAME_ID` (hoặc tương đương) | API 1 `game_id` | mọi game |
| `…_RANKING_API` | API 2 base | mọi game |
| `…_RANKING_GAME_ID` | API 2 `gameId` | trừ `thao-tung-tamquoc` (biến thể D không có `gameId`) |

Mọi biến khác trong `.env.example` / ConfigMap (`CLIENT_ID`, `CLIENT_SECRET`, `LOGIN_DOMAIN`, `DOMAIN`, `OIDC`, `WEBSHOP`, `API_BASE_URL`, `SERVICE_PATH`, `CDN_IMAGE`, `REDIRECT_URL`, `GTM`, `CLUB`, `PASS_EVENT`…) **bị bỏ khỏi clone** theo yêu cầu — xem N-B6 về rủi ro.

**Tên khóa hiện không thống nhất:** Vite gốc `VITE_APP_HUB / VITE_APP_GAME_ID / VITE_APP_API_GAME_SERVICES` (riêng Quần Anh `VITE_GAME_ID`), Next gốc `NEXT_PUBLIC_HUB / NEXT_PUBLIC_GAME_ID / NEXT_PUBLIC_API_SERVICE_GAME`, bản `-web` `NEXT_PUBLIC_HUB_GAME_ID / NEXT_PUBLIC_RANKING_API / NEXT_PUBLIC_RANKING_GAME_ID`.

**Lỗi công cụ liên quan (đã xác minh):** ô cấu hình bước 3 của wizard lấy khóa cố định là `VITE_APP_GAME_ID`, `VITE_LB_MODE`, `VITE_LB_SCOPE` (gắn cứng ở `detector/layer2-api-blocks.ts`, các dòng 387/422/429/437) cho **mọi** framework. Với game Next.js (`than-ma-ao-hoa` và 7 bản `-web`), giá trị nhập vào bước 3 được ghi vào `.env.local` dưới các khóa `VITE_*` mà code không đọc, nên không có tác dụng; đồng thời giá trị mặc định hiện ra rỗng vì `.env.example` không có các khóa đó. Với `samkok-tamquoc` khối "Site Config" không có tham số `game_id` nào, với `ta-la-hac-ngokhong` còn thừa `language_name` không gắn khóa.

## 5. Điểm cần bạn xác nhận (chưa tự sửa)

| # | Nghi vấn | Bằng chứng | Đề xuất |
|---|---|---|---|
| N-B1 | **Hai game trùng `game_id` dev = 1044:** Phượng Hoàng Tru Tiên (T029, `.env.example`) và Ta Là Hắc Ngộ Không (T031, `deploy.yaml` develop — giá trị bạn đã chọn trước đó). **Bằng chứng nghiêng về phía `appsettings.json` = 1052 cho T031:** ở 3 game biết đủ hai ID, dev = prod + 1009 (Huyền Anh 30→1039, Quần Anh 31→1040, Phượng Hoàng 35→1044); T031 prod = 43 → dev = **1052**, khớp `appsettings.json`, còn 1044 đúng bằng dev của T029 (có vẻ sao chép) | `phuong-hoang-tru-tien/deploy/develop/.env.example`, `ta-la-hac-ngokhong/deploy/develop/deploy.yaml` và `appsettings.json` | **Bạn xác nhận lại `game_id` dev của T031** (hiện bản `-web` đang để 1044 theo chỉ thị trước đó; đề xuất đổi 1052 nếu bạn đồng ý) |
| N-B2 | **`game_id` dev/prod có dấu hiệu sai hoặc trùng** theo quy luật dev = prod + 1009: Tuyệt Đỉnh Chiến Giới (T032) dev = prod = 41; Đại Minh Tinh (T037) dev = prod = 1041 (1041 − 1009 = 32, trùng mã T032); Thần Ma (T018) dev = prod = 23; Giang Hồ / Samkok cùng một ID cho cả hai môi trường | mục 3 | Bạn xác nhận ID dev và prod đúng của T032, T037, T018, T030, T028 (không suy đoán thay bạn) |
| N-B3 | **`gameId` ranking ≠ `game_id` hub ở một số game:** Huyền Anh (hub dev 1039, ranking 30), Quỷ Môn Quan và Thời Không (hub 1036, ranking 29, gắn cứng ở C#). Ở Vite/Next gốc hai ID luôn bằng nhau | mục 3 | Ranking dùng ID riêng thật hay chỉ là hằng gắn cứng? Ở môi trường dev nên dùng ID nào? |
| N-B4 | **Huyền Anh gọi ranking production ngay ở dev** (`game-services-api.vplay.vn`, gameId 30, endpoint `GetRankingT027`) — đúng bản C# gốc | `Pages/Ranking.cshtml.cs` | Giữ nguyên hay trỏ dev? (trùng N3 của phụ lục 08a) |
| N-B5 | **Quy ước base ranking không đồng nhất:** có game base kết thúc `/api` và đường dẫn là `/Ranking/GetRanking` (Vite gốc, Thời Không), có game base không có `/api` và đường dẫn là `/api/Ranking/GetRanking` (Thần Ma, các `-web` còn lại) | mục 3 | Chuẩn hóa một kiểu (đề xuất: base **không** có `/api`, đường dẫn luôn `/api/Ranking/GetRanking`) |
| N-B6 | **Bỏ biến ngoài 2 API có thể làm hỏng giao diện:** code vẫn dùng một số biến đó cho chức năng khác — ví dụ `VITE_APP_CDN_IMAGE` (2 file trong `phuong-hoang-tru-tien/src`), `VITE_APP_REDIRECT_URL`, `VITE_APP_CLUB` (Tuyệt Đỉnh) | mục 2 của 08a | Bạn xác nhận: bỏ hẳn (giao diện có thể mất ảnh CDN/…) hay giữ nguyên các biến đó nhưng không cho người dùng sửa |
| N-B7 | **Thao Túng Tam Quốc dùng API ranking hoàn toàn khác** (`jfungame.com`, không `gameId`) | `r005-fullweb-web/src/services/index.ts` | Giữ làm ngoại lệ (không có `RANKING_GAME_ID`), hay bạn muốn chuyển sang `GetRanking` chung? |
| N-B8 | **Khóa trong wizard bước 3** (`VITE_APP_GAME_ID`…) không khớp game Next.js | mục 4 | Chuẩn hóa tên khóa cho mọi game? Đề xuất: bộ 4 khóa `…_HUB`, `…_HUB_GAME_ID`, `…_RANKING_API`, `…_RANKING_GAME_ID`, để wizard nhận đúng theo framework |
| N-B9 | **`mode`/`scope` nhập tự do:** hiện bước 3 bắt nhập `mode`, `scope` chung, nhưng mỗi trang dùng nhiều cặp (vd `user×all`, `guild×all`, `user×area`) | mục 3 | Bước 3 nên chỉ giữ `game_id` và `gameId` (và URL), còn `mode`/`scope` là hằng theo từng tab? |

> **Cập nhật 2026-09-30:** game `thao-tung-tamquoc` (R005) đã bị **loại khỏi tool** (game lỗi thời) — các dòng/mục nhắc tới game này trong tài liệu chỉ còn giá trị lịch sử. Thư mục trên ổ đĩa vẫn còn, chưa xóa.

## 6. Quyết định của user (2026-09-30) và kết quả thực hiện

| # | Quyết định | Thực hiện |
|---|---|---|
| 1 | Không quan tâm môi trường production | Bỏ P4 và mọi việc production khỏi phạm vi; chỉ dev. Các nghi vấn production (N6 của 08a, phần prod của N-B2) không còn cần trả lời |
| 2 | ID lấy từ **GameId nhập trên form** của từng bản clone | Wizard bước 3 chỉ còn **một ô GameId**; giá trị ghi vào mọi khóa game id của template (hub `game_id` và ranking `gameId`). Đã kiểm: clone `huyen-anh-volam` với GameId 2001 → cả `NEXT_PUBLIC_HUB_GAME_ID` và `NEXT_PUBLIC_RANKING_GAME_ID` = 2001. Các nghi vấn ID (N-B1, N-B2, N-B3 và N5 của 08a) không còn chặn: ID do người dùng nhập |
| 3 | Bản clone dùng **version của bản được clone** | Khóa env lấy đúng tên template đang dùng (detector tự tìm: `VITE_APP_GAME_ID`, `VITE_GAME_ID`, `NEXT_PUBLIC_GAME_ID`, `NEXT_PUBLIC_HUB_GAME_ID`, `NEXT_PUBLIC_RANKING_GAME_ID`), không ép `VITE_*` cho mọi game. Đã kiểm cả 11 game |
| 4 | API ranking chỉ **một loại**: game-services-api | Đã chuyển `huyen-anh-volam` sang `/api/Ranking/GetRanking` (bỏ `GetRankingT027`), base dev `https://dev-game-services-api.vplay.vn`, `RANKING_GAME_ID` = `HUB_GAME_ID` = 1039 (cùng một GameId). Bản đọc cả mảng thẳng lẫn `{data:[…]}`. **Chưa kiểm phản hồi thật** của endpoint chung cho game này (chưa gọi API dev) |
| 5 | `mode`, `scope` lấy nguyên từ bản được clone, không hỏi user | Đã bỏ hai tham số khỏi wizard (chúng là hằng trong code, không phải biến env) |
| — | `thao-tung-tamquoc` đã loại khỏi tool | Không còn biến thể ranking D và câu hỏi N-B7 |

Sửa thêm: detector chọn nhầm lời gọi `sdk.site.getConfig()` ở `samkok-tamquoc` (không có `game_id`); nay ưu tiên lời gọi có `game_id`/`gameId` nên khối config của game này có ô GameId.

Còn mở: N-B4 (nay coi như xong), N-B5 (quy ước base ranking: game Next dùng base **không** `/api` + `/api/Ranking/GetRanking`; các game Vite gốc vẫn dùng base có `/api`; `thoi-khong-chi-mong` base có `/api` + `/Ranking/GetRanking`), N-B6 (biến ngoài 2 API có thể làm hỏng giao diện khi bỏ — chưa quyết).

## 7. Quyết định bổ sung (2026-09-30)

| Quyết định | Thực hiện |
|---|---|
| Biến env **đang được dùng** thì giữ nguyên | Đã rà: cả 6 bản `-web` chỉ dùng đúng 4 biến (`HUB`, `HUB_GAME_ID`, `RANKING_API`, `RANKING_GAME_ID`), không có biến ngoài nào cần giữ thêm. Với game Vite/Next gốc, bộ sinh clone vẫn chép toàn bộ `.env.example` nên không mất biến nào (N-B6 đóng) |
| **URL ranking theo chuẩn `phuong-hoang-tru-tien`**: base có `/api` (`https://dev-game-services-api.vplay.vn/api`) + đường dẫn `/Ranking/GetRanking` | Đã áp cho 6 bản `-web` (code `services/index.ts` và `deploy/develop/.env.example`; `.env.local` đồng bộ theo). `tsc` sạch cả 6. `thoi-khong-chi-mong` đã đúng sẵn. **Chưa gọi API dev thật để kiểm** (N-B5 đóng) |
| Hệ quả đi kèm (theo quyết định "không quan tâm production") | `giang-ho-ky-ngo` và `samkok-tamquoc`: `.env.example` develop đang chứa URL hub/ranking **production** nên đã đổi sang dev (`https://dev.vplay.vn/website-api`, `https://dev-game-services-api.vplay.vn/api`) — cần user xác nhận nếu muốn giữ khác |
| **Mọi bản clone chỉ dùng Next.js hoặc React (Vite); không có MVC.** Bản MVC phải được đưa về template Next.js khi CI/CD | Không còn luồng clone/CI-CD cho `dotnet-mvc`. Bản `-web` (Next.js 14) là nguồn của 6 game MVC cũ và dùng **template Next.js** của CI/CD; bản .NET gốc chỉ còn là tham chiếu/rollback, **không** vào pipeline. Template CI/CD chỉ cần hai loại: Next.js và Vite (React) — bỏ thư viện `VTVLiveVplayNetcoreautodev`/cổng 8080 khỏi kế hoạch (P0, P1 của 08-PLAN) |

Điểm cần xác nhận: "chuyển đổi khi CI/CD" được hiểu là **dùng bản `-web` đã port sẵn** (việc port từ MVC sang Next.js là thủ công/bán tự động, không chạy trong pipeline). Nếu cần pipeline **tự chuyển** một repo MVC mới sang Next.js thì đó là một hạng mục riêng, lớn, chưa nằm trong kế hoạch.
