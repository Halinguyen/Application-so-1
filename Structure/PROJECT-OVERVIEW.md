# PROJECT-OVERVIEW — công cụ "clone tool" (asset-detector-web)

Tài liệu cho agent ở session sau: đọc file này thay vì đọc lại toàn bộ code. Đi từ tổng quan đến chi tiết.
Viết ngày 2026-11-06 trên commit `b4ace81` (nhánh `feat/real-api-clone-mode`). Mọi điều ghi ở đây đã đối chiếu code/dữ liệu tại thời điểm đó;
chỗ chưa xác minh được đánh dấu **[chưa xác minh]**.

Quy ước đường dẫn: `APP` = `D:\Application-so-1\Structure\asset-detector-web`, `STRUCT` = `D:\Application-so-1\Structure` (từ 2026-11-06 thư mục bao ngoài `Application số 1` đã bỏ: `Structure` nằm ngay gốc repo).
Repo git nằm ở `D:\Application-so-1` (không phải trong `asset-detector-web`; thư mục `asset-detector-web/.git.bak/` là bản lưu của repo lồng cũ, bị gitignore).

---

## 1. Tổng quan

### 1.1 Mục đích và người dùng

- Công cụ nội bộ cho **operator** (người vận hành, không cần biết code) của team game web: chọn một game có sẵn làm template, thay ảnh/video/chữ/cấu hình,
  xem trước, chỉnh bố cục ngay trên preview, rồi đẩy bản clone lên GitHub để deploy ra domain dev.
- Cũng là công cụ của **engineer**: trang QA `/admin` (tiếng Anh/kỹ thuật) để kiểm tra chất lượng detect.
- Công cụ là **detector + asset-swapper** trên các repo template viết tay, **không phải code generator**: không sinh lại component; chỉnh bố cục chỉ bằng
  **một file CSS override**. Mã nguồn template không bị sửa (chỉ bản clone).
- Phạm vi: chỉ dev (không production), mỗi clone là Next.js hoặc React (Vite); MVC/.NET không còn trong luồng (các repo .NET đã chuyển sang Next.js, xem mục 6).

### 1.2 Luồng wizard (`src/app/components/wizard/WizardShell.tsx`, `STEPS`)

| Bước | Tên | Việc chính | API dùng |
|---|---|---|---|
| 1 | Chọn game (`GamePicker`, trang `/`) | Danh sách game từ `GAME_REPO_MAP`; game không phải Next/Vite chỉ xem detect, không clone được (`isCloneReady` ở `src/app/page.tsx`) | (server component) |
| 2 | Nội dung & hình ảnh | Danh sách slot ảnh/video/chữ (`buildCloneSlots`), tải file thay, dán link, đánh dấu "không dùng", gợi ý ảnh từ Figma (`FigmaSuggestions`, tắt cho game trong `FIGMA_HIDDEN_GAMES`) | `/api/figma/*`, `/api/asset-image` |
| 3 | Cấu hình | Chỉ **GameId** (một ô) + **Tên dự án** `[mã]-[tên]` (regex `^[a-z][0-9]{3}-[a-z0-9]+(-[a-z0-9]+)*$`); các param khác lấy từ template (`ConfigStep`) | — |
| 4 | Xem trước & Hoàn tất | "Generate clone" (`/api/clone`) → chạy preview (`/api/clone/preview`) → iframe; bật "chỉnh layout" mở `EditorPanel` toàn màn hình; "Tạo repo trên GitHub" (`/api/repo`) | `/api/clone`, `/api/clone/preview`, `/api/layout`, `/api/asset`, `/api/repo` |

- Trạng thái wizard (bước hiện tại, chữ, giá trị cấu hình, link, id loại trừ/blank, projectName) **chỉ lưu `localStorage` sau khi operator bấm "Lưu tiến độ" và xác nhận** (từ 2026-11-06; khoá `wizard-save-consent:v1:<gameId>` + `wizard-state:v3:<gameId>`). Không xác nhận thì mỗi lần mở bắt đầu từ mặc định của template và bản lưu cũ bị xóa; "Xóa bản lưu" tắt lại. **File object không lưu được** nên ảnh vừa chọn mất khi F5. Dữ liệu phía server (`home-page-uploads`, `home-page-layout`) là chuyện khác: vẫn áp dụng vào mỗi lần clone, xóa bằng "Reset toàn trang" của editor hoặc xóa thư mục.
- Ảnh đã tải lên được **lưu bền** ở `<TEMPLATE_ROOT>/<game>/home-page-uploads/` và đắp lại sau mỗi lần clone (xem 4.6).
- Hướng đang cân nhắc (chưa làm, plan 14 mục 16): chuyển danh sách bước 2 thành một tab trong bước 4 (không xóa được vì chỉ ~40-62% slot ảnh chọn được trong preview).

### 1.3 Sơ đồ kiến trúc

```
 Operator (trình duyệt)
   |  http://localhost:3000  (Next 16 app router, "asset-detector-web")
   v
 +--------------------------- asset-detector-web ----------------------------+
 | src/app (UI wizard + API routes)                                          |
 |    |                                                                      |
 |    v                                                                      |
 | src/detector/*  <--- paths.ts (APP_DATA_DIR / TEMPLATE_ROOT / ...)        |
 |   config.ts: GAME_REPO_MAP, tên hiển thị -> resolveGame(gameId)           |
 |   template-source.ts: ensureTemplate (git @ commit ghim | snapshot)       |
 |   run.ts: runDetection  -> layer1 + layer2-* + layer4-*  -> DetectionResult|
 |   clone-slots.ts: DetectionResult -> slot cho wizard                      |
 |   /api/clone: copyRepoSkeleton -> áp upload -> patch chữ/env -> VE        |
 |   visual-editing.ts + edit-id.ts + layout-*.ts + ve-adapter-*             |
 +------------+--------------------------------------+-----------------------+
              |                                      |
   dữ liệu làm việc (ngoài git)             public/ve/{mapper,protocol,inspector}.js
   TEMPLATE_ROOT/<game>/                     (copy vào clone khi bật editor)
     <repoDir>/            template (git)              |
     home-page-clone/      bản clone (xóa-dựng lại)    v
     home-page-uploads/    ảnh operator thay      +-----------------+   postMessage
     home-page-layout/     layout.json, manifest  | clone (npm run  |<-------------> EditorPanel
   clone-schemas/, template-store/                | dev, cổng ngẫu  |   (iframe)     (toàn màn hình)
              |                                   | nhiên)          |
              v                                   +-----------------+
   /api/repo -> GitHub (org tool-hompage-auto, repo private, push thường)
   /api/figma/* -> Figma REST (FIGMA_TOKEN) / ZIP từ plugin figma-exporter
   Deploy tool: Dockerfile + Jenkinsfile + deploy/develop/deploy.yaml (K8s dev, PVC /data)
```

---

## 2. Cấu trúc thư mục

Repo git: `D:\Application-so-1` (có `CLAUDE.md`, `README.md`, `.claude/` ở gốc). Cột "git" = có được commit hay không.

```
D:\Application-so-1\
  CLAUDE.md                       git   bắt đọc PROJECT-OVERVIEW.md + quy tắc cập nhật tài liệu
  .claude\settings.json           git   khai báo hook PreToolUse(Bash)
  .claude\hooks\check-overview-doc.mjs  git  chặn `git commit` nếu đổi mã công cụ mà chưa sửa PROJECT-OVERVIEW.md ([skip-docs] để bỏ qua)
  .gitignore                      git   (xem dưới)
  Structure\
    PROJECT-OVERVIEW.md           git   (file này)
    06-PLAYBOOK-mvc-to-nextjs.md        playbook chuyển .NET MVC -> Next.js (bản sao ở APP/docs/mvc-to-nextjs-playbook.md)
    08-PLAN-cicd-clone-website.md, 08a-APPENDIX-config-truth.md, 08b-APPENDIX-two-api-params.md
                                        kế hoạch CI/CD + phụ lục env/2 API (hub, ranking); 08 ghi "bản nháp, chờ xác nhận mục 8"
    11-TEMPLATE-FREEZE.md               thiết kế đóng băng template + schema detect
    13-PLAN-ai-asset-generation.md      kế hoạch AI sinh asset (CHỜ user trả lời; chưa có code; bản sao APP/docs/plans/ai-asset-generation.md)
    14-PLAN-visual-editing.md           nguồn chuẩn của visual editing (bản sao APP/docs/visual-editing.md)
    openapi.yaml                        "H5 Game SDK - Interactive Service" v1.4.5 (tham chiếu)
    phuong-hoang-tru-tien.mapping.json  kết quả mapping Figma <-> slot xuất ra (ví dụ)
    Home-Mobile.png, Trang chủ.png, hompage-clone.png   ảnh chụp tham chiếu, đang untracked
    figma-exporter\                git   plugin Figma xuất ZIP (code.js, ui.html, manifest.json, README.md)
    asset-detector-poc\            git   CLI POC cũ (src/, tests/); `node_modules` bị ignore; tool web đã port từ đây
    clone-schemas\                 git   schema detect đã chốt (hiện chỉ phuong-hoang-tru-tien.json, status frozen)
    template-store\                git (manifest.json) / ignore (template.tgz)   snapshot đóng băng phuong v1, v2
    template-materialized\         IGNORE  snapshot giải nén theo yêu cầu (cache, tái tạo được)
    game-template-repo\            IGNORE  mã nguồn template + clone + uploads + layout (16 thư mục game, xem mục 6)
    asset-detector-web\            công cụ chính (xem dưới)
```

`.gitignore` gốc (`D:\Application-so-1\.gitignore`) bỏ: `Structure/game-template-repo/`, `Structure/template-materialized/`, `Structure/template-store/**/template.tgz`,
`node_modules/`, `.next/`, `dist/`, `.cache/`, `*.tsbuildinfo`, `next-env.d.ts`, `*.log`, `.env`, `.env.*` (trừ `.env.example`, `.env.local.example`), `.git.bak/`, `.vscode/`, `.idea/`.

```
asset-detector-web\
  package.json, package-lock.json, tsconfig.json, eslint.config.mjs, next.config.ts, vitest.config.ts
  next.config.ts       serverExternalPackages ["playwright-core"]; allowedDevOrigins từ ALLOWED_DEV_ORIGINS (mặc định ["10.58.59.156"])
  Dockerfile, Jenkinsfile, .dockerignore, deploy\develop\{deploy.yaml,.env.example}
  .env.example         git      hợp đồng biến môi trường (mục 4.9)
  .env.local           IGNORE   giá trị thật của máy dev (có GITHUB_TOKEN, FIGMA_TOKEN...). KHÔNG đọc/ghi giá trị vào tài liệu
  AGENTS.md, CLAUDE.md git      CLAUDE.md chỉ `@AGENTS.md`; AGENTS.md: "đây không phải Next.js bạn biết", đọc node_modules/next/dist/docs/ trước khi viết code
  README.md            git      hướng dẫn chạy, env, deploy (tiếng Việt)
  docs\                git      visual-editing.md (bản sao plan 14), mvc-to-nextjs-playbook.md, plans\ai-asset-generation.md
  template-registry\   git      <game>.json: git url + commit ghim + framework (11 file)
  public\game-icons\   git      <gameId>.png avatar game (10 file; tamquoc-daiminhtinh không có -> monogram)
  public\ve\           git      inspector.js, mapper.js, protocol.js (chạy trong preview)
  scripts\             git      generate-registry.mjs, ve-e2e.mjs, ve-poc-clone.mjs
  src\app\             git      UI + API routes
  src\detector\        git      toàn bộ logic; figma-snapshots\ (2 json của phuong-hoang-tru-tien)
  .next\, node_modules\, tsconfig.tsbuildinfo, next-env.d.ts, dev.log   IGNORE
  .figma-cache\        IGNORE   ảnh PNG node Figma đã render, theo fileKey (cache)
  .figma-review\       IGNORE   verdict operator theo game (<game>.json)
  .cache\              IGNORE   (khai báo trong .gitignore, hiện không dùng)
  data\                IGNORE   (không tồn tại trên máy này) nơi mặc định của dữ liệu khi không có thư mục anh em; xem 4.1
```

Dữ liệu làm việc trong `game-template-repo\<game>\` (local-only, bị ignore) — mỗi game có:

| Thư mục | Nội dung |
|---|---|
| `<repoDir>` (vd `home-page`, `t018-than-ma-website`, `*-web`) | template; là repo git riêng (origin `source.vtvlive.vn`), trừ 6 bản `-web` chưa có remote |
| `home-page-clone` | bản clone, **bị xóa và dựng lại** mỗi lần Generate clone (`getCloneDir` = cạnh `<repoDir>`) |
| `home-page-uploads` | ảnh operator đã thay, theo cấu trúc tương đối của clone (`upload-store.ts`) |
| `home-page-uploads-manifest.json` | (cạnh repoDir) danh sách asset ngoài/CDN đã tải về `public/` để viết lại URL |
| `home-page-layout` | `layout.json` (nguồn chuẩn), `manifest.json`, `slots.json`, `routes.json`, `history/` (tối đa 20 bản) |
| `home-page-uploads.figma-hidden-20261105` | (chỉ phuong-hoang-tru-tien) thư mục uploads cũ đổi tên để ẩn ảnh Figma, xem mục 8 |

Thư mục lạ trong `game-template-repo`: `quy-mon-quan/_code-backup`, `_removed-duplicates-bak`; `t037-home-landing/` cấp ngoài (bản Vite rời, là repo git, không trong tool).

---

## 3. Module trong `asset-detector-web`

Test: `npm test` = `vitest run`, include `src/**/*.test.ts`, timeout 60s. Đo ngày 2026-11-06: **14 file, 165 test, đều đạt** (~15s).
Phần lớn module KHÔNG có test riêng (ghi "—"); e2e của editor nằm ở `scripts/ve-e2e.mjs` (cần tool chạy).

### 3.1 `src/detector/` — pipeline detect

Chạy bởi `run.ts` (`runDetection` -> `detectRepo`): `detectFramework` -> `layer1Scan` -> `layer2Scan{Vite|Nextjs|DotNet}` -> `layer2ScanApiBlocks` + `layer2ScanSwiper` + `layer2ScanHeroVideo`
-> `mergeDetected` -> `layer4GroupResponsive` -> `layer4EnrichAssets` -> `DetectionResult`. Nếu game đang chạy từ **snapshot** (frozen) thì trả thẳng detection trong schema (không quét, trừ `force`).

| File | Vai trò | Export chính | Test |
|---|---|---|---|
| `types.ts` | Kiểu dùng chung | `Framework` (`nextjs`/`dotnet-mvc`/`vite-spa`), `RawAsset`, `AssetReference`, `DetectedAsset`, `DynamicBlock*`, `DetectionResult` | — |
| `framework-detector.ts` | Nhận diện framework/router/styling từ package.json | `detectFramework` | — |
| `layer1-filesystem.ts` | Quét file ảnh/video/font; loại phạm vi ngoài (Conhan, `Jobs/`... qua `OUT_OF_SCOPE_PATTERNS`) | `layer1Scan` | — |
| `layer2-vite.ts` / `layer2-nextjs.ts` / `layer2-dotnet.ts` | Tìm chỗ code dùng asset (AST `@babel/parser`) theo từng framework; .NET chỉ còn để detect | `layer2ScanVite`, `layer2ScanNextjs`, `layer2ScanDotNet` | — |
| `layer2-api-blocks.ts` | Khối gọi API (hub config, ranking, nút) và key env GameId | `layer2ScanApiBlocks`, `extractApiCalls`, `resolveGameIdEnvKey`, `detectButtonParams` | — |
| `layer2-swiper.ts` | Nhận diện Swiper/slider, nguồn slide, nav | `layer2ScanSwiper`, `detectLibrary`, `attr*` | — |
| `layer2-hero-video.ts` | Khối video hero (cho phép thay video qua CDN slot) | `layer2ScanHeroVideo` | — |
| `layer4-merge.ts` | Ghép file + tham chiếu thành asset, tính confidence, gán section, loại footer/favicon | `mergeDetected`, `matchesAsset`, `detectSection`, `isFavicon`, `buildAssetId` | — |
| `layer4-responsive.ts` | Gom biến thể theo breakpoint (375/768/1920...) | `layer4GroupResponsive`, `buildResponsiveId` | `layer4-responsive.test.ts` |
| `layer4-constraints.ts` | Bổ sung kích thước/ràng buộc (sharp) | `layer4EnrichAssets` | — |
| `run.ts` | Điều phối pipeline | `runDetection`, `detectRepo` | — |
| `clone-slots.ts` | Biến detection thành slot hiển thị ở bước 2; loại section do API điền (banner, news, rank), nhãn trùng thêm tên thư mục | `buildCloneSlots` | — |
| `section-labels.ts` | Nhãn tiếng Việt cho section/vị trí/responsive | `describeSection`, `sectionOrder`, `needsVisualProof`, `describeResponsive` | — |
| `site-text.ts` | Chữ cứng trong JSX/index.html (tên game, title, mô tả) đọc và thay | `readTextSlots`, `applyTextSlot` | — |
| `base-env.ts` | Đọc `deploy/develop/.env.example` (fallback production) của template làm env nền | `readBaseEnv` | — |
| `resize-upload.ts` | Cắt/nén ảnh upload đúng kích thước file gốc (hoặc ảnh CDN tải về) | `resizeUploadToMatchTarget`, `resizeUploadToMatchRemote`, `CropAnchor` | — |
| `blank-image.ts` | Thay ảnh bằng ảnh trong suốt cùng kích thước ("bỏ ảnh") | `writeBlankImage` | `blank-image.test.ts` |
| `upload-store.ts` | Lưu bền upload, đọc buffer (file hoặc link), kiểm tra là ảnh | `getUploadsDir`, `persistUpload`, `removePersistedUpload`, `readUploadBuffer`, `isRasterOrSvg` | — |
| `share-link.ts` | Đổi link chia sẻ (Drive...) thành link tải trực tiếp | `toDirectUrl` | — |
| `ensure-deps.ts` | `npm install` cho template/clone khi thiếu node_modules | `ensureDependencies` | — |
| `preview-process.ts` | Giữ **một** tiến trình preview trong bộ nhớ; dừng tiến trình đang dùng thư mục | `getPreview`, `setPreview`, `stopPreview`, `stopProcessesUsingDir` | — |
| `github-publish.ts` | Liệt kê file được đẩy, giới hạn, quét secret, tạo repo org, push thường (không force) | `PROJECT_NAME_RE`, `listPublishable`, `checkLimits`, `scanSecrets`, `createOrgRepo`, `pushClone` | — |

### 3.2 `src/detector/` — nguồn template, schema, đóng băng

| File | Vai trò | Export chính | Test |
|---|---|---|---|
| `paths.ts` | Mọi thư mục dữ liệu, đổi được bằng env (mục 4.1) | `TEMPLATE_ROOT`, `STORE_DIR`, `MATERIALIZED_DIR`, `SCHEMA_DIR`, `REGISTRY_DIR` | — |
| `config.ts` | Danh sách game, tên hiển thị, icon, resolve template, URL API thật | `GAME_REPO_MAP`, `GAME_DISPLAY_NAMES`, `getGameDisplayName`, `getGameIconUrl`, `DEFAULT_GAME_ID`, `isFigmaHidden`, `resolveGame`, `REAL_HUB_URL`, `REAL_RANKING_HOST` | `config.figma.test.ts` |
| `template-source.ts` | Lấy template từ git theo commit ghim; token qua `TEMPLATE_GIT_TOKEN/USER`, che khỏi lỗi | `readRegistryEntry`, `listRegistry`, `fetchGitTemplate`, `ensureTemplate`, `requireTemplate`, `isSafeGitUrl`, `isCommitSha` | `template-source.test.ts` (12 test, ~12s, dùng git cục bộ) |
| `template-store.ts` | Snapshot bất biến (tgz + manifest), hash cây file, giải nén theo yêu cầu | `freezeTemplate`, `materializeTemplate`, `hashTree`, `listFiles`, `latestVersion`, `readManifest` | — |
| `clone-schema.ts` | Schema detect đã xác minh (draft/frozen), chữ ký detect để so | `CloneSchema`, `readCloneSchema`, `writeCloneSchema`, `listCloneSchemas`, `detectionSignature`, `diffSignatures`, `CURRENT_SCHEMA_VERSION` | — |
| `freeze.ts` | "Chốt" game: snapshot -> detect -> giải nén lại -> detect lại, khớp cả hai mới `frozen` | `freezeGame` | — |

### 3.3 `src/detector/` — Figma

| File | Vai trò | Export chính | Test |
|---|---|---|---|
| `figma-source.ts` | Nạp snapshot Figma của game; tạo đề xuất cho slot ảnh | `loadFigmaSnapshot`, `suggestFigmaMatches` | — |
| `figma-match.ts` | Thuật toán ghép node Figma <-> slot (kích thước, tên/chữ, vai trò) với `auto`/`review`/`none` | `matchSlots`, `Suggestion`, `MatchStatus` | `figma-match.test.ts` |
| `figma-context.ts` | Đọc ngữ cảnh JSX của slot (kích thước hiển thị, alt) để ghép | `readSlotContext`, `parseElementContext` | — |
| `figma-link.ts` | Đọc design theo link Figma (REST API, cần token) vào snapshot | `parseFigmaUrl`, `importFigmaLink`, `fetchFrames`, `FigmaLinkError` | `figma-link.test.ts` |
| `figma-import.ts` | Nhập ZIP do plugin `figma-exporter` xuất | `importFigmaExport`, `assetFileName` | `figma-import.test.ts` |
| `figma-render.ts` | Render node ra PNG, cache theo fileKey | `readCachedRender`, `renderMissing`, `FigmaRenderError` | `figma-render.test.ts` |
| `figma-frame.ts` | Đệm PNG cho đúng khung node | `padToNodeFrame` | `figma-frame.test.ts` |
| `figma-mapping.ts` | Bảng "Mapping Results": asset + node + confidence + verdict | `buildMappingResults` | `figma-mapping.test.ts` |
| `figma-snapshots/` | Dữ liệu: `phuong-hoang-tru-tien.json` + `.ground-truth.json` (cặp slot-node đã duyệt tay) | — | dùng trong `figma-match.test.ts` |

### 3.4 `src/detector/` — visual editing

Chi tiết kiến trúc ở mục 5.

| File | Vai trò | Export chính | Test |
|---|---|---|---|
| `visual-editing.ts` | Điều phối trên bản clone: gắn id, ghi manifest/routes/slots, biên CSS, cài adapter; chỉ chạy khi có layout đã lưu hoặc editor bật | `applyVisualEditing`, `rewriteCloneCss`, `templateHash` | — (qua e2e) |
| `edit-id.ts` | Gắn `data-edit-id` vào JSX bằng AST; ghi manifest; chế độ `scale` cho ảnh trong luồng; nhận ảnh từ API (`source: "api"`) | `injectEditIds`, `injectEditIdsInDir`, `slotFromAssetPath`, `fileStem`, `dataSlotFromExpression` | `layout-edit.test.ts` |
| `layout-schema.ts` | Kiểu + validate layout/manifest, giới hạn, phát hiện conflict | `LayoutFile`, `ElementOverride`, `EditManifest`, `LIMITS`, `validateLayout`, `isAllowedValue`, `isAllowedScale`, `checkLayoutConflicts`, `emptyLayout` | `layout-edit.test.ts`, `ve-mapper.test.ts` |
| `layout-compile.ts` | `layout.json` -> CSS override theo breakpoint | `compileLayoutCss`, `BREAKPOINT_MEDIA` | `layout-edit.test.ts`, `ve-mapper.test.ts` |
| `layout-patch.ts` | Cho phép key nào theo `mode` (`scale` chỉ cho scale/hidden) | `patchAllowedFor`, `isOverridePatch` | `layout-edit.test.ts`, `ve-mapper.test.ts` |
| `layout-store.ts` | Đọc/ghi layout, manifest, slots, routes, history (tối đa 20), merge/xóa override, dựng CSS | `readLayout`, `writeLayout`, `readManifest`, `readSlots`, `readRoutes`, `listHistory`, `restoreHistory`, `mergeOverride`, `removeElement`, `buildCss`, `getLayoutDir` | `layout-edit.test.ts` |
| `routes.ts` / `route-path.ts` | Dò các trang của site (react-router của Vite, Next app router) + file mỗi trang vẽ; khớp/điền tham số route | `discoverRoutes`, `importClosure`, `RouteInfo`, `matchRoute`, `fillRoute`, `routesOfFile`, `paramsOf` | `routes.test.ts` (14) |
| `ve-install.ts` | Vá `<head>` (CSS + script) idempotent; ghi `public/ve/` trong clone (CSS luôn, 4 file JS + `config.js` khi editor bật) | `patchHeadSource`, `writeVeFiles`, `InstallResult` | — |
| `ve-adapter-next.ts` | Chèn vào `app/layout.tsx` của clone | `installNextAdapter`, `patchLayoutSource` | — |
| `ve-adapter-vite.ts` | Chèn vào `index.html` của clone | `installViteAdapter` | — |
| `asset-match.ts` | Ghép ảnh đang hiển thị trong preview (`currentSrc`) với slot; danh sách file được phép ghi | `matchMediaToSlot`, `allowedTargetPaths`, `publicPathOf`, `EditSlot` | `asset-match.test.ts` |

Test `ve-mapper.test.ts` (63 test) còn kiểm `public/ve/mapper.js`, `public/ve/protocol.js` và giữ `LIMITS` của protocol.js bằng `layout-schema.ts`.

### 3.5 `src/app/api/*` (mọi route `runtime = "nodejs"`, `force-dynamic`)

| Route | Method | Việc |
|---|---|---|
| `/api/detect` | GET | Quét lại (không cache) và trả `DetectionResult` |
| `/api/clone` | POST (form: `gameId`, uploads, `blank:`, `external:`, text, env, `visualEdit=1`) | Xóa + dựng lại clone: `copyRepoSkeleton` (symlink `node_modules`), đắp upload bền, resize, thay URL CDN, `applyTextSlot`, ghi env vào `.env.local` **và** `.env.development.local` (hub -> `REAL_HUB_URL`, ranking -> `REAL_RANKING_HOST`), `applyVisualEditing`. Export `getCloneDir` |
| `/api/clone/preview` | POST | Chạy `npm run dev` của clone ở cổng ngẫu nhiên (`--strictPort --host` cho Vite; `--hostname 0.0.0.0` cho Next), env sạch, log ở `<clone>/.preview*.log`; mỗi lần chỉ một preview, đổi game thì dừng cái cũ |
| `/api/layout` | GET / PUT / DELETE | Layout + manifest + conflict + history + slots + routes; PUT một override hoặc `restore`; ghi lại CSS vào clone đang chạy (`cssWritten`); từ chối editId lạ và giá trị ngoài giới hạn |
| `/api/asset` | GET / POST / DELETE | Thay/khôi phục ảnh trực tiếp từ preview; chỉ ghi file thuộc slot đã nhận diện (`allowedTargetPaths`); ảnh CDN thì báo "thay ở bước 2" |
| `/api/asset-image` | GET | Phục vụ ảnh template/clone cho UI so sánh |
| `/api/figma/link` / `import` / `render` / `prefetch` / `review` / `mapping` | POST/GET | Đọc design theo link; nhập ZIP; render 1 node (chỉ node trong snapshot); render hàng loạt; lưu verdict (`.figma-review/<game>.json`); xuất mapping |
| `/api/repo` | POST (`gameId`, `projectName`) | Tạo repo **private** `projectName` trong org (mặc định `tool-hompage-auto`, đúng chính tả đó) và push `home-page-clone`; chặn nếu quét ra secret/vượt giới hạn |
| `/api/schema` | GET / POST | Trạng thái schema từng game (`?drift=1` so hash); POST chốt game (`freezeGame`) |
| `/api/templates` | GET | Template từng game có trên đĩa không, nguồn từ manifest nào |
| `/api/templates/sync` | POST `{gameId?}` | Tải template từ git theo commit ghim (một game hoặc tất cả) |
| `/api/health` | GET | Probe cho K8s (readiness/liveness) |

Trang: `/` (`src/app/page.tsx`: GamePicker hoặc WizardShell), `/admin` (QA dashboard detect, `Gallery` + `RescanButton` + `GameSwitcher`), `layout.tsx`, `loading.tsx`.

### 3.6 `src/app/components/`

| File | Vai trò |
|---|---|
| `wizard/WizardShell.tsx` | Trạng thái và 3 bước wizard, lưu localStorage chỉ sau khi xác nhận (`saveOn`, `confirmSave`), gọi clone/preview/repo |
| `wizard/GamePicker.tsx` | Thẻ game (`GameOption {gameId, displayName, iconUrl, cloneReady}`), monogram khi thiếu icon |
| `wizard/ConfigStep.tsx` | Form cấu hình bước 3 |
| `wizard/AssetCompareTile.tsx` | Ô so sánh ảnh gốc / ảnh thay |
| `wizard/FigmaSuggestions.tsx` | Gợi ý ảnh từ Figma (chấp nhận/bỏ qua, nhập link/ZIP); quyết định chỉ giữ trong phiên (không còn localStorage; server vẫn lưu qua `/api/figma/review`) |
| `wizard/PreviewPane.tsx` | Iframe preview + kết quả clone/preview (`CloneResult`, `PreviewResult`) |
| `wizard/EditorPanel.tsx` | Trình chỉnh layout toàn màn hình. **Từ 2026-11-06:** mọi trang không cần tham số (home, rank, tintuc…) dàn ngang, mỗi trang một iframe + inspector (`frames` map id→iframe; một lựa chọn tại một thời điểm, `activeId`); `PageSlot` chỉ render iframe khi gần vùng nhìn thấy và dỡ khi cuộn xa (8-9 trang cùng lúc làm sập trình duyệt); không còn "Thêm trang"/`×` (trang có tham số không dàn ra). Panel bên phải KHÔNG còn chữ hướng dẫn/ghi chú/danh sách phần tử/reset từng phần tử/khôi phục bản cũ: chỉ còn ô tỉ lệ, z-index, Ẩn và khối `MediaReplacer` (chọn file/link, Thay ảnh, Khôi phục gốc); nút **Reset toàn trang** nằm ở header (chỗ của "Thêm trang") |
| `wizard/HoverHint.tsx`, `wizard/types.ts` | Gợi ý hover; kiểu `CloneParam`, `CloneSlot`, `CloneExternalSlot` |
| `Gallery.tsx`, `GameSwitcher.tsx`, `RescanButton.tsx`, `Spinner.tsx` | Cho `/admin` và loading |

### 3.7 `public/ve/` (chạy trong trang clone, UMD, KHÔNG biên dịch)

| File | Vai trò |
|---|---|
| `protocol.js` | Giao thức `postMessage` (`channel: "visual-editing"`, `VERSION 1`); bảng lệnh editor->inspector (`INIT`, `SET_EDIT_MODE`, `SELECT`, `UPDATE_LAYOUT`, `RESET`, `RELOAD_CSS`, `RELOAD_MEDIA`, ...) và inspector->editor (`READY`, `STATE`, `SELECTED`, `LAYOUT_CHANGED`, `ERROR`, ...); `LIMITS`, `lengthOk`, `isOverride`, `validate`, `make` |
| `mapper.js` | Ma trận 2D tích lũy từ `transform` của tổ tiên, nghịch đảo, đổi delta pointer sang `%` trong khung chứa |
| `inspector.js` | Hover, chọn, kéo (tay cầm ✥), 8 tay cầm resize, kẹp trong khung chứa, cảnh báo chồng lấn, `RELOAD_MEDIA`; chỉ nhận message từ origin trong `config.js` |
| `config.js` | **Sinh khi clone** (`window.__VE_CONFIG__ = {editorOrigin}`), không có trong `public/ve` của tool |

### 3.8 `scripts/`

| File | Việc |
|---|---|
| `generate-registry.mjs` | Sinh `template-registry/<game>.json` từ repo template trên máy (đọc `GAME_REPO_MAP` bằng regex trên `config.ts`); `--check` exit 1 nếu manifest cũ; báo working copy khác commit |
| `detector/color-store.ts` (+test) + `app/api/colors/route.ts` | Đổi màu TRỰC TIẾP trong editor, CHỈ CHO VÙNG ĐƯỢC BẤM (2026-11-06; bản đầu thay mã hex trong toàn source làm lan sang menu mobile nên đã bỏ). `inspector.js` gửi `COLOR_PICKED` {prop nền/chữ/viền, hex, `selector`, và nếu phần tử là một mục lặp (tin, hàng xếp hạng do API sinh) thêm `similar` + `count`}; `selector` = `#id > tag:nth-child(n) …` của chính phần tử mang màu, `similar` = cùng đường dẫn nhưng bỏ chỉ số ở tầng mục lặp gần nhất (chạm mọi mục cùng loại, cả mục API tải sau). Panel: ô màu + `#rrggbb` + hộp "Mọi mục cùng loại (N)" (mặc định bật). `POST /api/colors {gameId, selector, prop, to}` lưu luật vào `home-page-colors.json` (mảng; file định dạng cũ bị bỏ qua) và `refreshOverridesCss` ghi lại `public/ve/layout-overrides.css` = CSS layout + `colorRulesCss` (`selector{color:#hex !important}`); `applyVisualEditing` cũng thêm CSS này nên clone thường vẫn giữ màu. Selector chỉ nhận ký tự `A-Za-z0-9_-:#.>()+~ ` (≤600) để không thoát khỏi luật. `DELETE /api/colors` (nút Reset toàn trang) xoá hết. Test: `ve-color-smoke.mjs`, `ve-selector-smoke.mjs`. Đã BỎ `color-scan.ts` (quét/thay hex toàn source) |
| `detector/external-replace.ts` (+test) | Thay ảnh/video trên CDN: `replaceExternalAsset` (ghi vào `public/`, vá địa chỉ trong `refFiles` của CLONE, lưu manifest) dùng chung cho `/api/clone` (khoá `external:`) và `/api/asset` (field `external` = địa chỉ của slot ngoài; chỉ địa chỉ có trong `layout/external-slots.json` mới được thay). Editor: `MediaReplacer` hiện form tải lên/dán link cho ảnh và video CDN, rồi tải lại các trang (`reloadKey`) |
| `detector/site-text.ts` — màu chữ | Ô chữ nhìn thấy được trên trang (hiện chỉ `header-site-name`, H1 cạnh logo; `title`/`description` là thẻ meta nên không có màu) có `colorable: true`. Wizard bước 2 (mục "Nội dung chữ") hiện ô "Màu chữ" (chọn màu + nhập `#rrggbb`); khi clone gửi `textcolor:<id>` = hex và `/api/clone` gọi `applyTextColor`/`setTagColor`: thêm `style={{ color }}` vào thẻ mở của phần tử chứa chữ trong CLONE (thắng class Tailwind; không đoán khi thẻ có `style` không phải object hoặc có arrow function). Trả `textColorsApplied` |
| `detector/flow-image.ts` (+test) | Nhận ảnh mà trang tự co theo tỉ lệ ảnh (`<img class="w-full">`, không có `h-*`/absolute/object-cover): `keepRatioSlotIds` đọc JSX quanh từng reference. `page.tsx` gắn `CloneSlot.keepRatio`, `visual-editing.ts` ghi vào `slots.json`; ô như vậy mặc định dùng `CropAnchor` `original` (file giữ đúng tỉ lệ ảnh upload, thu vào trong khung của file gốc, không cắt, không nền). Hiện chỉ "Banner trang chủ" (ảnh mobile) của phuong-hoang-tru-tien được bật |
| `detector/template-seed.ts` (+test) | Template cho máy không có `git` (Vercel): nếu có `TEMPLATE_SEED_BASE_URL`, `doEnsure` (trong `template-source.ts`, chạy TRƯỚC nhánh snapshot/git) tải `<base>/<gameId>.tgz` (Bearer `TEMPLATE_SEED_TOKEN`, chỉ https hoặc localhost), giải nén bằng `tar` vào `TEMPLATE_ROOT/<gameId>/<repoDir>` (qua thư mục tạm, hiện nguyên vẹn hoặc không). File tạo bằng `scripts/pack-templates.mjs --per-game` (9–187 MB mỗi game; cả 11 game ≈700 MB nên không đóng chung cho Vercel). `paths.ts`: trên Vercel (`VERCEL`) dữ liệu mặc định ở `os.tmpdir()/asset-detector`. `/api/clone` và `/api/clone/preview` trả 501 kèm giải thích khi `VERCEL` |
| `detector/preview-port.ts` (+test) | `PREVIEW_PORT_RANGE=6000-6050` giới hạn cổng của server xem trước (để Docker mở sẵn dải cổng); không đặt thì cổng ngẫu nhiên như cũ |
| `detector/slot-merge.ts` (+test) | Gọi từ `buildCloneSlots` (`clone-slots.ts`): gộp thành MỘT slot (`targetPaths` = hợp, `merged: {count, kind}`) (1) họ icon: favicon-16/32, apple-touch-icon, android-chrome-*, favicon.ico tự quản + mọi ảnh trùng hash với chúng (icon game dùng trong trang); (2) các ảnh trùng hash khác. Ảnh chỉ trùng tên nhưng khác hash KHÔNG gộp. Một lần upload -> `/api/clone` cắt đúng cỡ từng file. Trên than-ma-ao-hoa gộp 15 nhóm, phuong-hoang có slot "Icon game" |
| `detector/upload-store.ts` `sniffVideoExt` | nhận mp4/webm theo magic number; nhánh `external:` của `/api/clone` giờ nhận VIDEO (ghi nguyên byte, đổi đuôi theo file, vá `type="video/.."` của `<source>`); trước đó file không phải ảnh bị từ chối nên preview vẫn dùng video CDN của template |
| `detector/resize-upload.ts` | `CropAnchor` có thêm `crop` (luôn cắt vùng nổi bật) và `fit` (giữ trọn ảnh); mặc định `attention` TỰ CHỌN: tỉ lệ ảnh upload lệch tỉ lệ file đích quá `FIT_RATIO` (1.8 lần, vd banner ngang 1920×950 cho banner mobile 1080×1920) thì `keepWholePicture` đặt cả ảnh lên khung đúng cỡ đích với nền là bản mờ của chính ảnh (ảnh thật sự có điểm trong suốt và đích không phải JPG thì đệm trong suốt), không còn cắt một lát giữa làm mất nhân vật. Editor có ô chọn "Tự động / Giữ trọn ảnh / Luôn cắt"; wizard bước 2 chỉ dùng tự động. Thêm `buildIco()`: upload -> favicon.ico thật (PNG 16/32/48 trong container ICO); trước đây ghi nguyên byte PNG vào file .ico |
| `detector/prune-routes.ts` (+test) | Gọi trong `/api/clone` ngay sau khi copy template: bỏ các trang có segment đầu khớp `EXCLUDED_ROUTE_SEGMENTS` (hiện `/^choigame + số tùy ý$/i`, quyết định 2026-11-06) khỏi CLONE: dòng `<Route>` + import + file page (react-router) hoặc thư mục `app/**/choigame*` (Next), cùng asset local chỉ các trang đó dùng. Template không bị sửa. Hiện chỉ phuong-hoang-tru-tien và tuyetdinh-chiengioi có trang này (asset của chúng toàn CDN nên 0 asset local bị xóa) |
| `ve-replace-smoke.mjs` | Thay ảnh của một TRANG CON ngay trong editor và kiểm tra preview đổi ngay, rồi "Khôi phục gốc" (đạt với /rank và /tintuc của phuong-hoang-tru-tien). Truyền `PAGE=rank` KHÔNG kèm dấu `/` (Git Bash đổi `/x` thành đường dẫn Windows) |
| `ve-color-smoke.mjs` | Đổi màu một vùng trong editor: vùng đổi, chỗ khác cùng màu giữ nguyên, 1 luật được nhớ, Reset xoá |
| `ve-selector-smoke.mjs` | Kiểm tra selector của inspector (một vùng / mọi mục lặp / không lan sang menu) trên DOM mẫu, không cần chạy tool |
| `ve-pages-smoke.mjs` | Smoke test giao diện đa trang hiện tại (Playwright): số trang, tải lười, chọn phần tử trên nhiều trang, panel chỉ còn Reset toàn trang. `node scripts/ve-pages-smoke.mjs <gameId>` (đã đạt cho phuong-hoang-tru-tien và than-ma-ao-hoa) |
| `ve-e2e.mjs` | **LEGACY** — viết cho editor cũ (một iframe, danh sách phần tử, ghi chú), KHÔNG còn chạy với giao diện mới; cần port từng kiểm tra (mục 5.5); `TOOL` mặc định `http://localhost:3100`, Chrome mặc định `C:/Program Files/Google/Chrome/Application/chrome.exe` |
| `ve-poc-clone.mjs` | PoC bước 1-2: gọi `/api/clone` với `visualEdit=1`, in kết quả gắn id (`tool` mặc định `http://localhost:3100`) |

---

## 4. Dữ liệu và cấu hình

### 4.1 `paths.ts` — nơi đặt dữ liệu

Quy tắc mỗi thư mục: env nếu có -> thư mục anh em cũ nếu tồn tại -> `$APP_DATA_DIR/<tên>` (mặc định `APP/data`). `process.cwd()` phải là `APP`.

| Hằng | Env | Anh em cũ | Dưới `data/` |
|---|---|---|---|
| `TEMPLATE_ROOT` | `TEMPLATE_ROOT` | `STRUCT/game-template-repo` | `templates` |
| `STORE_DIR` | `TEMPLATE_STORE_DIR` | `STRUCT/template-store` | `template-store` |
| `MATERIALIZED_DIR` | `TEMPLATE_CACHE_DIR` | `STRUCT/template-materialized` | `cache` |
| `SCHEMA_DIR` | `CLONE_SCHEMAS_DIR` | `STRUCT/clone-schemas` | `clone-schemas` |
| `REGISTRY_DIR` | `TEMPLATE_REGISTRY_DIR` | — | mặc định `APP/template-registry` |

Trên máy dev này cả 4 thư mục anh em đều tồn tại nên dùng chúng; trên K8s đặt về `/data/...` (mục 7).

### 4.2 `config.ts`

- `GAME_REPO_MAP` (11 game, gameId -> tên thư mục template trong `TEMPLATE_ROOT/<gameId>/`). Thêm game = thêm vào đây **và** `GAME_DISPLAY_NAMES` **và** `npm run registry:generate`.
- `GAME_DISPLAY_NAMES`: định dạng `"[MÃ] Tên có dấu"` (vd `[T030] Giang Hồ Kỳ Ngộ`); mã lấy từ `VITE_APP_GAME_NAME`/package.json/tiền tố thư mục. Tên của phuong-hoang-tru-tien và samkok-tamquoc được **suy ra từ slug**, sửa nếu user nói khác. Fallback: gameId title-case.
- `getGameIconUrl`: có file `public/game-icons/<gameId>.png` thì trả URL, không thì `null` (UI vẽ monogram).
- `DEFAULT_GAME_ID = "phuong-hoang-tru-tien"`: `resolveGame` rơi về game này khi id lạ (không throw, tránh 500 trang).
- `resolveGame` -> `{gameId, repoPath, source: "live"|"snapshot"}`: thư mục live nếu có (trừ khi `TEMPLATE_SOURCE=snapshot`), nếu không thì snapshot nếu schema `frozen`.
- `FIGMA_HIDDEN_GAMES = {"phuong-hoang-tru-tien"}` -> `isFigmaHidden`: **tạm thời** ẩn khối Figma ở bước 2 và server không tính đề xuất (xem mục 8).
- `REAL_HUB_URL = "https://vplay.vn/website-api"`, `REAL_RANKING_HOST = "game-services-api.vplay.vn"`: clone luôn gọi API thật (không dữ liệu giả; code fake-api/fake-news đã xóa 2026-11-05). Quyết định cấu hình: chỉ nhập GameId, ranking một loại (`GET {base}/api/Ranking/GetRanking?gameId&mode&scope`), mode/scope lấy từ template, chỉ dev.

### 4.3 Template registry (`APP/template-registry/<game>.json`, 11 file, có trong git)

Trường: `schemaVersion`, `gameId`, `repoDir`, `framework`, `source` (`{type:"git",url,commit,ref}` hoặc `null`), `notes[]`, `generatedAt`.

- `ensureTemplate` thứ tự: thư mục live có sẵn -> snapshot frozen -> `git` clone đúng commit ghim vào `TEMPLATE_ROOT/<game>/<repoDir>` (thư mục `.partial-<pid>` rồi `rename`) -> lỗi thì trả `no-source`/`failed` (không throw).
- `source: null` ở 6 game `-web` (đã chuyển từ .NET): chưa có remote git -> deploy sạch sẽ không lấy được template cho 6 game này (việc còn mở).
- Manifest ghim **commit**, nên thay đổi chưa commit trong working copy không đến được tool deploy (script cảnh báo; ví dụ than-ma-ao-hoa 3 file lệch). Chạy lại `npm run registry:generate` sau khi commit template.
- Commit đang ghim (8 ký tự đầu): phuong `9f870279`, tuyetdinh `277c5ce3`, tamquoc-daiminhtinh `f714e239`, tamquoc-quan-anh `a862f721`, than-ma-ao-hoa `e3a47700`.

### 4.4 Template store, snapshot, clone-schemas ("đóng băng", xem `STRUCT/11-TEMPLATE-FREEZE.md`)

- `template-store/<game>/v<N>/manifest.json` (git) + `template.tgz` (ignore): hiện chỉ `phuong-hoang-tru-tien` v1, v2 (v2: 143 file, ~9.5MB, đóng băng 2026-10-15). Manifest: `contentHash`, `archiveSha256`, `repoDir`, `sourceCommit`, `fileCount`, `totalBytes`.
- `clone-schemas/<game>.json` (git): `CloneSchema` = `schemaVersion`, `gameId`, `displayName`, `status` (`draft`|`frozen`), `templateRef` (version + hash), `framework`, `detection` (StoredDetection), `verification`. Hiện chỉ phuong-hoang-tru-tien (`frozen`).
- Dùng: nếu thư mục live mất mà schema `frozen`, tool giải nén snapshot vào `template-materialized/` (cache) và coi detection trong schema là kết quả. `GET /api/schema?game=<id>&drift=1` so hash live với snapshot.
- `tgz` bị ignore: máy khác clone repo sẽ chỉ có manifest, không có archive.

### 4.5 Figma

- `src/detector/figma-snapshots/<game>.json` (+ `.ground-truth.json`): dữ liệu node Figma đã chụp; **chỉ có phuong-hoang-tru-tien**. Game khác không có snapshot -> `suggestFigmaMatches` trả `[]` (nhập link/ZIP mới có dữ liệu).
- `.figma-cache/<fileKey>/<nodeId>.png` (ignore), `.figma-review/<game>.json` (ignore).
- Nguồn dữ liệu: REST API qua `FIGMA_TOKEN` (scope read `file_content:read`) hoặc ZIP của plugin `STRUCT/figma-exporter` (không tốn quota; gói Starter bị giới hạn nhỏ).
- Mapping Results xuất ví dụ: `STRUCT/phuong-hoang-tru-tien.mapping.json`.

### 4.6 Upload store và layout store

- Uploads: `<TEMPLATE_ROOT>/<game>/home-page-uploads/` — cấu trúc tương đối giống clone; áp lại sau mỗi lần xóa-dựng clone. Slot "blank" **không** lưu bền (wizard gửi lại mỗi lần build). Chỉ file ảnh/SVG được ghi đè (từ chối video/khác để khỏi hỏng file).
- Layout: `<TEMPLATE_ROOT>/<game>/home-page-layout/{layout.json, manifest.json, slots.json, routes.json, history/}`. `layout.json` = `{schemaVersion:1, gameId, templateRef:{contentHash}, elements:{<editId>:{overrides:{desktop|tablet|mobile:{...}}}}}`. Bền qua mọi lần xóa-dựng clone.
- Số liệu cục bộ (đo 2026-11-06, đổi theo template): trong `manifest.json` mỗi game, "chỉnh được/bỏ qua": giang-ho 95/9, huyen-anh 29/1, phuong 40/25, quy-mon-quan 48/0, samkok 47/2, ta-la 90/1, daiminhtinh 70/28, quan-anh 3/0, than-ma 106/30, thoi-khong 49/0, tuyetdinh 39/25. Chưa game nào có `layout.json` với phần tử (`layoutEls = 0` ở cả 11; phuong và than-ma có `history/`).

### 4.7 Env của clone (`/api/clone`)

Env nền đọc từ `deploy/develop/.env.example` của template (`readBaseEnv`), ghi đè key GameId theo `resolveGameIdEnvKey`, key hub -> `REAL_HUB_URL`, key ranking -> `REAL_RANKING_HOST`; ghi cùng nội dung vào `.env.local` và `.env.development.local` (ưu tiên cao nhất ở cả Vite lẫn Next, tránh `.env.development` của template trỏ hub dev bị CORS).

### 4.8 Quyết định giữ nguyên (từ memory, user duyệt)

- Mọi nghi ngờ phải xác nhận với user trước khi làm. Không đổi template gốc (chỉ bản clone); hỏi trước khi sửa template gốc (vd than-ma-ao-hoa base ranking không có `/api`).
- Phạm vi clone .NET loại Conhan và `Jobs/` (đã loại bằng pattern chung, không theo gameId; code ở `layer1-filesystem.ts`, `layer2-dotnet.ts`).
- Git hosting: GitHub org `tool-hompage-auto` để thử; quyền chỉ **tạo repo + push**; token chỉ ở env server. Đích cuối có thể là GitLab (chưa chốt group/token/Jenkins branch, tạm `develop`). **[chưa xác minh với GitHub thật]**: `/api/repo` mới test offline (bare repo cục bộ).
- Trình chỉnh layout chỉ sinh CSS override; operator chỉnh vị trí, kích thước, z-index, ẩn/hiện.

### 4.9 Biến môi trường (`.env.example`, KHÔNG ghi giá trị)

| Biến | Dùng ở | Ý nghĩa |
|---|---|---|
| `FIGMA_TOKEN` | figma-link/render | token đọc Figma |
| `GITHUB_TOKEN`, `GITHUB_ORG`, `GITHUB_BRANCH` | `/api/repo` | tạo repo + push (org mặc định `tool-hompage-auto`, branch mặc định `main`) |
| `TEMPLATE_SOURCE` | config.ts | `live` hoặc `snapshot` (ép dùng snapshot để chứng minh clone chạy không cần thư mục live) |
| `APP_DATA_DIR`, `TEMPLATE_ROOT`, `TEMPLATE_STORE_DIR`, `TEMPLATE_CACHE_DIR`, `CLONE_SCHEMAS_DIR`, `TEMPLATE_REGISTRY_DIR` | paths.ts | mục 4.1 |
| `TEMPLATE_GIT_TOKEN`, `TEMPLATE_GIT_USER` (mặc định `oauth2`) | template-source.ts | fetch template từ `source.vtvlive.vn` |
| `ALLOWED_DEV_ORIGINS` | next.config.ts | origin được mở dev server, phân tách bằng dấu phẩy |

Ngoài ra (không nằm trong `.env.example`): `.env.local` máy dev có thêm các khóa `ANTHROPIC_API_KEY`, `ANTHROPIC_BASE_URL`, `AGENT_MODEL`, `AGENT_MAX_SLOTS`; **không code nào trong `src/`, `scripts/` đọc chúng** (đã grep) — có vẻ dành cho kế hoạch AI asset (`13-PLAN`), chưa dùng.
Biến của script e2e (`TOOL`, `TARGET`, `NEIGHBOUR`, `GROUP`, ... ) xem mục 5.5. Biến trong code đọc nhưng không khai báo: `NEXT_PUBLIC_GAME_ID`, `NEXT_PUBLIC_HUB_GAME_ID` (tên key env của clone), `NODE_ENV`.

---

## 5. Visual editing (trình chỉnh layout)

Nguồn chuẩn: [`14-PLAN-visual-editing.md`](14-PLAN-visual-editing.md) (bản sao: `asset-detector-web/docs/visual-editing.md`). Đừng chép lại; chỉ tóm tắt.

### 5.1 Kiến trúc

```
Template --copy--> Clone --injectEditIdsInDir--> data-edit-id trên JSX + manifest.json
   + public/ve/layout-overrides.css (luôn) + inspector/mapper/protocol/config.js (khi editor bật)
   EditorPanel (parent) <--postMessage--> inspector.js (trong iframe preview, khác origin/cổng)
   PUT /api/layout --> layout.json (nguồn chuẩn) --compileLayoutCss--> layout-overrides.css --> reload CSS
```

- `visual-editing.ts#applyVisualEditing` chỉ chạy khi có layout đã lưu (không rỗng) **hoặc** form có `visualEdit=1`; nếu không clone y như trước (không thêm byte nào).
- Id ổn định: dựng từ asset slot (hai đoạn cuối `assetPath`, bỏ `${}`, thư mục breakpoint, đuôi) -> `banner.logo-duatop`; trùng thì hậu tố `~2`, `~3`. Gắn lên element định vị gần nhất (`absolute`/`fixed`), nhiều ảnh cùng element -> một id.
- Override: selector nhân đôi `[data-edit-id="x"][data-edit-id]` (specificity 0,2,0) thắng Tailwind không cần `!important`; vị trí bằng `left/top`, kích thước bằng CSS `scale: sx sy` (**không** động vào `transform`), ẩn = `display:none`, `z-index`.
- Breakpoint media (`BREAKPOINT_MEDIA`): desktop >= 769px, tablet 481-768px, mobile <= 480px.
- Bảo mật: inspector chỉ nhận message từ `editorOrigin`, đúng `protocolVersion`, đúng whitelist; giá trị layout chỉ là độ dài thuần (`%`, `px`, `rem`, `em`, `vw`, `vh`) vì đi thẳng vào CSS.

### 5.2 Chế độ phần tử (đã duyệt/đã làm 2026-11-05)

| Loại | Điều kiện | Chỉnh được |
|---|---|---|
| Thường (`full`) | Nằm trong element `absolute`/`fixed` (hoặc `fixed` có khung transform) | dời, scale, z-index, ẩn |
| `scale` | Ảnh nhỏ nằm trong luồng trang | scale quanh tâm, ẩn (API từ chối left/top/width/height/zIndex qua `patchAllowedFor`) |
| `source: "api"` | `src` đọc biến/thuộc tính dữ liệu | như trên nhưng **khóa nội dung ảnh** (không form thay) |
| Bỏ qua (có ghi lý do trong manifest `skipped`) | Ảnh nền cả khu vực (`w-full`, `w-screen`, `h-full`, `object-cover`, `inset-0`), video, footer (`*footer*`, `sdk/`) | — |

### 5.3 Giới hạn thao tác (đã duyệt; số nằm ở `public/ve/protocol.js` và `layout-schema.ts`, một test giữ hai nơi bằng nhau)

- Kéo: luôn trong khung chứa thật (xử lý cả tổ tiên chỉ có `translate`/`scale`/`filter` của Tailwind 4).
- Resize = scale 10-500%, tối thiểu 24px thiết kế, không vượt khung chứa; Shift = kéo giãn tự do ở góc.
- `zIndex` -10..999; `left/top` `%` -50..150, `px` <= 10000; `width/height` dương, `%` <= 200 (UI không còn tạo width/height).
- Chồng lấn: cảnh báo, không chặn. Template có `md:/lg:/xl:scale-*` riêng: scale của operator thay bằng **một giá trị cho cả dải breakpoint** (panel cảnh báo).

### 5.4 Adapter Next/Vite

| | Next.js | Vite |
|---|---|---|
| File | `ve-adapter-next.ts` -> `app/layout.tsx` của clone | `ve-adapter-vite.ts` -> `index.html` của clone |
| Chung | `ve-install.ts#patchHeadSource`: chèn `<link id="__ve_css">` (+4 `<script defer>` khi editor bật) trước `</head>` (hoặc sau `<body>`); idempotent | |
| Route dò | `app/**/page.*`, bỏ nhóm `(x)`, `[slug]` -> `:slug`, `[...x]` -> `*` | `<Route path element>` của react-router |
| Tailwind | v3 (than-ma-ao-hoa và các `-web`) | v4 (4 game Vite) |
| .NET | không có adapter; `applyVisualEditing` trả `note` "chưa hỗ trợ" (các repo .NET đã chuyển Next) | |

### 5.5 Chạy e2e (Playwright, `playwright-core`, Chrome cài sẵn)

Cần tool đang chạy; `TOOL` mặc định `http://localhost:3100` — nếu tool chạy cổng 3000 thì `TOOL=http://localhost:3000`. **Hai `next dev` không dùng chung một thư mục** (phải dừng cái kia). Chạy từ `APP`:

```bash
# than-ma-ao-hoa (Next), mặc định, ~6 phút, 45 kiểm tra
npm run e2e:visual-editing -- than-ma-ao-hoa
# phuong-hoang-tru-tien (Vite), 73 kiểm tra (theo plan 14f); ROUTE_PATH KHÔNG có dấu "/" đầu (Git Bash đổi "/x" thành đường dẫn Windows)
TARGET=news-download-panel.news.android NEIGHBOUR=news-download-panel.news.apk GROUP=news-download-panel.news.ios \
MOBILE_TARGET=banner.logo-game FIXED=float-bxh.float-home.btn-bxh ASSET=news-download-panel.news.ios \
DRAG=20 STEP=0.4 CENTER=1 SCALED_DRAG=25 ROUTE_ELEMENT=rank.data-image ROUTE_PATH=rank ROUTE_DATA=1 \
node scripts/ve-e2e.mjs phuong-hoang-tru-tien
```

Tham số khác: `FLOW` (ảnh trong luồng), `TEMPLATE_DIR`, `CHROME`, `STEP`. Template cuộn trong `#scaleWrapper` chứ không phải window nên e2e dùng `scrollIntoView`; ảnh trong template hay đè nhau nên e2e kéo bằng tay cầm ✥ chứ không bằng tâm ảnh.

### 5.6 Kết quả/giới hạn đã biết (chi tiết plan 14 mục 14b-16)

- Đã e2e: `than-ma-ao-hoa` (Next, 45/45) và `phuong-hoang-tru-tien` (Vite+Tailwind 4, 73/73) theo plan 14f. Số test đơn vị trong plan (149) đã cũ; hiện **161**.
- Chưa xác minh (plan mục 15): game Next/Vite khác; tablet 481-768 chưa có test riêng; conflict (template đổi) mới có test đơn vị; ảnh hai bản theo breakpoint trong hai DOM; không đo độ giống toàn trang >95%; kẹp mép trái dừng ở `left = 308` trong e2e (nghi vùng cuộn của tool che iframe, chưa xác minh).
- Thay ảnh trong preview chỉ chạy cho ảnh local: than-ma-ao-hoa phục vụ 96/98 ảnh từ CDN (`NEXT_PUBLIC_APP_SERVICE_PATH`) nên thường báo "thay ở bước 2"; phuong-hoang-tru-tien có `VITE_APP_CDN_IMAGE=''` nên thay được.
- Không hỗ trợ: ảnh nền CSS/`style={{backgroundImage}}`, video từ dữ liệu, rotate, sửa text/font.

---

## 6. Hỗ trợ theo từng game

16 thư mục trong `game-template-repo/`: **11** nằm trong tool (`GAME_REPO_MAP`), **5** chưa/không (cuối bảng). "VE" = trình chỉnh layout. Cột "VE đã verify" chỉ **Có** khi có e2e Playwright chạy thật (theo plan 14/memory); "manifest có" nghĩa là editor/clone từng chạy và sinh `manifest.json` nhưng **chưa e2e**.

| gameId | Mã / tên | repoDir | Framework (Tailwind) | Registry: commit | VE đã verify | Ghi chú |
|---|---|---|---|---|---|---|
| phuong-hoang-tru-tien | T029 Phượng Hoàng Tru Tiên | `home-page` | Vite 6 (TW4) | `9f870279` | **Có** (e2e Vite) | Game mặc định; có snapshot v1,v2 + schema frozen + snapshot Figma; Figma **đang ẩn** (xem mục 8); 9 route, 40 phần tử chỉnh được |
| than-ma-ao-hoa | T018 Thần Ma Ảo Hóa | `t018-than-ma-website` | Next 14.2.5 (TW3) | `e3a47700` | **Có** (e2e Next) | PoC VE; 106 chỉnh được, 13 route; ranking base không có `/api` (template gốc, đừng đổi khi chưa hỏi); 96/98 ảnh qua CDN; 3 file working copy lệch commit |
| tuyetdinh-chiengioi | T032 Tuyệt Đỉnh Chiến Giới | `t032-home-page` | Vite 6 (TW4) | `277c5ce3` | Chưa (manifest có) | Cùng "fingerprint" nhóm A với phuong |
| tamquoc-daiminhtinh | T037 Tam Quốc Đại Minh Tinh | `t037-home-landing` | Vite 6 (TW4) | `f714e239` | Chưa (manifest có) | Không có icon (chỉ wordmark) -> monogram |
| tamquoc-quan-anh | T203 Tam Quốc Quần Anh | `t203-homepage` | Vite 6 (TW4) | `a862f721` | Chưa (manifest có) | Cấu trúc gần nhóm A nhưng thiếu `HeaderHome.tsx` (chú thích trong `config.ts`); ảnh import qua barrel `assets/*/index.ts`: từ 2026-11-06 injector phân giải alias (`EditRef.alias`) -> **45** chỉnh được (3 trước đó) |
| huyen-anh-volam | T027 Huyền Anh Võ Lâm | `t027-huyen-anh-vo-lam-homepage-web` | Next 14.2.35 (TW3) | `null` | Chưa (manifest có) | Pilot chuyển .NET -> Next 2026-09-29; có bản mobile riêng; bản .NET gốc giữ để rollback |
| quy-mon-quan | R015 Quỷ Môn Quan | `homepage-va-conhan-web` | Next 14.2.35 (TW3) | `null` | Chưa (manifest có) | Loại module Conhan; logo 18+ liên kết `/landing` 404; có `_code-backup`, `_removed-duplicates-bak` |
| samkok-tamquoc | T028 Samkok Tam Quốc | `t028-samkok-tam-qu-c-home-and-landing-web` | Next 14.2.35 (không TW trong dependencies) | `null` | Chưa (manifest có) | Tên suy từ slug |
| ta-la-hac-ngokhong | T031 Ta Là Hắc Ngộ Không | `t031-home-page-web` | Next 14.2.35 (TW3) | `null` | Chưa (manifest có) | Nhiều root layout `(site)`, `(landing)`: adapter Next patch cả hai (2026-11-06), 90 chỉnh được. GameId đặt 1044 theo user (deploy.yaml develop); appsettings gốc ghi 1052, production deploy.yaml ghi 43 |
| thoi-khong-chi-mong | T022 Thời Không Chi Mộng | `t022-web-web` | Next 14.2.35 (không TW) | `null` | Chưa (manifest có) | Logo/icon lấy từ `Home/assets/icon.png` |
| giang-ho-ky-ngo | T030 Giang Hồ Kỳ Ngộ | `t030-giang-ho-ky-ngo-website-web` | Next 14.2.35 (TW3) | `null` | Chưa (manifest có) | 7 trường hợp lệch pixel 0.17-0.47% chưa xem hết (ghi nhận 2026-09-30); 95 chỉnh được |
| *(ngoài tool)* dau-than-tuyet-the | — | `t010-website-homepage` | Next 13.4.3 | — | — | Có trong thư mục, không trong `GAME_REPO_MAP` |
| *(ngoài tool)* luctung-tamquoc | — | `home` | Next 14.2.3 | — | — | idem |
| *(ngoài tool)* phong-ma-daosi | — | `t015-pmds-landing01-fe` | Next 14.1.0 | — | — | idem |
| *(ngoài tool)* thao-tung-tamquoc | R005 (đã gỡ khỏi tool 2026-09-30, lỗi thời) | `r005-fullweb-web` | Next 14.2.35 | — | — | Thư mục chưa xóa (cần user đồng ý); `.env.local` của nó từng trỏ `/api/mock` giả |
| *(ngoài tool)* t037-home-landing | — | (cấp ngoài, không bọc theo game) | Vite 6 | — | — | Bản Vite rời, trùng tên với repoDir của tamquoc-daiminhtinh |

Ghi chú chung:
- "Nhóm" trong comment `config.ts`/plan: A = Vite chung fingerprint (phuong, tuyetdinh, daiminhtinh, quan-anh); B = Next gốc (than-ma-ao-hoa); C = 6 repo .NET đã chuyển Next ("-web"). Chỉ huyen-anh-volam và thao-tung-tamquoc (đã gỡ) có bản mobile riêng; 5 `-web` còn lại là một cây markup responsive (media query ~1024px), nên không có split useResize/ScaleWrapper.
- Clone "chạy được" = `detect` + `clone` trả 200, có `src/services/index.ts`, `.env.local`, framework nextjs (đã xác nhận 2026-09-30 cho 6 repo -web); **không** có nghĩa VE đã verify.
- Số `chỉnh được/bỏ qua` mỗi game xem 4.6.
- Danh sách game hiển thị trên picker lấy framework từ registry (không cần template trên đĩa).

---

## 7. Build, test, deploy

### 7.1 Lệnh npm (chạy tại `APP`, Node 22)

| Lệnh | Việc |
|---|---|
| `npm ci` | cài |
| `npm run dev` | `next dev` (http://localhost:3000) |
| `npm run build` / `npm start` | production |
| `npm test` | `vitest run` (165 test) |
| `npx tsc --noEmit` | type check (không có script riêng; `tsconfig.json`) |
| `npm run lint` | `eslint` |
| `npm run registry:generate` / `registry:check` | sinh/kiểm manifest template-registry |
| `npm run e2e:visual-editing -- <game>` | e2e Playwright (mục 5.5) |

Stack: Next **16.3.6**, React 19.2.8, `sharp`, `@babel/parser|traverse`, `fast-glob`, `fflate`, `playwright-core`, vitest 2.1.8, TypeScript 5. Next 16 có breaking change so với kiến thức cũ: đọc `node_modules/next/dist/docs/` trước khi viết code (AGENTS.md).
**Luôn typecheck/build bản CLONE được sinh ra, không chỉ template** (bài học vá fake-news; code đó nay đã xóa nhưng nguyên tắc còn).

### 7.2 Docker / Jenkins / K8s (đều **chưa test** thật, do subagent viết)

- `Dockerfile`: `node:22.15.1-bookworm-slim` (không alpine vì sharp/glibc), `ARG DEPLOY`, cài `git` + `ca-certificates`, user `node` (uid 1000), `/data` là mount PVC, `npm ci`, copy `deploy/${DEPLOY}/.env.example` -> `./.env`, `npm run build`, `CMD npm run start`, cổng 3000.
- `.dockerignore`: loại `node_modules`, `.next`, `.git*`, log, `.figma-*`, `scripts/`, `*.test.ts`, `.env*` (trừ `.env.example`); **giữ** `public/` (gồm `public/ve`), `src/detector/figma-snapshots`.
- `Jenkinsfile`: `@Library('jenkins-libs')` gọi `VTVliveVplayNodeJSautodev(domain:"<DEV_DOMAIN>", container_port:"3000", service_path:"/", namespace:"<NAMESPACE>", service_name:"<SERVICE_NAME>")` — **toàn placeholder**, phải điền domain/namespace/service name trước khi chạy.
- `deploy/develop/deploy.yaml`: ConfigMap (`.env` không bí mật, đường dẫn `/data/...`), Secret mẫu (`FIGMA_TOKEN`, `GITHUB_TOKEN`, `TEMPLATE_GIT_TOKEN` là placeholder; tạo Secret thật ngoài repo), PVC 20Gi (`storageClassName: <STORAGE_CLASS>` placeholder), Deployment 1 replica `Recreate`, `fsGroup: 1000`, probe `/api/health`, resources đoán (req 500m/1Gi, limit 2/4Gi), Service, Ingress nginx (`${DOMAIN}`, `${SERVICE_PATH}`).
- `deploy/develop/.env.example`: các key rỗng + đường dẫn `/data/templates`, `/data/template-store`, `/data/cache`, `/data/clone-schemas`, `TEMPLATE_REGISTRY_DIR=./template-registry`.
- Build thử local: `docker build --build-arg DEPLOY=develop -t asset-detector-web:dev .` rồi `docker run --rm -p 3000:3000 -v adw-data:/data asset-detector-web:dev`; health `GET /api/health`. Lần đầu: `curl -X POST <tool>/api/templates/sync`.
- CI/CD của chính các clone (kế hoạch): `STRUCT/08-*` (bản nháp). Mỗi clone là một repo GitHub riêng, tên = `projectName`.

---

## 8. Quy ước, bẫy đã biết, việc còn mở

### 8.1 Quy ước

- Quy tắc tài liệu: commit đổi mã công cụ phải sửa file này trong cùng commit (hook `D:\Application-so-1\.claude\hooks\check-overview-doc.mjs` chặn; `[skip-docs]` để bỏ qua).
- Ngôn ngữ: UI và tài liệu tiếng Việt; `/admin` cố ý kỹ thuật/tiếng Anh. Comment code chủ yếu tiếng Anh.
- Không bao giờ ghi token/giá trị `.env.local` vào repo, tài liệu, chat, memory.
- Thêm game: `GAME_REPO_MAP` + `GAME_DISPLAY_NAMES` + icon `public/game-icons/<id>.png` + `registry:generate`.
- Tên dự án clone: `[mã_game]-[tên-game]` (vd `t050-ten-game`); GitHub token tối thiểu: Administration:write + Contents:write + Metadata:read.
- Quy ước detect cho game chuyển từ MVC (playbook `06-PLAYBOOK`): gọi `axios.get(` nguyên văn (không tạo instance `hubAxios.get(`), chuỗi template-literal asset phải có hậu tố literal không rỗng sau `${}`, Next 14.2.x dùng `next.config.mjs` (không `.ts`).

### 8.2 Bẫy đã biết

| Bẫy | Chi tiết |
|---|---|
| Hai `next dev` một thư mục | Không chạy hai server dev cùng thư mục (tool và e2e dùng cổng 3000 vs 3100); `scripts/ve-e2e.mjs` mặc định 3100 |
| Git Bash đổi env có dấu `/` | `ROUTE_PATH=/x` thành đường dẫn Windows; truyền `ROUTE_PATH=rank` (không `/` đầu) |
| Shell | Bash tool = Git Bash (cú pháp POSIX, `/dev/null`); một số tên file (vd `Trang chủ.png`) có tiếng Việt và khoảng trắng nên phải bọc nháy; Git in tên dạng escape — dùng `-c core.quotepath=off` |
| Preview spawn | `spawn("npm", ..., shell:true)` cần cho Windows; **không** cho clone kế thừa env của tool (biến Next/Turbopack/PORT làm `next dev` con thoát im lặng) -> dùng env sạch; Next không có `--strictPort` (chỉ Vite) |
| Preview "không phục vụ" | Từng gặp trong môi trường sandbox: API báo ready nhưng cổng từ chối kết nối, `.preview.log` rỗng (lặp lại cả trên than-ma-ao-hoa); `npm run dev -- --port N` chạy tay thì ổn. Chưa tìm nguyên nhân; xem log trong clone |
| Một preview duy nhất | `preview-process.ts` chỉ giữ một tiến trình; đổi game thì dừng cái cũ |
| Clone bị xóa-dựng lại | Mọi thứ không nằm ở `home-page-uploads` hoặc `home-page-layout` sẽ mất mỗi lần Generate clone; sửa tay trong `home-page-clone` sẽ mất |
| Uploads làm ảnh Figma "sống lại" | Ẩn Figma phải đổi tên cả thư mục uploads (đã làm cho phuong), không chỉ tắt UI |
| Template làm việc lệch commit | Nhiều working copy khác commit (phuong 3 file, than-ma 3, quy-mon-quan 55...) -> registry ghim commit nên deploy sẽ khác máy dev |
| `.env.development` của template | Vite nạp sau `.env.local` -> clone ghi thêm `.env.development.local` |
| Sharp trên Alpine | Dùng Debian-slim |
| Cuộn trong `#scaleWrapper` | Template cuộn trong wrapper chứ không phải window: e2e dùng `scrollIntoView` |
| Test chậm | `template-source.test.ts` ~12s (git thật); toàn bộ ~15s |
| Detect chậm | Mỗi `runDetection` quét lại không cache (~23s trên than-ma-ao-hoa) |
| Detect nhầm | `matchesAsset` Case 2 cần hậu tố literal; asset không tham chiếu (decor chưa nối) cho vào "unusedAssets", không phải lỗi detector |

### 8.3 Việc còn mở

Từ README/memory/plan (chưa xác minh lại từng cái trừ khi ghi chú):

- **Deploy K8s dev**: (a) preview lắng nghe cổng ngẫu nhiên trong pod, không qua được một Ingress -> cần proxy theo host/port hoặc pod preview riêng; (b) 6 game `-web` chưa có git remote (`source: null`) nên deploy sạch không lấy được template; (c) tiến trình preview kế thừa env của tool (lộ token); (d) Dockerfile/K8s/Jenkinsfile chưa chạy thật, placeholder domain/namespace/storage class; (e) fetch từ `source.vtvlive.vn` chưa chạy thử từ máy này (chỉ test với git cục bộ).
- **Vercel — hướng dẫn đầy đủ ở `asset-detector-web/deploy/vercel/README.md`** (Root Directory `Structure/asset-detector-web`, bật include-outside-root, `TEMPLATE_SEED_BASE_URL`). Trên Vercel chạy được: danh sách game, mở game, rà soát asset/chữ, detect; KHÔNG chạy được tạo bản sao/preview/editor (cần Docker, `deploy/demo/README.md`, `docker-compose.yml` — chưa chạy thử trong container). Đã mô phỏng bằng `next build` + `next start` với `VERCEL=1`, thư mục template rỗng và seed qua HTTP cục bộ: game mở được, detect 200, clone/preview 501. Chưa deploy thật lên Vercel. Ghi chú gốc của lần thử đầu: `asset-detector-web.vercel.app` hiện danh sách game nhưng mở game thì lỗi. Lý do: (a) `Structure/game-template-repo` và `template-store/**/template.tgz` bị gitignore nên không có trên Vercel; game "frozen" (phuong-hoang-tru-tien) cần giải nén `template.tgz` -> `materializeTemplate` ném lỗi (trước đây thành trang `digest`, nay `page.tsx` hiện thông báo); (b) 6/11 game không có nguồn git trong `template-registry`; 5 game còn lại cần `git` + `TEMPLATE_GIT_TOKEN` + mạng tới `source.vtvlive.vn`, mà Vercel không có `git` và ổ đĩa chỉ-đọc (cần `APP_DATA_DIR=/tmp/...`); (c) tạo bản sao/preview cần `npm install`, build và server nền trên cổng riêng, serverless không làm được. Nơi chạy đúng: máy chủ chạy liên tục có ổ đĩa ghi được (Docker/K8s, xem 7.2).
- **GitHub/GitLab**: `/api/repo` chưa test với GitHub thật; clone chưa có `deploy/`, Jenkinsfile của clone còn domain/service_name của game gốc; clone có thể 80-270MB; chưa nối CI trigger; group GitLab/token/branch Jenkins chưa chốt.
- **Visual editing**: các mục "chưa xác minh" ở 5.6; `ve-e2e.mjs` cần port sang UI đa trang (số kiểm tra kéo/resize/thay ảnh 45 và 73 trước đây chưa chạy lại); 7 game chưa e2e kéo thả; ảnh nền truyền qua prop của component tự viết (vd `SectionWrapper mobileSrc=... desktopSrc=...` ở tamquoc-daiminhtinh, 18 mục) vẫn chưa gắn thẻ được vì phải sửa component; cân nhắc gộp bước 2 vào bước 4 như một tab.
- **Figma**: đang ẩn cho phuong-hoang-tru-tien. Để khôi phục: xóa id khỏi `FIGMA_HIDDEN_GAMES` trong `config.ts` **và** đổi tên `game-template-repo/phuong-hoang-tru-tien/home-page-uploads.figma-hidden-20261105` về `home-page-uploads`, rồi Generate clone. Upload mới tạo thư mục `home-page-uploads` mới, áp dụng bình thường; layout (`home-page-layout`) tách riêng, vẫn áp dụng.
- **AI asset generation** (`13-PLAN`): chưa có code; chờ user trả lời (nguồn tham chiếu phong cách, nhà cung cấp + key, chạy trong wizard hay nền). Quy tắc đã nêu: slot < 70% tin cậy không sinh; mọi ảnh sinh ra phải được operator duyệt; không làm theo file deepseek (không khớp dự án).
- **Dữ liệu cũ**: thư mục `r005-fullweb`, `r005-fullweb-web`, `home-page-clone` của thao-tung-tamquoc chưa xóa (cần user đồng ý); `STRUCT/` còn `06`, `08*`, `11`, `13`, `14`, `openapi.yaml`, 3 PNG untracked, `figma-exporter/`, `asset-detector-poc/` đang giữ chờ user.

---

## 9. Nhật ký cập nhật

| Ngày | Commit | Thay đổi tài liệu |
|---|---|---|
| 2026-11-06 | `b4ace81` | Tạo mới toàn bộ tài liệu: tổng quan, cấu trúc, module, dữ liệu/cấu hình, visual editing, bảng 16 game, build/deploy, bẫy và việc còn mở |
| 2026-11-06 | `c1411cc` | VE: adapter Next hỗ trợ nhiều root layout (route group); `edit-id.ts` phân giải ảnh import qua barrel (`barrelAliasRefs`); smoke test clone+VE 9 game còn lại đều `installed`, chưa e2e kéo thả; thêm `ve-barrel-layouts.test.ts` (165 test) |
| 2026-11-06 | `1080709` | Editor: dàn nhiều trang cạnh nhau (tải lười), panel bỏ hết chữ chỉ còn Reset toàn trang; detector tag thêm video và ảnh nền full-width trong luồng trang (chế độ `scale`; số phần tử sửa được: than-ma 106→118, phuong 40→57, tuyetdinh 39→56, daiminhtinh 70→75, giang-ho 95→99); `ve-pages-smoke.mjs` mới, `ve-e2e.mjs` đánh dấu legacy |
| 2026-11-06 | `a907a31` | Bỏ "Thêm trang"/`×`, nút Reset toàn trang lên header; `prune-routes.ts` xóa trang /choigameN (và asset local riêng của chúng) khỏi clone; xóa cache clone/.next/template-materialized của các game |
| 2026-11-06 | `6a29eb4` | Wizard: lưu tiến độ trong trình duyệt là tùy chọn, cần bấm "Lưu tiến độ" + xác nhận; không xác nhận thì không lưu và xóa bản lưu cũ; Figma review không còn localStorage |
| 2026-11-06 | `daa6731` | Gộp slot: họ icon + ảnh trùng hash thành một slot, một upload ra mọi kích thước; `.ico` được tạo đúng định dạng |
| 2026-11-06 | `7d1dd4e` | Wizard bước 2: bỏ đoạn hướng dẫn trên danh sách ảnh và dòng "Đã bỏ qua N file ảnh không dùng" (prop `unusedAssets` của `WizardShell` bị gỡ) |
| 2026-11-06 | `0e6dfb7` | Sửa thay video banner (CDN) không có hiệu lực; thêm đổi màu bằng mã hex theo khối (`color-scan.ts`) |
| 2026-11-06 | `96e58d2` | Editor các trang con: bấm khu vực bất kỳ -> đổi màu bằng mã hex ngay tại chỗ (`color-store.ts`, `/api/colors`); ảnh/video CDN thay trực tiếp (`external-replace.ts`, `/api/asset` `external`, `external-slots.json`) |
| 2026-11-06 | `c455186` | Quyết định của operator: API chỉ sinh chữ, ảnh ở rank/tin tức là ảnh tĩnh. `buildCloneSlots` không còn loại khu vực rank/news (`includeApiSections: false` để bật lại bộ lọc cũ); editor cho thay ảnh bất cứ khi nào ảnh khớp một file trong repo (kể cả ảnh JSX lấy đường dẫn từ object dữ liệu); inspector liệt kê cả ảnh đang ẩn ở cỡ màn hình hiện tại khi không có ảnh nào hiện; `ve-replace-smoke.mjs` |
| 2026-11-06 | `7c193b5` | Banner mobile bị cắt mất bố cục: ảnh lệch tỉ lệ nhiều thì giữ trọn ảnh trên nền mờ (`keepWholePicture`), thêm lựa chọn `fit`/`crop` |
| 2026-11-06 | `36be209` | Bỏ bảng "Màu sắc" ở màn asset; ô chữ hiển thị được có "Màu chữ" nhập theo mã màu (`textcolor:`); bỏ khoá `color:` của wizard khỏi `/api/clone` |
| 2026-11-06 | `9671c2d` | Đổi màu theo VÙNG (selector) thay vì theo mã hex toàn source; có phạm vi "mọi mục cùng loại" cho chữ do API sinh; banner mobile giữ đúng tỉ lệ ảnh gốc (`original`, `flow-image.ts`) |
| 2026-11-06 | `e7835f7` | Bỏ thư mục bao ngoài `Application số 1`: `Structure/` nay ở gốc repo; sửa `.gitignore`, `CLAUDE.md`, hook và đường dẫn trong tài liệu này |
| 2026-11-06 | `d9eea32` | `page.tsx`: template không mở được (snapshot thiếu `template.tgz`, thư mục không đọc được) hiện thông báo thay vì trang lỗi `digest`; ghi chú vì sao Vercel không phù hợp (mục 8.3) |
| 2026-11-06 | (commit kế tiếp) | Hỗ trợ Vercel: `template-seed.ts` + `pack-templates.mjs --per-game`, dữ liệu ở `/tmp`, 501 rõ ràng cho clone/preview, `vercel.json`, `.vercelignore`, `maxDuration`; `PREVIEW_PORT_RANGE`; `docker-compose.yml`; hướng dẫn `deploy/vercel` và `deploy/demo` |

## 10. Cách cập nhật tài liệu này

Khi commit đổi phần nào thì sửa mục tương ứng, rồi thêm một dòng vào mục 9 (ngày | hash commit | tóm tắt). Hook chặn commit nếu đổi mã công cụ mà thiếu file này.

| Commit đổi... | Sửa mục |
|---|---|
| `src/app/components/wizard/*`, `src/app/page.tsx` (đổi bước/luồng) | 1.2, 3.6 |
| `src/app/api/*` (thêm/bớt route, đổi tham số) | 3.5, và 1.3 nếu đổi luồng |
| `src/detector/layer*`, `run.ts`, `framework-detector.ts`, `clone-slots.ts`, `section-labels.ts` | 3.1 |
| `src/detector/paths.ts`, `config.ts` (thêm game, tên, Figma ẩn, URL API) | 3.2, 4.1-4.2, **6**, 8.3 |
| `template-source.ts`, `template-registry/*`, `scripts/generate-registry.mjs` | 3.2, 3.8, 4.3, 6 (cột commit) |
| `template-store.ts`, `clone-schema.ts`, `freeze.ts`, `STRUCT/clone-schemas/`, `STRUCT/template-store/` | 3.2, 4.4 |
| `figma-*.ts`, `figma-snapshots/`, `figma-exporter/` | 3.3, 4.5 |
| `edit-id.ts`, `layout-*.ts`, `ve-*.ts`, `routes.ts`, `asset-match.ts`, `visual-editing.ts`, `public/ve/*` | 3.4, 3.7, 5 |
| `scripts/ve-e2e.mjs` | 3.8, 5.5 |
| Chạy e2e một game mới đạt | bảng mục 6 (cột "VE đã verify") và 5.6 |
| Thêm/bớt test (`*.test.ts`) | 3 (cột Test), đầu mục 3 (số test), 7.1 |
| `package.json` (script/phụ thuộc/phiên bản) | 7.1 |
| `Dockerfile`, `Jenkinsfile`, `deploy/*`, `.dockerignore` | 7.2, 2, 8.3 |
| `.env.example` hoặc biến env mới đọc trong code | 4.9, 4.1 |
| `.gitignore`, thư mục mới/đổi chỗ | 2 |
| Phát hiện bẫy mới / chốt xong một việc mở | 8.2 / 8.3 |
| Quyết định mới của user | 4.8 (và memory) |
