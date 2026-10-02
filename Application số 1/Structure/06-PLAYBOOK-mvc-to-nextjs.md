# Playbook — Chuyển game .NET MVC/Razor Pages sang Next.js (dành cho agent)

**Nguồn kinh nghiệm:** pilot `huyen-anh-volam` (t027), hoàn thành 2026-09-29; rollout 6 repo còn lại hoàn thành 2026-09-30 (xem mục 8).
**Trạng thái:** cả 7 repo Nhóm C đã có bản `-web` và được đăng ký trong `GAME_REPO_MAP`. Chỉ `huyen-anh-volam` và `thao-tung-tamquoc` có bản mobile riêng (làm đúng mục 2–3); 5 repo còn lại là một cây responsive (mục 8.1).

Kết quả tham chiếu (đọc code này trước khi làm repo mới):
`game-template-repo/huyen-anh-volam/t027-huyen-anh-vo-lam-homepage-web/`
Repo .NET gốc giữ nguyên ở `.../t027-huyen-anh-vo-lam-homepage/` để đối chiếu và rollback.

## 0. Phạm vi (đã chốt với user)

- **Chỉ homepage/landing**: các trang render của Razor (`Index`, `News`, `Detail`, `Ranking`, bản `Mobile/*`). Không port Controllers, API backend, `Jobs/`, mini-feature ngoài phạm vi (xem memory `project_dotnet_clone_scope`).
- **Bản PC phải khớp bản gốc từng pixel**; bản mobile phải khớp bản gốc `Pages/Mobile/*`; **tablet hiện bản PC thu nhỏ**.
- Làm 1 repo, chạy qua wizard clone của `asset-detector-web`, xác nhận rồi mới sang repo tiếp theo.

## 1. Quy trình chuyển đổi

1. **Đọc bản gốc**: `Pages/Shared/_Layout.cshtml`, `_LayoutMobile.cshtml`, `Pages/*.cshtml`, `Pages/Mobile/*.cshtml`, `wwwroot/pc|mobile/sass/9main*.scss`, `appsettings.json`, `Helpers/` (API gọi gì).
2. **Tạo dự án** `<repo>-web` (Next 14.2 App Router, `next.config.mjs`, Tailwind, `axios`, `swiper`, `dayjs`). Copy `deploy/develop/.env.example` với 4 biến `NEXT_PUBLIC_HUB`, `NEXT_PUBLIC_HUB_GAME_ID`, `NEXT_PUBLIC_RANKING_API`, `NEXT_PUBLIC_RANKING_GAME_ID` (lấy từ `appsettings.json`).
3. **Copy tĩnh, không viết lại CSS**:
   - `wwwroot/pc/sass/9main.css` → `public/legacy/css/9main.css`, `swiper.css` cùng chỗ.
   - `wwwroot/mobile/sass/9main-mb.css` → `public/legacy/mobile/css/9main-mb.css`.
   - Ảnh PC → `public/legacy/images`, ảnh mobile → `public/legacy/mobile/images` (đường dẫn `../images/...` trong CSS vẫn đúng).
4. **`app/layout.tsx`**: nạp đúng các link/script CDN của `_Layout.cshtml` (Font Awesome 4.7, Bootstrap 5.0.2, bootstrap-icons 1.3.0, `9main.css`, `swiper.css`) và `loader.min.js` của Vplay SDK (`next/script`, `lazyOnload`).
5. **Mỗi file `.cshtml` → 1 component** trong `components/legacy` (PC) và `components/legacy-mobile` (mobile). Giữ nguyên class Bootstrap/`9main.css`; thay `data-bs-*` (JS Bootstrap) bằng `useState` (tab, carousel, modal, offcanvas).
6. **`@Model.SiteData...`/`CallApi` → `src/services/index.ts`** dùng `axios.get(...)` **trực tiếp** (xem mục 4).
7. **Đăng ký**: sửa `GAME_REPO_MAP[<gameId>]` trong `asset-detector-web/src/detector/config.ts` trỏ sang thư mục `-web` (kèm comment giải thích như mục huyen-anh-volam). `isCloneReady()` (`src/app/page.tsx`) trả `true` cho framework `nextjs`.
8. **Kiểm tra**: `npx tsc --noEmit`, `npx next lint`, chạy test Playwright (mục 6), rồi Generate Clone trong wizard (kỳ vọng 200, có `src/services/index.ts`, `.env.local` được điền).

## 2. Nhận diện thiết bị (PC / tablet / mobile) — làm ở client

Không cần nhận diện ở server. Học từ `phuong-hoang-tru-tien` (hook `useResize` dựa vào `window.innerWidth`), nhưng bản Next phải xử lý thêm việc SSR:

`src/hooks/useResize.ts`:
```ts
const MOBILE_BREAKPOINT = 768;
function isTablet() {
  const ua = navigator.userAgent;
  const iPadOS = navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1;
  return /iPad/.test(ua) || iPadOS || (/Android/.test(ua) && !/Mobile/.test(ua));
}
// trong effect:
setDevice(ww >= MOBILE_BREAKPOINT || isTablet() ? "pc" : "mb");
setReady(true);
return { device, size, ready };
```
Mỗi `page.tsx` (`"use client"`) làm:
```tsx
const { device, ready } = useResize();
if (!ready) return null;            // không render cây nào trước khi đo được width
if (device === "mb") return <MobileSiteChrome>…</MobileSiteChrome>;
return <SiteChrome>…</SiteChrome>;
```
- **Quy tắc:** chỉ mount **một** cây (PC hoặc mobile), không bao giờ cả hai. Không dùng `d-lg-none`/`d-none d-lg-block` để double-mount — hai cây trùng id/class (`#layout`, `.header`, `.container`…) và CSS chồng nhau.
- **Vì sao có `ready`:** SSR không có `window`; nếu mặc định `"pc"` thì mobile bị nháy giao diện PC trước. `ready` chặn render tới khi đo xong. Đổi lại trang trống một khoảnh khắc (nội dung vốn fetch ở client nên không mất SEO thêm).
- **Tablet (≥768px hoặc UA iPad/Android không "Mobile")** dùng bản PC; `ScaleWrapper` chỉ thu nhỏ canvas 1920px.
- Trang có `useState`/`useEffect` (như `tin-tuc/[id]`): **đặt `if (!ready) return null` SAU các hook** hoặc gộp vào điều kiện `!ready || !loaded` — không return sớm trước hook (vi phạm rules of hooks; `tsc` không bắt được).

## 3. Cô lập CSS giữa PC và mobile

`9main.css` (PC) và `9main-mb.css` (mobile) cùng định nghĩa `body`, `.container`, `.header`, `.download`, `#layout`… và `9main.css` nạp global trong `layout.tsx`. Cách xử lý đã kiểm chứng, **không sửa code PC**:

- `src/hooks/useMobileStylesheet.ts`: khi cây mobile mount, đặt `disabled = true` cho `<link href="/legacy/css/9main.css">`; cleanup bật lại. Dùng trong `MobileSiteChrome`.
- `MobileSiteChrome` tự render `<link rel="stylesheet" href="/legacy/mobile/css/9main-mb.css" />` và dùng `id="layout"` bình thường (PC CSS đã tắt nên không đụng `#layout{width:1920px}`).
- Hệ quả đã test: đổi cỡ cửa sổ PC ↔ mobile bật/tắt đúng CSS; điều hướng client giữa các trang mobile giữ đúng CSS.
- `globals.css` chỉ import Tailwind `components` + `utilities` (KHÔNG `base`/Preflight, vì Preflight sẽ vẽ lại markup Bootstrap của PC). Cần khai báo lại các biến `--tw-*` thủ công nếu dùng `translate/scale`.

## 4. Quy ước để `asset-detector` nhận diện được (detect)

- **`axios.get(` phải là chuỗi literal, phân biệt hoa/thường**, base URL viết thẳng trong template literal:
  `` axios.get(`${process.env.NEXT_PUBLIC_HUB}/api/frontend/config`, { params: … }) ``
  Không dùng `axios.create()` hay instance bọc (`hubAxios.get(` không bị matcher `layer2-api-blocks.ts` thấy).
- **Đường dẫn ảnh dạng template literal cần hậu tố literal không rỗng sau phần nội suy**: `` `/images/x/${n}.jpg` `` ✔, `` `/images/x/${filename}` `` ✘ (`matchesAsset()` Case 2 cần `suffix` truthy). Tên file literal ở chỗ khác (`icon: "foo.png"`) cứu được qua Case 1 nhưng đừng chỉ dựa vào đó.
- **`next.config.mjs`** (không phải `.ts`) với Next 14.2.x.
- Ảnh trang trí không nối vào component (hover state, nền popup, texture mobile) sẽ là zero-ref — đó là bình thường, dùng toggle "không dùng asset này" thay vì cố nối. avgConfidence pilot: 0.66 (bản .NET: 0.85 nhưng chủ yếu do lỗi `@rootPath` bị coi là dynamic).
- Nút "Run Preview" của tool không phục vụ nội dung trong sandbox (lỗi môi trường, tái hiện cả trên `than-ma-ao-hoa`). Chạy thẳng `npm run dev -- -p <port>` để xem.

## 5. Các bẫy giao diện đã gặp (đều đã sửa trong pilot)

| Bẫy | Triệu chứng | Cách xử lý |
|---|---|---|
| `#layout` là canvas 1920px scale bằng `transform` | `position: fixed` đặt trong `#layout` neo sai | `ScaleWrapper` render `fixedContent` (floatbar, btn-xephang, modal) **ngoài** `#layout`; `html, body, .wrapper { overflow-x: hidden }` chống scroll ngang |
| Trang ngắn hơn cửa sổ / footer SDK nạp muộn | Lộ nền vàng dưới footer | `ScaleWrapper.update()`: tính `shortfall = innerHeight/scale − naturalHeight`, gán `margin-top` cho `:scope > .footer`; trừ margin cũ để `ResizeObserver` không dao động |
| `import "swiper/css/navigation"` | Mũi tên xanh chữ (`::after`, font `swiper-icons`) đè lên ảnh `prev.png/next.png`, nút co còn 27×44 | Không import CSS navigation; `swiper.css` gốc đã vẽ nút bằng ảnh 56×56 |
| `.bxh { height: 872px }` cố định, khung ảnh tràn ~43px | Nút "Về trang chủ" tràn xuống đè footer | Đặt nút là **sibling** sau `.bxh` (không phải con), `mt-5 pt-3` |
| Footer Vplay SDK (`data-vplay-widget`) | Cao thấp khác nhau theo bề rộng cửa sổ (padding 100px khi ≥1600px, 32px khi ≥1440px); nạp lúc có lúc không | Là hành vi của SDK, bản gốc .NET giống hệt; không ép chiều cao. Test phải chờ `footer.landingGame` |
| Bootstrap carousel/offcanvas/modal | Không có JS Bootstrap | Dựng lại bằng `useState` + đúng class (`carousel-item.active`, `offcanvas.show` + `style={{visibility:"visible"}}`, `modal.show.d-block` + `modal-backdrop`) |
| Detect iOS | Bản gốc dùng Wangkanai phía server | `useEffect` đọc `navigator.userAgent`, mặc định Android rồi sửa sau khi mount |

## 6. Kiểm thử (Playwright)

Không có test trong repo; đã dùng script tạm (26 test PC/mobile + tablet + khoảng trống dưới footer). Khi làm repo mới, tối thiểu kiểm:

1. **Mock API** bằng `page.route` (API dev hub có thể 502): `**/api/frontend/config*`, `posts?…`, `posts/:id`, `**/api/Ranking/**`.
2. **SSR**: `fetch("/")` không chứa markup chrome của cả hai bản.
3. **Mobile (320/390/430)**: đủ khối, không tràn ngang (`scrollWidth ≤ innerWidth`), PC CSS `disabled`, nền hero áp dụng, link nút từ config, menu offcanvas, modal trailer, carousel (chỉ báo + tự chuyển ~5s), swiper 5 slide gốc, tab tin tức đúng danh mục, `/tin-tuc` 50 tin không có nút "+", chi tiết có "Tin khác" (loại bài hiện tại), BXH có 3 huy chương.
4. **PC 1440**: còn `floatbar`, `btn-xephang`, `#layout` có `scale(`, CSS PC bật, không có markup mobile. Lưu ý **selector chung** (`.carousel`, `.allbutton`) có ở cả hai bản — dùng selector chỉ có ở một bên (`.download.fixed-top`, `.btnlist`, `.floatbar`).
5. **Tablet**: 768, 820, 1024, 1180 ngang, UA iPad rộng 600, UA Android tablet 700 → PC; 767 và 390 → mobile.
6. **Khoảng trống**: mọi trang × nhiều cỡ (1280…2560) → đáy footer = max(chiều cao cửa sổ, chiều cao trang), không tràn ngang.
7. **So ảnh** với HTML tĩnh gốc `wwwroot/mobile/index-cg-mb*.html` và `wwwroot/pc/index-*.html` (footer trong file tĩnh là bản cũ, không phải SDK nên không so được phần footer).

## 7. Việc còn mở

- Bản `-web` chưa có `Dockerfile`/`Jenkinsfile`/`deploy/*/deploy.yaml` (bản .NET có); cần dựng lại cho pipeline Next nếu triển khai.
- Carousel hero mobile đổi ảnh tức thì, offcanvas không có animation trượt (bản gốc có).
- Cả 6 bản `-web` của rollout cũng chưa có `Dockerfile`/`Jenkinsfile`/`deploy.yaml`.
- `ta-la-hac-ngokhong`: `appsettings.json` ghi GameId 1052, `deploy/develop/deploy.yaml` ghi 1044 (production: 43). Đã chọn 1044 theo user; đổi khi deploy production.
- Logo 18+ của `quy-mon-quan` vẫn trỏ `/landing` (404 vì trang này ngoài phạm vi); `thoi-khong-chi-mong` đã đổi về `/`.
- `thao-tung-tamquoc`: `.env.local` đang trỏ API giả `/api/mock` (`src/app/api/mock/[...path]/route.ts`); bản thật ở `.env.local.real`, mẫu ở `.env.mock.example`.
- Repo `giang-ho-ky-ngo`: 7 tổ hợp lệch pixel 0.17–0.47% (320/390/768 trên home + Landing, và Landing ở 1280), chưa soi hết.

## 8. Bài học từ rollout 6 repo (2026-09-30)

Kết quả Generate Clone (wizard, `detect` + `clone` đều 200, `framework: nextjs`, có `src/services/index.ts` và `.env.local`, `dynamicBlocks` = 2 ở mọi game):

| Game | Thư mục `-web` | avgConfidence | Ghi chú |
|---|---|---|---|
| giang-ho-ky-ngo | `t030-giang-ho-ky-ngo-website-web` | 0.73 | 1 cây responsive |
| quy-mon-quan | `homepage-va-conhan-web` | 0.77 | 1 cây responsive, bỏ Conhan |
| samkok-tamquoc | `t028-samkok-tam-qu-c-home-and-landing-web` | 0.95 | 1 cây responsive |
| ta-la-hac-ngokhong | `t031-home-page-web` | 0.87 | 1 cây responsive |
| thao-tung-tamquoc | `r005-fullweb-web` | 0.66 | có mobile riêng, bỏ Conhan |
| thoi-khong-chi-mong | `t022-web-web` | 0.92 | 1 cây responsive, bỏ Conhan |

### 8.1 Nhận diện cấu trúc trước khi làm
- Tìm `showOnPc`/`showOnMobile` hoặc `@media (max-width:1024px)` trong CSS chính và kiểm tra có `Pages/Mobile/*` hay không. **Không có bản mobile riêng → bỏ `useResize`, `useMobileStylesheet`, `ScaleWrapper`**; trang SSR được, không cần cổng `ready`. Tablet khi đó theo breakpoint của CSS gốc (thường 1024px), không phải "PC thu nhỏ" của mục 2.
- Repo build bằng Vite (`wwwroot/<Page>/assets/*.css|js`, ví dụ quy-mon-quan, thoi-khong-chi-mong): copy assets vào `public/` **đúng đường dẫn cũ** vì CSS dùng `url(/Home/assets/…)` tuyệt đối; viết lại phần JS bằng React; đổi ảnh base64 nhúng trong `<img>` thành file PNG.
- Hai file CSS có class trùng (trang chính vs `/landing`): dùng route group `(site)` / `(landing)` với root layout riêng.
- Bản gốc có thể gọi API qua SDK (`sdk.js`) thay vì `CallApi`: đọc SDK lấy URL rồi viết `axios.get(...)` trực tiếp (mục 4). Nếu `appsettings` không có URL ranking thì tìm trong SDK.
- Bundle Vite không có source (`/landing` của thao-tung-tamquoc) và trang gift-code/đăng nhập/check-in (`/landing` của quy-mon-quan, thoi-khong-chi-mong) → coi như Conhan, không port; sửa link trỏ tới chúng.

### 8.2 Bẫy mới khi code
| Bẫy | Cách xử lý |
|---|---|
| `#layout{width:1920px}` đặt trong `globals.css` áp cả cây mobile (`overflow-x:hidden` che, `scrollWidth ≤ innerWidth` không bắt được) | Gán width inline trong `ScaleWrapper` (chỉ PC); test thêm bằng bounding rect |
| Hook mobile chỉ tắt `9main.css` | Tắt cả `swiper.css` của PC; mobile nạp `swiper.css` riêng + swiper@8 CDN |
| Footer có margin inline (120px ở thao-tung) làm sai phép tính `shortfall` | Thêm `data-base-margin` cho `ScaleWrapper` |
| Nhiều component cùng gọi config | Promise cấp module trong `useSiteConfig` để dùng chung 1 request |
| Vplay SDK chỉ quét DOM một lần | Nạp lại script khi footer mount (`useSdkFooter`), nếu không footer mất sau điều hướng client |
| Razor URL không phân biệt hoa/thường (`/News`, `/Ranking`) | `middleware.ts` chuyển về chữ thường (hoặc giữ đúng route gốc như giang-ho-ky-ngo) |
| `html, body { height:100%; overflow-x:hidden }` trong CSS gốc làm `<body>` là container cuộn | `window.scrollTo/scrollY` vô hiệu → cuộn `document.body`; chụp fullPage phải resize viewport theo `body.scrollHeight` |
| Bản gốc chỉ nạp `swiper-bundle.js` (không CSS), chỉ đăng ký vài module (không Autoplay) | Không import CSS swiper; chỉ dùng đúng module bản gốc; `creativeEffect.current` không có trong types → bỏ |
| jQuery Owl Carousel 1.x | Component React phát ra đúng DOM để CSS gốc áp; Owl làm tròn bề rộng item theo px và wrapper rộng gấp đôi → dùng px để không lệch sub-pixel; swiper loop nhân bản node → remount bằng `key` khi đổi slide |
| `href="javascript:void(0)"` | `href="#"` + `preventDefault` |
| `next/core-web-vitals` báo `no-css-tags`, `no-img-element` | Tắt hai rule này cho bản port legacy |
| Trang dùng `?id=` (samkok) | Đọc `window.location.search` trong effect, tránh phải bọc `Suspense` cho `useSearchParams` |
| Trang chi tiết: bản gốc không bind `category_id` nên không có "Tin khác" | Bản Next có hiện; ghi nhận là khác biệt có chủ đích |

### 8.3 Chạy bản .NET gốc làm chuẩn so pixel
`dotnet` có sẵn trên máy. Copy repo gốc vào scratchpad, `dotnet build -c Release`, rồi `dotnet run --no-build --no-launch-profile` với `ASPNETCORE_ENVIRONMENT=Development` và `SiteSettings__HubUrl`/`SiteSettings__ServiceUrl` trỏ tới mock API cục bộ; cho bản Next cùng mock qua `NEXT_PUBLIC_*`.
- **Không dùng Production:** Kestrel trả file tĩnh rỗng (`.js` MIME rỗng, CSS `Content-Length: 0`) khi client gửi `Accept-Encoding`. Nếu buộc phải dùng, route origin và fetch với `accept-encoding: identity`.
- Nếu test chặn CDN: stub `window.particlesJS=function(){}` (JS gốc dừng nếu thiếu) và đóng băng animation bằng `*{animation:none!important}`.
- Đóng băng animation trước khi chụp; footer SDK bị chặn/khác nên không so được.

### 8.4 Mẹo Playwright và quy trình
- Nút có animation CSS vô hạn (`.btn-play.animate`): `click({ force: true })`.
- `text-transform` làm `innerText` khác `textContent`: so sánh `textContent` hoặc không phân biệt hoa/thường.
- `route.continue({ url })` không đổi được host: dùng `route.fetch` rồi `fulfill`.
- Dev mode hydrate chậm: chờ selector, không dùng timeout cố định.
- Chạy nhiều agent song song: mỗi agent một thư mục scratchpad riêng, một cổng riêng; không cho agent sửa `config.ts` hay playbook (người điều phối sửa sau cùng).
- Ghi file mã lớn (JSX, có dấu nháy đơn) bằng công cụ Write, không dùng heredoc.

### 8.5 Dữ liệu giả để duyệt giao diện
Khi API dev hub 502 hoặc trống, thêm route handler mock trong chính app (`src/app/api/mock/[...path]/route.ts`) và trỏ `NEXT_PUBLIC_HUB=/api/mock/hub`, `NEXT_PUBLIC_RANKING_API=/api/mock/rank` trong `.env.local` (giữ bản thật ở `.env.local.real`).
- **Hero carousel chỉ lấy slide `title === "slide_top"`**; dùng ảnh đúng kích thước hub thật (thao-tung: 461×447, cùng `slider.jpg` mẫu) nếu không chiều cao slider sai vì ảnh `w-100`.
- Cần đủ danh mục × ≥ 8 bài/danh mục (list tin lấy tới 100) và 100 dòng ranking (3 huy chương đầu).

Bảng kết quả detect từng game và checklist nhận diện cho game .NET mới: xem `07-DETECT-OUTPUT-mvc-to-nextjs.md` (+ `.json`).

> **Cập nhật 2026-09-30:** game `thao-tung-tamquoc` (R005) đã bị **loại khỏi tool** (game lỗi thời) — các dòng/mục nhắc tới game này trong tài liệu chỉ còn giá trị lịch sử. Thư mục trên ổ đĩa vẫn còn, chưa xóa.

> **2026-09-30:** URL ranking của 6 bản `-web` đã theo chuẩn `phuong-hoang-tru-tien` (base có `/api` + `/Ranking/GetRanking`); mọi clone chỉ dùng Next.js hoặc React, không còn MVC trong tool/CI-CD.

## 9. Bẫy của bộ vá "tin tức giả" khi clone (2026-09-30)

`src/detector/fake-news.ts` vá các nhánh `catch` của `services/index.ts` trong **bản clone** để có dữ liệu giả khi API hub lỗi. Hai lỗi đã gặp và đã sửa:
- **Tên biến viết cứng:** vá `category_id === category_id`, nhưng các bản `-web` đặt tham số là `categoryId` → `next build` lỗi `Cannot find name 'category_id'`. Nay tên tham số danh mục/limit/khóa chi tiết (`slug` hoặc `id`, kể cả `encodeURIComponent(slug)`) được đọc từ chữ ký của hàm chứa lời gọi.
- **Regex nhảy sang hàm khác:** `[\s\S]*?catch` vượt qua ranh giới hàm khi hàm của nó có `return []` thay vì `return null`, làm vá nhầm (vd gán `fakeSlides()` cho `getPostBySlug`). Nay mỗi lần vá bị giới hạn trong một khai báo `export` (`(?:(?!\nexport )[\s\S])*?`), và slides chấp nhận cả `null` lẫn `[]`.
- Dữ liệu giả được trả qua các hàm generic (`fakePostsByCategory<T>()`, `fakeCategories<T>()`, `fakeSlides<T>()`, `getFakePostBySlug<T>()`), kiểu `T` suy ra từ kiểu trả về của hàm nên không lệch với `NewsPost`/`Slide` riêng của từng game.

Kiểm chứng: tạo lại clone cho 11 game, `tsc` sạch cả 11; `next build` thật chạy thành công với `ta-la-hac-ngokhong`. Khi thêm game mới, nên chạy `tsc` (và nếu có thể `next build`) trên **bản clone**, không chỉ trên template.
