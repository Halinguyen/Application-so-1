
---

## 📄 File: `APPENDIX-B-constants.md`

```markdown
# APPENDIX B — Constants

## Asset Extensions
```typescript
export const ASSET_EXTENSIONS = {
  image: ['jpg', 'jpeg', 'png', 'gif', 'svg', 'webp', 'avif', 'ico', 'bmp'],
  video: ['mp4', 'webm', 'mov', 'avi', 'mkv'],
  audio: ['mp3', 'wav', 'ogg', 'm4a'],
  font: ['woff', 'woff2', 'ttf', 'otf', 'eot'],
  other: ['pdf', 'zip'],
} as const;

export const ALL_ASSET_EXTENSIONS = Object.values(ASSET_EXTENSIONS).flat();