# Đóng băng template + schema detect (Cách A)

Mục tiêu: test xong thì **bỏ repo template**, chỉ giữ schema detect để tiếp tục tạo web clone.
Schema không chứa code web, nên template được **đóng băng thành snapshot bất biến**, schema trỏ tới nó.

## Thành phần

| Thứ | Vị trí | Git |
|---|---|---|
| Schema detect (slot, block API, swiper, framework, `templateRef`, kết quả verify) | `Structure/clone-schemas/<gameId>.json` | **commit** |
| Manifest snapshot (version, hash, commit nguồn, số file) | `Structure/template-store/<gameId>/v<N>/manifest.json` | **commit** |
| Archive snapshot (`template.tgz`, không có node_modules/.next/.git) | `Structure/template-store/<gameId>/v<N>/template.tgz` | gitignore — cần lưu riêng (LFS/kho file) |
| Bản giải nén làm việc + clone + uploads | `Structure/template-materialized/<gameId>/` | gitignore, tự tái tạo |
| Template gốc | `Structure/game-template-repo/<gameId>/` | gitignore, **được phép xoá sau khi frozen** |

## Luồng hoạt động

1. **Chốt** — `POST /api/schema {"gameId":"..."}`
   1. Detect lại template gốc.
   2. Nén thành `v<N>/template.tgz` + `manifest.json` (hash cây file; cây không đổi thì không tạo version mới).
   3. **Kiểm chứng**: giải nén vào thư mục tạm, so hash cây file, detect lại, so với kết quả detect gốc
      (asset id+hash+section, block API, swiper).
   4. Khớp hết → schema `status: "frozen"` (xoá được template gốc). Lệch → `draft`, giữ template gốc.
2. **Chạy sau khi chốt** — `resolveGame()` (điểm duy nhất cấp `repoPath`):
   - thư mục gốc còn → dùng nó (live);
   - không còn mà schema `frozen` → giải nén snapshot vào `template-materialized/` (kiểm sha256 + hash cây,
     sai thì báo lỗi, không clone bản lệch) và dùng nó (snapshot).
   - `TEMPLATE_SOURCE=snapshot` (env) ép dùng snapshot dù thư mục gốc còn — để thử "không có template".
   Detect khi chạy từ snapshot đọc thẳng schema (không quét lại).
3. **Clone** — như cũ; nếu bản giải nén chưa có `node_modules` thì `npm ci` một lần (theo lockfile), dùng lại các lần sau.

## Quy trình xoá template an toàn

1. `POST /api/schema` → phải ra `"status":"frozen"`, `canRemoveLiveTemplate:true`.
2. Commit `clone-schemas/` + `template-store/**/manifest.json`; **sao lưu `template.tgz`** (không nằm trong git).
3. (Tuỳ chọn) `GET /api/schema?game=<id>&drift=1` → `liveChangedSinceFreeze:false` (template chưa bị sửa sau khi chốt).
4. Xoá `game-template-repo/<gameId>/<repo>`; thử Generate Clone + Preview.

## Sửa template sau khi chốt

Template gốc còn → sửa, chạy lại `POST /api/schema` → version mới (`v2`), schema cập nhật. Đã xoá template gốc thì
giải nén snapshot ra, sửa, rồi chốt lại. Version cũ giữ nguyên để rollback.

## Giới hạn hiện tại

- Danh sách game trong wizard vẫn lấy từ `GAME_REPO_MAP` (config.ts); game chỉ có schema mà chưa có dòng ở đó chưa hiện.
- Mapping PSD hiện nằm trong wizard (chưa lưu vào schema).
- Cần `tar` trong PATH (Git for Windows hoặc Windows 10+ đều có).
