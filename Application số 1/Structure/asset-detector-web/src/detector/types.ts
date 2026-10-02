export type Framework = 'nextjs' | 'dotnet-mvc' | 'vite-spa';

export interface FrameworkInfo {
  framework: Framework;
  version: string;
  router?: 'app' | 'pages' | 'spa';
  packageManager?: 'npm' | 'yarn' | 'pnpm';
  styling?: string;
  nodeVersion?: string;
  confidence: number;
}

export type AssetType = 'image' | 'video' | 'audio' | 'font' | 'other';

export interface RawAsset {
  absolutePath: string;
  relativePath: string;
  fileName: string;
  extension: string;
  type: AssetType;
  size: number;
  hash: string;
  detectedBy: 'filesystem';
  confidence: number;
}

export interface AssetReference {
  file: string;
  line: number;
  type: string;
  assetPath: string;
  attribute?: string;
  usage: string;
  confidence: number;
  section?: string;
}

export type ResponsiveMode = 'shared' | 'per-breakpoint';

export type BreakpointName = 'mobile' | 'tablet' | 'desktop';

export interface AssetVariant {
  breakpoint: BreakpointName;
  path: string;
  publicPath: string;
  fileName: string;
  size: number;
  hash: string;
  width?: number;
  height?: number;
  ratio?: string;
}

export interface ResponsiveInfo {
  mode: ResponsiveMode;
  variants?: Partial<Record<BreakpointName, AssetVariant>>;
  missingBreakpoints?: BreakpointName[];   // breakpoints không có file
}

export interface AssetConstraints {
  ratio?: string;                  // "16:9", "1:1", etc.
  recommendedWidth?: number;
  recommendedHeight?: number;
  maxFileSize?: number;            // bytes
  allowedFormats?: string[];       // ['png', 'jpg', 'webp']
  allowTransparent?: boolean;
}

export interface AssetMetadata {
  label: string;                   // "Home Banner"
  description?: string;            // "Banner chính trang chủ"
  priority: 'high' | 'medium' | 'low';
  operatorEditable: boolean;       // có cho operator thay không
  group: string;                   // "banner", "logo", "button", ...
}

export interface InjectionConfig {
  strategy: 'file-override' | 'env-inject' | 'manual';
  targetPaths: string[];           // list path cần override
  postProcess?: ('resize' | 'optimize' | 'convert')[];
}

export interface DetectedAsset {
  id: string;
  canonicalPath: string;
  publicPath: string;
  type: AssetType;
  fileName: string;
  extension: string;
  size: number;
  hash: string;
  responsive: ResponsiveMode;
  variants?: Partial<Record<BreakpointName, AssetVariant>>;  // ← NEW
  missingBreakpoints?: BreakpointName[];   // ← NEW
  references: AssetReference[];
  referenceCount: number;
  detectedBy: string[];
  confidence: number;
  needsManualReview: boolean;
  isVendor: boolean;
  isFooter: boolean;
  section: string;
  isAutoManaged: boolean;
  isExternal: boolean;
  externalUrl?: string;
  constraints?: AssetConstraints;   // ← NEW
  metadata?: AssetMetadata;         // ← NEW
  injection?: InjectionConfig;      // ← NEW
  dimensions?: { width: number; height: number };  // ← NEW
}

export type DynamicBlockType = 'api-buttons' | 'api-leaderboard';

export interface DynamicBlockParam {
  name: string;
  envKey: string;
  type: 'string' | 'number' | 'enum';
  required?: boolean;
  options?: string[];
  default?: unknown;
  description?: string;
}

export interface LeaderboardTab {
  id: string;
  label: string;
  mode: string;
  scope: string;
}

export interface DynamicBlock {
  id: string;
  type: DynamicBlockType;
  label: string;
  section: string;
  source: string;                    // 'file:line'
  apiEndpoint: string;
  baseUrlEnv?: string;                // ← NEW: VITE_APP_HUB, VITE_APP_API_GAME_SERVICES, ...
  consumedBy?: string[];              // ← NEW: files that consume this block's data
  params: DynamicBlockParam[];
  tabs?: LeaderboardTab[];           // chỉ cho leaderboard
  injectVia: 'env-inject';
  confidence: number;
  detectionMethod: 'data-slot' | 'grep' | 'ast' | 'manual';
}

export type VisualMode = 'single' | 'multi-visible' | 'coverflow' | 'cards';
export type SwiperLibrary = 'swiper' | 'keen-slider' | 'embla' | 'splide' | 'slick' | 'unknown';

export interface DetectedSwiper {
  id: string;
  type: 'swiper';
  source: string;                 // 'file:line'
  library: SwiperLibrary;
  visualMode: VisualMode;
  effectType?: string;             // 'slide' | 'coverflow' | 'cards' | ...
  slidesPerView: number | 'auto';
  centeredSlides: boolean;
  spaceBetween: number;
  slideCount: number;              // 0 nếu không xác định được (prop-fed, không resolve được)
  navigation: { prev: string; next: string };   // asset path nếu có nút prev/next, "" nếu không
  indicators: string[];            // mô tả indicator (dot bullets, ...), rỗng nếu không có
  config: {
    autoplay: boolean;
    loop: boolean;
    delay?: number;
  };
  isDataDriven: boolean;           // true nếu slides đến từ prop/API, false nếu mảng tĩnh trong code
  dataSource?: string;             // "prop: slides" hoặc "static array: <file>"
  hasEffect3D: boolean;
  uploadMode: 'simple' | 'advanced';
  confidence: number;
  needsManualReview: boolean;
}

export interface DetectionResult {
  gameId: string;
  repoPath: string;
  framework: FrameworkInfo;
  assets: DetectedAsset[];
  references: AssetReference[];
  dynamicBlocks: DynamicBlock[];     // ← NEW
  swipers: DetectedSwiper[];         // ← NEW
  summary: {
    totalAssets: number;
    totalReferences: number;
    totalDynamicBlocks: number;      // ← NEW
    totalSwipers: number;            // ← NEW
    avgConfidence: number;
    needsReview: number;
    byType: Record<AssetType, number>;
    bySection: Record<string, number>;
  };
  detectedAt: string;
  durationMs: number;
}
