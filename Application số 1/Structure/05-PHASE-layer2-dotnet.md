# Phase 5 — Layer 2: Reference Scanner (.NET MVC)
**Thời gian:** 4.5 ngày

## Context
Tương tự Phase 4 nhưng cho .NET MVC: parse `.cshtml`, `.razor`, `.cs`.

## Requirements

### 1. File `packages/detector/src/layers/layer2-dotnet.ts`

```typescript
export async function layer2ScanDotNet(
  repoPath: string,
  rawAssets: RawAsset[],
  options: Layer2Options = {}
): Promise<Layer2Result> {
  // Scan .cshtml, .razor, .html, .cs, .json, .css
}
```

### 2. Patterns BẮT BUỘC

#### A. Razor img
```html
<img src="~/images/hero.jpg" />
```
→ type: 'razor-img', confidence: 1.0

#### B. Url.Content
```html
@Url.Content("~/images/hero.jpg")
```
→ type: 'razor-url-content', confidence: 1.0

#### C. Link/Script
```html
<link href="~/css/site.css" rel="stylesheet" />
<script src="~/js/site.js"></script>
```
→ type: 'razor-link', confidence: 1.0

#### D. Model refs (dynamic)
```html
<img src="@Model.LogoUrl" />
```
→ type: 'razor-model-ref', confidence: 0.3 (cần manual review)

#### E. C# string literals
```csharp
var path = "~/images/logo.png";
```
→ type: 'csharp-string', confidence: 0.9

#### F. appsettings.json
```json
{ "Logo": "/images/logo.svg" }
```
→ type: 'json-config', confidence: 0.9

#### G. Inline style
```html
<div style="background: url('/images/bg.jpg')">
```
→ type: 'inline-style-url', confidence: 1.0

### 3. Footer skip cho Razor

```typescript
const FOOTER_RAZOR_PATTERNS = [
  /[/\\]Views[/\\]Shared[/\\]_Footer\.cshtml$/i,
  /[/\\]Views[/\\]Shared[/\\]_SdkFooter\.cshtml$/i,
  /[/\\]Footer[/\\]/i,
  /[/\\]footer[/\\]/i,
  /[/\\]sdk[/\\]/i,
];
```

### 4. Video/Swiper/Leaderboard cho .NET

Nếu .NET dùng JS library (swiper qua CDN hoặc npm), phải scan file `.js` trong `wwwroot/js/`.
Nếu .NET dùng server-side logic cho leaderboard, detect qua Controller + View.

### 5. Test Fixtures

```
tests/fixtures/layer2-dotnet/
├── razor-basic/           (Index.cshtml với img, link, script)
├── razor-footer/          (_Footer.cshtml + _Layout.cshtml)
├── csharp-strings/        (Controller với asset paths)
├── appsettings/           (appsettings.json với logo paths)
└── mixed/                 (combined patterns)
```

### 6. Test Cases (≥ 12 cases)

1. Razor `<img src="~/...">` → detect
2. `@Url.Content(...)` → detect
3. `<link>`, `<script>` → detect
4. `@Model.XxxUrl` → detect với confidence 0.3
5. C# string literal → detect
6. appsettings.json → detect
7. Inline style url() → detect
8. `_Footer.cshtml` → skip
9. `_Layout.cshtml` chứa footer reference → reference bị skip
10. Mixed patterns → detect đúng hết
11. Không có false positive (không phải asset không bị detect)
12. Section detection → group đúng

## Acceptance Criteria
1. ✅ Tests pass 100%
2. ✅ Coverage > 85%
3. ✅ Footer skip hoạt động

## Output Format
```
## Phase 5 Report
### Files Created: (list)
### Test Results: (paste)
### Coverage: X%
### .NET Patterns Detected: N loại
### Next Phase Ready: YES/NO
```