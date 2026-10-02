# API Blocks Discovery: phuong-hoang-tru-tien

## 1. Button Config API

### Endpoint found
- Endpoint: literal `/api/config/buttons` — **NOT FOUND**
- Functionally equivalent endpoint found: `GET {VITE_APP_HUB}/api/frontend/config`
- Files gọi: `src/services/index.ts:30` (`getSiteConfig`)
- Base URL: `import.meta.env.VITE_APP_HUB` (env var, not hardcoded)

### Params phát hiện
- gameId: có, nhưng tên thật là `game_id` (query param), lấy từ `import.meta.env.VITE_APP_GAME_ID`
- Params khác: `language_name` (query param, default `localStorage.getItem('lang') || 'vi'`)

### Code mẫu
```ts
export const getSiteConfig = createAsyncThunk('siteConfig', async () => {
  try {
    const response = await axios.get(`${BASE_API_HUB}/api/frontend/config`, {
      headers: { Accept: 'application/json' },
      params: {
        game_id: GAME_ID,
        language_name: localStorage.getItem('lang') || 'vi',
      },
    });
    ...
  }
});
```
Consumers of the resulting `siteConfig` (the actual "button" render sites): `src/layout/FloatHome.tsx`, `src/layout/HeaderHome.tsx`, `src/layout/FooterWrapper.tsx`, `src/components/news/NewsActionButtons.tsx`, `src/components/news/NewsDownloadPanel.tsx` — download links, fanpage/group links, payment/giftcode links all come from this one payload.

## 2. Leaderboard API

### Endpoint found
- Endpoint: literal `/api/leaderboard` — **NOT FOUND**
- Functionally equivalent endpoint found: `GET {VITE_APP_API_GAME_SERVICES}/Ranking/GetRanking`
- Files gọi: `src/services/index.ts:170` (`getRanking`), consumed by `src/components/home/Rank.tsx`
- Base URL: `import.meta.env.VITE_APP_API_GAME_SERVICES`

### Params phát hiện
- mode: có — nhưng chỉ có 1 giá trị thực tế dùng: `"user"`
- scope: có — 2 giá trị: `"all"`, `"area"`
- limit: **không có** — API không nhận `limit` param trong code thực tế

### Tabs (nếu có)
Chỉ có **2 tabs**, không phải 3 như giả định trong file này:
- "BXH All Server" → `mode=user, scope=all`
- "BXH Cụm Server" → `mode=user, scope=area`

Không có tab "Tổng Môn" (faction) hay "Top Cụm" riêng biệt với "Cụm Server" — chỉ 2 lựa chọn.

### Code mẫu
```ts
export const getRanking = createAsyncThunk(
  'ranking',
  async ({ mode, scope }: { mode: string; scope: string }) => {
    try {
      const response = await axios.get(
        `${VITE_APP_API_GAME_SERVICES}/Ranking/GetRanking`,
        {
          headers: { Accept: 'application/json' },
          params: { gameId: GAME_ID, mode: mode, scope: scope },
        }
      );
      return response.data;
    } catch (error) { return null; }
  }
);
```

## 3. Config/Env
- `VITE_API_BASE`: không tồn tại — repo dùng 2 base URL riêng: `VITE_APP_HUB` (config/posts/slides) và `VITE_APP_API_GAME_SERVICES` (ranking)
- `VITE_GAME_ID`: không tồn tại — tên thật là **`VITE_APP_GAME_ID`**
- Base URL pattern: mỗi nhóm API dùng biến env riêng, không có 1 `baseURL` chung; endpoint luôn ở dạng `${ENV_VAR}/path/co-dinh`

## 4. Kết luận
- Button API: **PARTIAL** — không tìm thấy theo tên `/api/config/buttons`, nhưng có 1 API tương đương về chức năng (`/api/frontend/config`) đóng vai trò cấu hình toàn bộ nút bấm/link động của trang
- Leaderboard API: **PARTIAL** — không tìm thấy theo tên `/api/leaderboard`, nhưng có 1 API tương đương (`Ranking/GetRanking`) với params/tabs khác với giả định ban đầu (thiếu `limit`, chỉ 2 tabs thay vì 3, tên tab khác)
- Cần manual review: **yes** — endpoint name, param name, và số lượng tab đều khác giả định cứng trong `layer2-api-blocks.ts`'s keyword-matching logic (xem Phase A.3/A.4 để biết code có tự phát hiện được 2 API tương đương này hay không)
