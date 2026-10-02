# Phase 10 — Real-World Section Patterns
**Thời gian:** 3 ngày (bổ sung)

## Context
Từ 10 repo điển hình, có 5 dạng section phổ biến cần detect đặc biệt.
Phase này đảm bảo agent có checklist đầy đủ cho các dạng này.

## 5 Dạng Section

### Dạng 1: Hero Section
**Đặc điểm:**
- Background đa layer (núi lửa + mây + particle)
- Character art (1 hoặc 3 nhân vật)
- Logo, title PNG
- Buttons (mixed: ảnh + API config)
- Sidebar sticky

**Detection checklist:**
- [ ] Background layers detected
- [ ] Character art detected (single hoặc multiple)
- [ ] Logo detected
- [ ] Title PNG detected
- [ ] Button assets detected
- [ ] Button config API detected
- [ ] Sidebar sticky detected + flagged isSticky

### Dạng 2: Content Section
**Đặc điểm:**
- Video showcase (mp4 + poster + source)
- Banner layered (frame + glow + text)
- Avatar + frame (2 layers)
- Nút store (image buttons)
- Nút mixed (bg image + icon + text)
- Right sidebar (reusable)

**Detection checklist:**
- [ ] Video detected (mp4 + webm + poster)
- [ ] Banner layers grouped (isLayered)
- [ ] Avatar + frame grouped
- [ ] Button assets detected
- [ ] Mixed buttons flagged
- [ ] Sidebar flagged isReusable + appearsInSections

### Dạng 3: Swiper Single-Slide
**Đặc điểm:**
- 1 slide full-width
- Mỗi slide có layout riêng
- 4-5 slides
- Pentagon chart (data-driven hoặc ảnh)
- Navigation arrows
- Indicator dots

**Detection checklist:**
- [ ] Swiper library detected
- [ ] Slide count correct
- [ ] Per-slide assets extracted
- [ ] Chart data detected
- [ ] Navigation assets detected
- [ ] Indicator assets detected
- [ ] Text vs ảnh phân biệt đúng

### Dạng 4: Swiper Coverflow
**Đặc điểm:**
- Multi-visible (3 slides cùng hiển thị)
- Effect 3D (coverflow/cards)
- Mỗi slide composite 6-7 layers
- 5 slides
- Navigation large arrows
- Indicator dots

**Detection checklist:**
- [ ] Effect detected (coverflow/cards)
- [ ] slidesPerView detected
- [ ] centeredSlides flag
- [ ] Composite slide detected (isComposite)
- [ ] Layer roles assigned
- [ ] Animation detected
- [ ] SlideTo capture (không click)

### Dạng 5: Leaderboard
**Đặc điểm:**
- 3 tabs (BXH Server, BXH Tổng Môn, BXH Top Cụm)
- Dynamic table từ API
- Rank icons (top 1, 2, 3)
- Frame border-image hoặc 9-slice
- Title PNG

**Detection checklist:**
- [ ] Leaderboard API detected
- [ ] 3 tabs extracted với mode/scope
- [ ] 4 columns extracted
- [ ] Rank icons detected
- [ ] Frame detected
- [ ] Title asset detected
- [ ] API verification pass

## Test Fixtures

Tạo fixtures mô phỏng 5 dạng:

```
tests/fixtures/sections/
├── hero/                    (Next.js component)
├── content/                 (Next.js component)
├── swiper-single/           (Swiper Môn Phái)
├── swiper-coverflow/        (Swiper Showcase)
└── leaderboard/             (BXH)
```

Mỗi fixture bao gồm:
- Source code (Next.js hoặc .NET)
- Assets folder
- Expected manifest JSON

## Test Cases

1. Hero → detect đủ 15+ assets, 1 dynamic block, sidebar reusable
2. Content → detect video, banner layered, mixed buttons
3. Swiper single → detect 4 slides riêng biệt
4. Swiper coverflow → detect 5 composite slides với 6-7 layers mỗi slide
5. Leaderboard → detect 3 tabs + 4 columns + 3 rank icons + frame

## Acceptance Criteria
1. ✅ 5/5 fixtures detect đúng
2. ✅ Expected manifest match actual manifest
3. ✅ Confidence > 0.9 cho tất cả

## Output Format
```
## Phase 10 Report
### Fixtures Created: 5
### Test Results: 5/5 pass
### Avg Confidence per Section Type: (list)
### Next Step: Ready for Production
```