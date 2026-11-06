> Tài liệu thiết kế của trình chỉnh layout, ghi theo từng mốc ngày. Đường dẫn dạng `asset-detector-web/src/...` trong văn bản nay là `src/...`; các lệnh e2e dùng `npm run e2e:visual-editing`.

# 14 — Kế hoạch triển khai Visual Editing (Inspector + Layout JSON + CSS Override)

Trạng thái: **CONDITIONAL GO** — đang làm Phase 0 (PoC). Cập nhật 2026-11-05 theo `visual-editing-implementation-plan-revised.md` và các quyết định đã duyệt.
Đánh giá khả thi gốc: `visual-editing-implementation-assessment.md` (điểm 44/100 cho phương án sinh code — không còn áp dụng).

## 1. Quyết định đã duyệt

1. Chỉ sinh **CSS override**; không sinh lại component/website.
2. Operator chỉnh được: vị trí, kích thước, **z-index, ẩn/hiện**.
3. **Next.js trước.** PoC trên `than-ma-ao-hoa/t018-than-ma-website` (Next 14.2.5, Tailwind 3). Vite sau, .NET cuối. Không công bố hỗ trợ framework nào trước khi có test end-to-end.
4. Kiểm thử bằng **Playwright** (`playwright-core`): đo vị trí/kích thước element và so ảnh chụp ở 1440 / 768 / 375.

Nguyên tắc: giữ nguyên source template và business logic; chỉ chỉnh asset slot đã nhận diện và an toàn; `layout.json` là nguồn dữ liệu chuẩn, CSS là artifact sinh ra; luôn có preview, save, reset, rollback.

## 2. Hiện trạng (đã xác minh trong repo)

| Hạng mục | Hiện trạng | Tác động |
|---|---|---|
| Clone flow | `copyRepoSkeleton` + `applyPersistedUploads` + patch text/env (`src/app/api/clone/route.ts`) | Không có pipeline sinh component |
| Framework | Vite SPA, Next.js, .NET Razor (`framework-detector.ts`) | Cần adapter riêng cho từng loại |
| AST | `@babel/parser`/`traverse` đã dùng ở `layer2-*.ts` | Dùng lại để gắn metadata vào JSX |
| Asset slot | `AssetReference {file, line, attribute, assetPath}` từ detector | Nguồn để dựng `editId` ổn định |
| Element identity | Template không có `data-slot` | Phải tạo `data-edit-id` |
| Preview | iframe tới dev server ở port khác | Inspector chạy trong clone, giao tiếp `postMessage` |
| Scale | `#transformWrapper` có `transform: scale(ww/base)`; base 768 nếu ww ≤ 768, 1920 nếu ≤ 1920, 2560 nếu lớn hơn | Mapper dùng ma trận, không hardcode phép chia |
| Responsive | 375 và 768 cùng nhánh base 768 → thực tế **2 chế độ layout** | Cần kiểm tra tablet có cần override riêng không |
| Tailwind | Next template: **Tailwind 3**; Vite template: **Tailwind 4** | Cách transform khác nhau (v3: `transform` + biến `--tw-translate-*`; v4: thuộc tính `translate`) — kiểm tra riêng từng bản |
| Persistence | `clone-schema.ts`: `schemaVersion`, `contentHash`, draft/frozen | Mẫu cho layout store |
| Overlay | `home-page-uploads` áp lại sau mỗi lần wipe | Mẫu cho `layout-overrides.css` |

## 3. Kiến trúc

```
Template → Clone → Edit Metadata Injector → Clone + Inspector Runtime
        → Coordinate Mapper → Layout JSON (source of truth)
        → CSS Override Generator → layout-overrides.css → Preview / Save / Reset
```

| Module | File | Trách nhiệm |
|---|---|---|
| Edit Metadata Injector | `src/detector/edit-id.ts` | Gắn `data-edit-id` cho asset slot cho phép; sinh manifest |
| Layout Schema | `src/detector/layout-schema.ts` | Kiểu dữ liệu, validate, phát hiện conflict |
| CSS Override Generator | `src/detector/layout-compile.ts` | `layout.json` → CSS có scope theo `data-edit-id` |
| Coordinate Mapper | `src/detector/coordinate-mapper.ts` | Ma trận 2D, nghịch đảo, delta viewport → giá trị CSS |
| Protocol | `src/detector/ve-protocol.ts` | Kiểm tra message (whitelist, version) |
| Inspector Runtime | `public/ve/inspector.js` (copy vào clone) | Hover, chọn, kéo, resize |
| Framework Adapter (Next) | `src/detector/ve-adapter-next.ts` | Chèn inspector + CSS vào `app/layout.tsx` của clone |
| Layout Store + API | `src/app/api/layout/route.ts` | GET / PUT / DELETE (reset), lưu cạnh `home-page-uploads` |
| UI | `src/app/components/wizard/EditorPanel.tsx` | Edit mode, breakpoint, reset, z-index, ẩn/hiện |

## 4. Phạm vi

**MVP:** background, logo, nhân vật, ảnh trang trí, banner tĩnh — chỉ asset slot có metadata ổn định và nằm trong element định vị (`absolute`/`fixed`). Thao tác: chọn, kéo, resize giữ tỷ lệ, đổi z-index, ẩn/hiện, theo breakpoint; save, preview, reset từng asset hoặc toàn trang.

**Ngoài MVP:** sửa text/font; đổi hành vi button; thêm/xóa component; Swiper/coverflow, video hero, animation; ranking/API; mọi framework ngoài Next trước khi có PoC adapter.

## 5. Edit ID (quy tắc)

- Không dùng `file:line`. ID dựng từ **asset slot** của detector: lấy `assetPath`, bỏ `${}`, thư mục breakpoint (375/768/1024/1440/1920), phần mở rộng → hai đoạn cuối, ví dụ `banner.logo-duatop`.
- ID gắn lên **element định vị gần nhất** (chính nó hoặc tổ tiên có `absolute`/`fixed` trong className), không gắn lên từng `<img>`/`<picture>`. Ảnh nằm trong luồng bình thường (`w-full`, không có tổ tiên định vị) thì **bỏ qua slot**, không đoán.
- Nhiều asset trong cùng một element định vị → một ID (theo asset đầu tiên); manifest liệt kê tất cả asset.
- Trùng ID giữa các element khác nhau → thêm hậu tố `~2`, `~3` theo thứ tự file/dòng; ghi vào manifest.
- Manifest (`editId`, `sourcePath`, `slot`, `assets`, `editable`) lưu cùng layout; layout trỏ tới `editId` không còn trong manifest → **báo conflict**, không áp dụng âm thầm.
- Footer (`*footer*`, `sdk/`) luôn loại.

## 6. Inspector và messaging

Inspector chạy trong clone. `postMessage` hai chiều, kiểm tra `event.origin`, `event.source`, `protocolVersion`, whitelist command: `INIT`, `SELECT`, `UPDATE_LAYOUT`, `SAVE`, `RESET`, `SET_BREAKPOINT`. Không nhận message để thực thi mã.

## 7. Coordinate Mapper

`getBoundingClientRect()` trả tọa độ viewport sau transform. Mapper nhận ma trận tích lũy từ `getComputedStyle().transform` của chuỗi tổ tiên (có `transform-origin`), nghịch đảo để đổi delta pointer ở viewport sang delta trong hệ tọa độ của parent định vị, rồi đổi sang `%` theo kích thước parent. Có unit test (scale, translate, lồng nhau). Acceptance: sai số ≤ 2px design coordinate; không lệch khi đổi viewport hoặc scroll.

## 8. CSS Override

- Selector nhân đôi `[data-edit-id="x"][data-edit-id]` (specificity 0,2,0) thắng tiện ích Tailwind (0,1,0) mà không dùng `!important`. **Giả thuyết cần PoC xác nhận**; thua inline style nếu có.
- Không ghi đè `transform`. Đổi vị trí bằng `left/top` (+ `right/bottom: auto`); `translate(-50%)` gốc giữ nguyên.
- Ẩn = `display: none`; z-index = `z-index`.
- Kiểm thử: thứ tự nạp CSS, specificity, media query, inline style, build/purge.

## 9. Responsive

Media query theo cơ sở scale của template: desktop ≥ 769px; tablet 481–768px; mobile ≤ 480px. Asset khác nhau theo breakpoint (hai DOM riêng `md:hidden` / `hidden md:block`) có `editId` riêng; inspector chỉ chỉnh element đang hiển thị ở viewport hiện tại.

## 10. Layout schema

```json
{
  "schemaVersion": 1,
  "gameId": "than-ma-ao-hoa",
  "templateRef": { "contentHash": "..." },
  "elements": {
    "banner.logo-duatop": {
      "overrides": {
        "desktop": { "left": "7%", "top": "5rem", "width": "20%", "zIndex": 3, "hidden": false }
      }
    }
  }
}
```

Giá trị chỉ nhận độ dài thuần (`%`, `px`, `rem`, `em`, `vw`, `vh`), vì chúng đi thẳng vào CSS sinh ra. Lưu tại `home-page-layout/layout.json`, sống sót qua mỗi lần wipe clone; áp dụng idempotent sau `applyPersistedUploads`.

## 11. Lộ trình

Ước lượng thô, không phải cam kết.

| Phase | Nội dung | Effort |
|---|---|---|
| 0 — PoC Next.js | Injector theo slot, inspector, mapper, layout + CSS, reset, 375/1440, Playwright | 5–8 ngày công |
| 1 — Desktop MVP | Manifest toàn trang, save/publish/reset, versioning, conflict, undo/redo | 25–35 |
| 2 — Responsive | Chỉnh theo breakpoint, nhóm responsive, kiểm tra tràn/chồng | 15–20 |
| 3 — Adapters | Vite, rồi .NET; mỗi cái có PoC và regression riêng | cần spike |
| 4 — Nâng cao | Snap/lưới, vùng an toàn, gợi ý vị trí | chưa ước lượng |

**Tiêu chí nghiệm thu PoC:** chọn đúng asset đã đăng ký; không chỉnh nhầm element không hỗ trợ; kéo sai số ≤ 2px; resize giữ tỷ lệ; scale không làm lệch khi đổi viewport; save/reload giữ layout; reset khôi phục đúng; element không chỉnh không bị ảnh hưởng; 375 và 1440 đúng; `next build` thành công; phát hiện được layout không còn tương thích.

**Dừng/thu hẹp nếu:** không ánh xạ tọa độ ổn định, override thường xuyên phá transform/responsive, phải sửa sâu business logic, hoặc không tạo được edit identity ổn định.

## 12. Rủi ro

| Rủi ro | Mức | Giảm thiểu |
|---|---|---|
| Mapper sai do scale/nested transform | Cao | Ma trận + unit test + Playwright |
| Override không thắng Tailwind | Cao | Selector nhân đôi; test specificity |
| Override phá transform gốc | Cao | Không đụng `transform` |
| Hai DOM theo breakpoint | Cao | `editId` riêng, chỉ chỉnh element đang hiển thị |
| DOM động mất selection | Cao | Loại khỏi MVP |
| ID không ổn định | Cao | Dựng từ asset slot + manifest + conflict |
| Message iframe không an toàn | TB/Cao | Origin/schema/whitelist |
| Next/.NET khác Vite | Cao | Adapter riêng, không tuyên bố sớm |
| Template đổi → layout cũ lỗi | Cao | `contentHash`, schema version, conflict |
| Override ảnh hưởng element khác | Cao | Selector scope, regression test |

## 13. Chấm điểm

Chỉ chấm sau PoC. Rubric: Template Integration 15, DOM & Asset Identification 15, Inspector & Drag/Resize 15, Coordinate Transformation 15, Responsive Override 15, Layout Schema & Persistence 10, Build & Preview 10, Safety & Rollback 5. Trước PoC, các mục Coordinate, CSS override và Framework compatibility ghi **chưa xác minh**.

## 14. Kết quả PoC Next.js (2026-11-05, `than-ma-ao-hoa`)

Đã làm: edit-id theo asset slot (`edit-id.ts`), schema + conflict (`layout-schema.ts`), CSS override (`layout-compile.ts`), store + history (`layout-store.ts`), mapper ma trận (`public/ve/mapper.js`), giao thức (`public/ve/protocol.js`), inspector (`public/ve/inspector.js`), adapter Next (`ve-adapter-next.ts`), API `/api/layout`, `EditorPanel` trong bước 4 của wizard (bật bằng ô "Bật chỉnh layout").

Kiểm chứng:
- 71 test đơn vị đạt (gồm 38 test cho edit-id/schema/compile/mapper/protocol); `tsc` và `eslint` sạch cho file mới.
- `scripts/ve-e2e.mjs` (Playwright, chạy qua wizard thật): **20/20 đạt** — chọn, kéo 100px lệch 0.00px ở 1440 và 30px lệch 0.01px ở 375, resize giữ tỷ lệ, z-index, ẩn/hiện, reload giữ layout, override desktop không lọt sang mobile và ngược lại, phần tử lân cận không dịch, reset về đúng vị trí gốc, API từ chối phần tử ngoài manifest và giá trị có thể chèn CSS.
- `next build` của clone đã inject (ID + script) thành công.
- Template gốc không bị sửa (chỉ bản clone).

Đã xác nhận: selector nhân đôi thắng tiện ích Tailwind 3 (`md:right-[18.5%]`, `translate-x-1/2`) mà không cần `!important` và không cần đụng `transform`.

Số liệu thật trên `than-ma-ao-hoa`: 73 phần tử chỉnh được, 61 ảnh bị bỏ qua vì nằm trong luồng trang; 10/73 id có hậu tố `~N` (các biến thể có điều kiện trong cùng một file).

Lỗi đã gặp và sửa: vòng lặp `READY`↔`INIT` vô hạn (thêm `STATE`); iframe nạp trước khi preview server sẵn sàng (EditorPanel chờ server).

## 14b. Giới hạn thao tác cho operator (2026-11-05, đã duyệt)

Mặc định, chỉnh được ở `public/ve/protocol.js` + `src/detector/layout-schema.ts` (một test giữ hai nơi bằng nhau):

| Giới hạn | Giá trị | Nơi áp dụng |
|---|---|---|
| Kéo | Phần tử luôn nằm trong khung chứa (`offsetParent`); phần tử đã lòi ra ngoài không bị ép di chuyển nhưng không ra xa hơn | inspector (`clampDelta`) |
| Resize | Giữ tỷ lệ; ≥ 24px thiết kế; không vượt khung chứa | inspector (`maxScaleInside`, `MIN_SIZE`) |
| z-index | số nguyên −10…999 | inspector + API + schema |
| `left`/`top` | `%` từ −50 đến 150; `px` ≤ 10000 | API + schema |
| `width`/`height` | phải dương; `%` ≤ 200; `px` ≤ 10000 | API + schema |
| Chồng lấn | cảnh báo, không chặn, chỉ cho chồng lấn mới phát sinh sau thao tác | inspector → panel |

Hai bổ sung kèm theo: tay cầm di chuyển ✥ luôn nằm trên cùng (phần tử bị phần tử khác che vẫn kéo được), và `setPointerCapture` để kéo ra ngoài iframe không bị treo.

Kiểm chứng: 101 test đơn vị; `scripts/ve-e2e.mjs` 28/28 (dừng đúng góc 1440/542.5, tối thiểu 18px = 24 design px ở 1440, phóng to dừng sát mép, cảnh báo chồng lấn, API từ chối z-index 5000 / left 400% / width 0).

Hạn chế đã biết: khi kéo sang trái, phần tử dừng ở `left = 308` thay vì sát mép trái khung (0) trong môi trường e2e, rất có thể do vùng cuộn của tool che 308px đầu của iframe; chưa xác minh nguyên nhân. Cạnh trên/phải/dưới đã chứng minh chạm đúng mép.

## 14c. Phóng to/thu nhỏ ảnh và giao diện toàn màn hình (2026-11-05)

**Resize = scale, không phải đổi `width`/`height`.** Bản đầu đổi kích thước khung và để ảnh bên trong tự co giãn; không đủ vì nhiều ảnh trong template có kích thước cố định (`w-[192px] h-[81px]`, `h-[153px]`, `aspect-[..]`) hoặc nằm trong nhóm nhiều ảnh (`banner.dot` chứa chấm 11×20 và logo). Thử ép mọi ảnh `width: 100%` làm chấm nhỏ phình thành 200px nên đã bỏ.

Cách hiện tại: ghi CSS `scale: sx sy` (thuộc tính `scale` riêng, không đụng `transform`) lên phần tử được gắn id. Mọi thứ bên trong đổi tỷ lệ đúng tương quan, các phần tử khác không bị xê dịch. Sau mỗi bước kéo, `left/top` được hiệu chỉnh theo vị trí thật đo được (`getBoundingClientRect`), nên cạnh/góc đối diện với tay cầm đứng yên dù template neo kiểu `translate(-50%)`, `right/bottom` hay `transform-origin`.

- 8 tay cầm: 4 góc giữ tỷ lệ (giữ Shift để kéo giãn tự do), 4 cạnh kéo giãn một chiều; khung quá nhỏ (<40px) chỉ hiện tay cầm góc.
- Ô nhập "Ngang/Dọc (%)" trong panel; 100% = kích thước gốc của template. Phạm vi 10–500% (server và trình duyệt cùng giới hạn).
- Giới hạn cũ vẫn áp dụng: không ra ngoài khung chứa, ≥ 24px thiết kế, không to quá khung chứa (tính theo hộp nhìn thấy).
- `width`/`height` vẫn nằm trong schema và API (tương thích) nhưng giao diện không còn tạo ra chúng.

**Toàn màn hình.** Trình chỉnh mở thành một lớp phủ cố định: thanh công cụ trên (Desktop/Tablet/Mobile, "Vừa khung"/100%, Chế độ chỉnh, Đóng), khung xem trước lớn ở giữa, panel cố định bên phải có cuộn riêng. "Vừa khung" thu nhỏ preview (CSS scale) để thấy nhiều trang hơn; kéo thả vẫn chính xác khi bị thu nhỏ (e2e: kéo 65px màn hình = 102.6px trang, đúng). Chọn từ danh sách thì trang tự cuộn tới phần tử.

Kiểm chứng: 104 test đơn vị; `scripts/ve-e2e.mjs` 45/45 (chạy trên wizard thật), gồm: ảnh bên trong phóng to đúng hệ số cùng khung, ảnh cố định (`banner.dot`) phóng/thu đúng hệ số, gõ tỉ lệ 150% ra đúng kích thước, gõ 900% bị từ chối, e2e bắt được và đã sửa lỗi "kéo một cạnh làm trục kia co về 1".

## 14d. Vite, thay ảnh trực tiếp trong preview (2026-11-05, thử trên `phuong-hoang-tru-tien`)

**Adapter Vite.** `ve-adapter-vite.ts` chèn CSS override và script inspector vào `index.html` của bản clone (dùng chung `ve-install.ts` với adapter Next). Chạy được cho game Vite + Tailwind 4: 30 phần tử chỉnh được, 30 ảnh bị bỏ qua (nằm trong luồng trang). Template gốc không bị sửa.

Ba lỗi thật tìm ra khi chuyển sang Vite, đều đã sửa:
1. **Gắn ID không khớp thuộc tính nhiều dòng.** Với `src={handleConcatPathImage({ path: "..." })}` detector báo dòng của `path:` còn thuộc tính bắt đầu ở dòng trên, nên không gắn được ID nào. Nay khớp theo khoảng dòng và tên file của asset trong chính thuộc tính đó.
2. **Khung chứa sai.** `offsetParent` bỏ qua tổ tiên chỉ có `translate`/`scale`/`filter` (Tailwind 4 dùng các thuộc tính này), nên giới hạn kéo và quy đổi % đều sai. Nay tự xác định khung chứa thật: tổ tiên được định vị *hoặc* tạo khung chứa bằng transform-like.
3. **Phần tử `position: fixed`** (header, nút BXH, float phải, logo 18+: phần lớn UI nổi của game này) bị từ chối. Nay hỗ trợ; khung chứa là tổ tiên có transform (nếu có) hoặc cửa sổ, đơn vị là % vì template viết `top-[80%]`.

**Thay ảnh trực tiếp.** Chọn phần tử, panel liệt kê ảnh nó đang hiển thị (`currentSrc`, đúng file của breakpoint hiện tại), ghép với asset slot bằng đường dẫn (`asset-match.ts`), cho tải file hoặc dán link, chọn điểm neo cắt, chọn thay mọi kích thước màn hình hay chỉ bản đang xem, và khôi phục ảnh gốc.
- API `/api/asset` (POST thay, DELETE khôi phục, GET danh sách đã thay) dùng chung `upload-store.ts` với bước 2 của wizard: từ chối file không phải ảnh, cắt/nén đúng kích thước từng file gốc, lưu trong `home-page-uploads` nên bền qua mỗi lần Tạo bản sao. **Chỉ ghi được file thuộc một asset slot đã nhận diện** (`slots.json` ghi lúc dựng clone).
- Nạp lại ảnh bằng lệnh `RELOAD_MEDIA` (thêm `?ve=` vào `src/srcset/poster`), không tải lại cả trang.
- Ảnh tải từ CDN (khác origin với preview) hiện thông báo "thay ở bước 2" thay vì thay mà không thấy đổi. Ảnh không thuộc slot (ví dụ từ API) và video cũng không thay ở đây.

Kiểm chứng trên `phuong-hoang-tru-tien` (đo điểm ảnh đang hiển thị): tải file magenta lên làm điểm giữa ảnh đổi từ `rgb(255,255,219)` sang `rgb(255,0,255)`, ảnh mới đúng kích thước gốc, 30 file biến thể được ghi; dán link thay được; file `.txt` bị từ chối và ảnh giữ nguyên; API từ chối ghi `package.json`; khôi phục trả đúng ảnh gốc từng byte.

Hai phát hiện chưa giải quyết hết:
- **Scale responsive của template.** Nhiều phần tử nổi của game này tự đổi tỉ lệ theo cỡ màn hình (`xl:scale-100 lg:scale-[.85] md:scale-[.65]`). Tỉ lệ operator chỉnh là một giá trị cố định cho cả dải desktop (≥769px), thay cho hành vi đó. Panel hiện cảnh báo khi gặp phần tử như vậy; chưa có cách giữ nguyên hành vi responsive.
- **Nhiều phần tử đè lên nhau** (ví dụ ảnh `icon-app` phủ lên `news.android`) nên nhấn vào giữa dễ chọn nhầm; nút ✥ luôn kéo đúng phần tử đang chọn.

## 14e. Ảnh nằm trong luồng trang: chỉ phóng/thu nhỏ (2026-11-05)

Ảnh không có khung `absolute`/`fixed` bao quanh không có `left/top` để đổi, nên trước đây bị bỏ qua. Nay ảnh nhỏ như vậy được gắn ID với `mode: "scale"` (và thuộc tính `data-edit-mode="scale"` trên chính thẻ `<img>`; với `<picture>` thì gắn vào `<img>` vì `<picture>` inline không transform được):
- Chỉ **phóng/thu nhỏ quanh tâm ảnh** (CSS `scale`) và **ẩn**. Không dời, không đổi z-index. Panel ẩn ô z-index và nút ✥, hiện ghi chú; API từ chối `left/top/width/height/zIndex` cho phần tử loại này (`patchAllowedFor`).
- Giới hạn phóng: không quá khung chứa (tính từ tâm), không nhỏ hơn 24px, tỉ lệ 10–500%.
- Vẫn bị bỏ qua và ghi lý do: ảnh nền cả khu vực (class `w-full`, `w-screen`, `h-full`, `object-cover`, `inset-0`) và video.
- Trên `phuong-hoang-tru-tien`: 6 ảnh nhỏ (chevrons phân trang, logo và nút tải ở header, `frame-middle`) chỉnh được thêm; 13 ảnh nền và 10 video vẫn bỏ qua. Số phần tử chỉnh được 30 → 36.

Kiểm chứng: 129 test đơn vị; e2e Vite 66/66, e2e Next 45/45. Ảnh trong luồng: nhấn kéo không làm nó dịch, góc phóng quanh tâm giữ tỉ lệ (tâm lệch 0.00px), cạnh kéo giãn một chiều, phóng lại dừng ở rìa khu vực chứa, API từ chối đổi vị trí, reset trả đúng kích thước.

## 14f. Ảnh từ dữ liệu API và duyệt các trang (2026-11-05)

**Ảnh lấy từ API** (`src={slide.image}`, `imageArt`, `tab.image`, `siteConfig?.site_logo_url || "..."`): detector không có đường dẫn nào để báo nên trước đây không chỉnh được. Nay bộ gắn ID nhận ra thẻ `img` có `src` đọc một biến/thuộc tính (`readsData`: tên hàm và khóa object như `handleConcatPathImage({ path: "..." })` không tính là dữ liệu), đặt tên theo trường dữ liệu (`rank.data-image`, `slider-pc.data-image-art`) và đánh dấu `source: "api"` + `data-edit-source="api"`.
- **Chỉnh được:** vị trí, kích thước (scale), ẩn, theo cùng quy tắc: trong khung định vị thì dời được, nằm trong luồng thì chỉ phóng/thu nhỏ.
- **Khoá:** không có form thay ảnh; panel ghi "Ảnh lấy từ dữ liệu (API): nội dung không sửa được". `/api/asset` vốn chỉ ghi file thuộc một asset slot nên không thể ghi nhầm vào dữ liệu.
- Phần tử vẽ lặp theo dữ liệu (tin, slide): cùng một ID, một override cho mọi bản; panel báo "trang đang vẽ N bản giống nhau, chỉnh một là chỉnh tất cả".
- Ảnh API nằm chung phần tử với một ảnh file: phần tử đó vẫn là phần tử thường, thay được ảnh file.
- Vẫn chưa nhận: ảnh nền khai báo bằng CSS/`style={{ backgroundImage }}`, và video lấy từ dữ liệu.

**Duyệt các trang.** `routes.ts` dò danh sách trang: Vite + react-router (`<Route path element>`), Next.js App Router (`app/**/page.*`, bỏ nhóm `(x)`, `[slug]` → `:slug`, `[...x]` → `*`), kèm các file mỗi trang vẽ (theo import, thêm layout cha). Lưu ở `home-page-layout/routes.json`.
- Thanh công cụ có ô **Trang** (kèm số phần tử chỉnh được mỗi trang); trang có tham số (`/tintuc/:slug`) hiện ô nhập tham số và nút Mở.
- Chọn một phần tử nằm ở trang khác trong danh sách thì tự mở trang đó rồi chọn nó; ô Trang theo dõi cả khi operator tự bấm liên kết (inspector báo URL hiện tại).
- Phần tử bị template ẩn ở kích thước đang xem (`md:hidden`...): panel nói rõ và có nút chuyển sang kích thước hiển thị nó.

Kiểm chứng: 149 test đơn vị; e2e Vite 73/73 (gồm duyệt trang, ảnh API bị khoá, gợi ý phần tử ẩn), e2e Next 45/45.
Trên `phuong-hoang-tru-tien`: 9 trang, 40 phần tử chỉnh được (trước 36), trong đó 4 ảnh API; `/choigame1–5` chỉ có video nên 0 phần tử.

## 15. Điều chưa xác minh

- Phần tử có CSS `scale` riêng hoặc animation đổi `scale` của template: có cảnh báo trong panel nhưng chưa có cách giữ hành vi responsive (xem 14d).
- Game Next.js khác ngoài `than-ma-ao-hoa`, và game Vite khác ngoài `phuong-hoang-tru-tien`: chưa thử.
- Thay ảnh khi ảnh tải từ CDN: không hỗ trợ trong preview (chỉ thông báo).
- Khung chứa ngắn hơn khung nhìn của iframe ở cạnh trái: xem 14b.
- Kẹp mép trái chưa chứng minh được ở sát mép (xem 14b).
- Tailwind 4 (template Vite): cách transform khác, chưa thử.
- Vite và .NET Razor: chưa có adapter.
- Tablet 481–768: chưa có test riêng (e2e mới đo 1440 và 375).
- Phát hiện conflict (template đổi / id biến mất) mới có test đơn vị, chưa có e2e.
- Ảnh có hai bản theo breakpoint trong hai DOM khác nhau (`md:hidden`) mới kiểm tra ở mức id; chưa thử chỉnh thực tế.
- Rotate trên tổ tiên và phần tử `fixed` bị inspector từ chối có chủ đích (báo lỗi, không đoán).
- Chưa đo độ giống >95% bằng so ảnh toàn trang; mới đo vị trí/kích thước từng phần tử.

## 16. Đánh giá: gộp bước 2 vào bước 4 (2026-11-05)

Số liệu đo trên 2 game (slot ảnh của bước 2 so với phần tử chỉnh được trong trình chỉnh; "chỉnh được" tính trên toàn bộ mã nguồn, có thể phải đổi route/breakpoint mới thấy):

| | phuong-hoang-tru-tien | than-ma-ao-hoa |
|---|---|---|
| Slot ảnh ở bước 2 | 37 | 145 |
| Chọn được trong trình chỉnh (dời được + chỉ phóng) | 23 (62%) | 58 (40%) |
| Chỉ có trong bước 2: ảnh nền cả khu vực / video | 2 | 7 |
| Chỉ có trong bước 2: không có phần tử nào trỏ tới (favicon, nền CSS, dữ liệu mảng, route chưa duyệt...) | 12 (gồm 8 favicon) | 80 |
| Asset CDN ngoài (bước 2) | 7 (1 video) | 3 |
| Nội dung chữ (tiêu đề, mô tả, tên game) | 3 | 0 |

Kết luận: gộp được phần thao tác trên ảnh nhìn thấy; **không xoá được danh sách của bước 2**, nên chuyển nó thành một tab trong bước 4. Chi tiết và các rủi ro nằm trong trả lời cho yêu cầu này.

