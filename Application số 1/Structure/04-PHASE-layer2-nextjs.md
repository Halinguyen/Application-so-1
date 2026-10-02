# Phase 4 — Layer 2: Reference Scanner (Next.js)
**Thời gian:** 5.5 ngày

## Context
Layer 2 phức tạp nhất. Parse JS/TS/JSX để tìm mọi cách asset được reference.
**Bao gồm:** static import, dynamic import, JSX attrs, template literals, CSS url(), 
video, carousel, overlay, sticky, swiper, leaderboard.

## Task
Implement Layer 2 Reference Scanner cho Next.js.

## Requirements

### 1. File `packages/detector/src/layers/layer2-nextjs.ts`

```typescript
import { AssetReference, RawAsset } from '@asset-detector/core';
import { IGNORE_PATTERNS, isFooterPath } from '@asset-detector/core';
import { parse } from '@babel/parser';
import _traverse from '@babel/traverse';
import fg from 'fast-glob';
import { readFile } from 'fs/promises';
import path from 'path';

const traverse = _traverse.default;

export interface Layer2Options {
  includeCss?: boolean;             // default true
  includeJson?: boolean;            // default true
  includeDynamic?: boolean;         // default true
  skipFooterReferences?: boolean;   // default true
}

export interface Layer2Result {
  references: AssetReference[];
  byType: Record<string, number>;
  filesScanned: number;
  footerFilesSkipped: number;
  durationMs: number;
  warnings: string[];
}

export async function layer2ScanNextJs(
  repoPath: string,
  rawAssets: RawAsset[],
  options: Layer2Options = {}
): Promise<Layer2Result> {
  // Scan tất cả file code
  // Với mỗi file, dispatch tới scanner tương ứng
  // ...
}
```

### 2. Các pattern BẮT BUỘC

#### A. Static import
```typescript
import hero from '@/assets/hero.jpg';
```
→ type: 'import', confidence: 1.0

#### B. Dynamic import
```typescript
const img = await import(`@/assets/${name}.jpg`);
```
→ type: 'dynamic-import', confidence: 0.6

#### C. JSX src
```jsx
<img src="/images/hero.jpg" />
<Image src="/images/hero.jpg" width={800} height={600} />
```
→ type: 'jsx-attr', confidence: 1.0

#### D. Video
```jsx
<video src="/videos/showcase.mp4" poster="/images/poster.jpg">
  <source src="/videos/showcase.webm" />
</video>
```
→ 3 references: mp4, webm, poster

#### E. Template literals
```jsx
<img src={`/images/${name}.jpg`} />
```
→ type: 'template-literal', confidence: 0.5

#### F. CSS url()
```css
.hero { background: url('/images/hero.jpg'); }
```
→ type: 'css-url', confidence: 1.0

#### G. JSON references
```json
{ "logo": "/images/logo.svg" }
```
→ type: 'json-ref', confidence: 0.9

### 3. Footer skip

```typescriptfunction isFooterFile(filePath: string): boolean {
  const patterns = [
    /[/\\]footer[/\\]/i,
    /[/\\]sdk[/\\]/i,
    /Footer\.(tsx|jsx|ts|js)$/i,
    /footer\.(tsx|jsx|ts|js)$/i,
  ];
  return patterns.some(p => p.test(filePath));
}

// Trong scanJsCode:
if (options.skipFooterReferences && isFooterFile(file)) {
  return [];
}
```

### 4. Video detection (chi tiết)

```typescript
traverse(ast, {
  JSXElement(path) {
    const tagName = path.node.openingElement.name;
    if (tagName.type !== 'JSXIdentifier' || tagName.name !== 'video') return;

    const attrs = extractJsxAttributes(path.node.openingElement.attributes);
    
    if (attrs.src) {
      references.push({
        file: relativePath, line: loc, type: 'jsx-attr',
        assetPath: attrs.src, attribute: 'src',
        usage: 'video-element', confidence: 1.0,
      });
    }
    if (attrs.poster) {
      references.push({
        file: relativePath, line: loc, type: 'jsx-attr',
        assetPath: attrs.poster, attribute: 'poster',
        usage: 'video-poster', confidence: 1.0,
      });
    }

    // <source> children
    path.node.children
      .filter(c => c.type === 'JSXElement' && c.openingElement.name.name === 'source')
      .forEach(child => {
        const sourceAttrs = extractJsxAttributes(child.openingElement.attributes);
        if (sourceAttrs.src) {
          references.push({
            file: relativePath, line: child.loc?.start.line || 0,
            type: 'jsx-attr', assetPath: sourceAttrs.src,
            attribute: 'src', usage: 'video-source', confidence: 1.0,
          });
        }
      });
  },
});
```

### 5. Carousel detection

```typescript
const CAROUSEL_PATTERNS = [/Carousel/i, /Slider/i, /Swiper/i, /SlideShow/i, /Gallery/i];

function isCarouselComponent(filePath: string): boolean {
  return CAROUSEL_PATTERNS.some(p => p.test(filePath));
}
```

### 6. Overlay detection

Detect element có className chứa:
- `absolute`, `overlay`, `fixed`, `inset-0`

→ Flag `isOverlay: true`.

### 7. Sticky detection

Detect className chứa:
- `sticky`, `fixed`

→ Flag `isSticky: true`.

### 8. Section detection

```typescript
const SECTION_PATTERNS = {
  hero: [/[/\\]hero[/\\]/i, /Hero\.(tsx|jsx)$/],
  header: [/[/\\]header[/\\]/i, /Header\.(tsx|jsx)$/],
  sidebar: [/[/\\]sidebar[/\\]/i, /Sidebar\.(tsx|jsx)$/],
  content: [/[/\\]content[/\\]/i],
  swiper: [/[/\\]swiper[/\\]/i, /Swiper\.(tsx|jsx)$/],
  leaderboard: [/[/\\]leaderboard[/\\]/i, /Leaderboard\.(tsx|jsx)$/],
};
```

### 9. Swiper detection

```typescript
const SWIPER_LIBRARIES = [
  'swiper', 'swiper/react', 'react-swiper', 'keen-slider',
  'embla-carousel-react', '@splidejs/react-splide', 'react-slick',
];

// Check package.json
// Scan code for <Swiper> element
// Extract slides từ <SwiperSlide> children
// Extract config: effect, slidesPerView, centeredSlides, spaceBetween
```

**Coverflow detection:**
```typescript
function detectVisualMode(config: any): VisualMode {
  if (config.effect === 'coverflow') return 'coverflow';
  if (config.effect === 'cards') return 'cards';
  if (typeof config.slidesPerView === 'number' && config.slidesPerView > 1) return 'multi-visible';
  if (config.slidesPerView === 'auto') return 'multi-visible';
  return 'single';
}
```

**Composite slide detection:**
```typescript
function detectSlideComposition(slideElement: any): SlideComposition {
  const layers: SwiperSlideLayer[] = [];
  // Count <Image> elements inside slide
  // Extract roles: background, character, logo, title, subtitle, frame, ui-screenshot
}
```

### 10. Leaderboard detection

```typescript
// Detect fetch/useSWR to /api/leaderboard
// Extract tabs từ <Tab> elements
// Extract columns từ <th> hoặc <TableHeader>
// Detect rank icons (rank-1.png, top-2.svg, etc.)
// Detect frame (border-image, 9-slice, 1 ảnh)
```

### 11. Test Fixtures (≥ 8 fixtures)

```
tests/fixtures/layer2-nextjs/
├── static-imports/       (10 file với import patterns)
├── jsx-attrs/            (JSX với img, Image, video)
├── css-urls/             (CSS với url())
├── dynamic/              (template literals, dynamic import)
├── footer-skip/          (Footer.tsx + page.tsx)
├── swiper-single/        (Swiper Môn Phái)
├── swiper-coverflow/     (Swiper Showcase composite)
└── leaderboard/          (Leaderboard 3 tabs)
```

### 12. Test Cases (≥ 15 cases)

1. Static import → detect reference
2. JSX `<img>` → detect
3. JSX `<Image>` → detect
4. `<video>` + `<source>` → detect 3 refs
5. CSS url() → detect
6. Template literal → detect với confidence 0.5
7. Footer file → skip hoàn toàn
8. Swiper single-slide → detect 1 swiper, 4 slides
9. Swiper coverflow → detect effect, 5 composite slides
10. Composite slide → detect layers
11. Leaderboard → detect 3 tabs, 4 columns
12. Rank icons → detect từ pattern
13. Overlay detection → flag đúng
14. Sticky detection → flag đúng
15. Section detection → group đúng

## Acceptance Criteria
1. ✅ Tests pass 100%
2. ✅ Coverage > 85%
3. ✅ Footer skip hoạt động đúng
4. ✅ Swiper 2 dạng detect đúng
5. ✅ Leaderboard detect đúng

## Output Format
```
## Phase 4 Report
### Files Created: (list)
### Test Results: (paste)
### Coverage: X%
### Footer Skip Verified: YES/NO
### Swiper Detection: single ✓ | coverflow ✓
### Leaderboard Detection: ✓
### Next Phase Ready: YES/NO
```