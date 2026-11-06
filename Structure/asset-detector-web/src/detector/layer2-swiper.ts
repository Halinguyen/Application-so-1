import { DetectedSwiper, SwiperLibrary, VisualMode } from './types';
import { parse } from '@babel/parser';
import _traverse from '@babel/traverse';
import fg from 'fast-glob';
import { readFile } from 'fs/promises';
import path from 'path';

const traverse = (_traverse as any).default || _traverse;

const IGNORE_PATTERNS = [
  '**/node_modules/**',
  '**/dist/**',
  '**/*.min.js',
];

const FOOTER_PATTERNS = [
  /[/\\]footer[/\\]/i,
  /[/\\]sdk[/\\]/i,
  /Footer\.(tsx|jsx|ts|js)$/i,
  /footer\.(tsx|jsx|ts|js)$/i,
];

const SWIPER_IMPORT_SOURCES: Record<string, SwiperLibrary> = {
  'swiper/react': 'swiper',
  'swiper': 'swiper',
  'react-swiper': 'swiper',
  'keen-slider': 'keen-slider',
  'embla-carousel-react': 'embla',
  '@splidejs/react-splide': 'splide',
  'react-slick': 'slick',
};

export interface SwiperScanResult {
  swipers: DetectedSwiper[];
  filesScanned: number;
  filesWithSwiper: number;
}

export async function layer2ScanSwiper(repoPath: string): Promise<SwiperScanResult> {
  const files = await fg(['**/*.{ts,tsx,js,jsx}'], {
    cwd: repoPath,
    ignore: IGNORE_PATTERNS,
    absolute: true,
  });

  // Build 1 map toàn project: tên biến/hằng số -> file khai báo, cho những
  // mảng literal top-level (`export const X = [...]`). Dùng để resolve
  // nguồn slide khi component `.map()` qua 1 hằng số IMPORT từ file khác
  // (vd. SliderMB.tsx/SliderPC.tsx dùng chung `SlideHome` từ utils/constant.ts)
  // — nếu chỉ tìm trong file hiện tại sẽ không thấy, kết luận sai là
  // "data-driven" trong khi thực chất là mảng tĩnh hard-code.
  const staticArrays = new Map<string, { file: string; length: number }>();
  const fileContents = new Map<string, string>();

  for (const file of files) {
    const relativePath = path.relative(repoPath, file).replace(/\\/g, '/');
    if (FOOTER_PATTERNS.some(p => p.test(relativePath))) continue;
    const content = await readFile(file, 'utf-8');
    fileContents.set(relativePath, content);
    collectStaticArrayExports(content, relativePath, staticArrays);
  }

  const swipers: DetectedSwiper[] = [];
  const filesWithSwiper = new Set<string>();
  let idx = 0;

  for (const [relativePath, content] of fileContents) {
    if (!/from\s+['"]swiper\/react['"]/.test(content) && !/<Swiper[\s>]/.test(content)) continue;

    const library = detectLibrary(content);
    let ast;
    try {
      ast = parse(content, { sourceType: 'module', plugins: ['jsx', 'typescript'], errorRecovery: true });
    } catch {
      continue;
    }

    traverse(ast, {
      JSXElement(p: any) {
        const opening = p.node.openingElement;
        if (opening.name.type !== 'JSXIdentifier' || opening.name.name !== 'Swiper') return;

        filesWithSwiper.add(relativePath);
        const attrs = opening.attributes;
        const line = p.node.loc?.start.line || 0;

        const effectType = attrString(attrs, 'effect');
        const slidesPerView = attrSlidesPerView(attrs);
        const centeredSlides = attrBoolean(attrs, 'centeredSlides');
        const spaceBetween = attrNumber(attrs, 'spaceBetween') ?? 0;
        const loop = attrBoolean(attrs, 'loop');
        const autoplayDelay = attrObjectNumber(attrs, 'autoplay', 'delay');
        const autoplay = autoplayDelay !== undefined || attrBoolean(attrs, 'autoplay');
        const hasEffect3D = effectType === 'coverflow' || effectType === 'cards' || effectType === 'flip';

        const visualMode: VisualMode =
          effectType === 'coverflow' ? 'coverflow'
          : effectType === 'cards' ? 'cards'
          : (typeof slidesPerView === 'number' && slidesPerView > 1) || slidesPerView === 'auto' ? 'multi-visible'
          : 'single';

        const mapSource = findMapSourceIdentifier(p.node.children);
        let isDataDriven: boolean;
        let dataSource: string | undefined;
        let slideCount = 0;
        let confidence = 0.7;

        if (mapSource) {
          if (isDestructuredProp(content, mapSource)) {
            isDataDriven = true;
            dataSource = `prop: ${mapSource}`;
            confidence = 0.85;
          } else if (staticArrays.has(mapSource)) {
            const info = staticArrays.get(mapSource)!;
            isDataDriven = false;
            dataSource = `static array: ${info.file}`;
            slideCount = info.length;
            confidence = 0.9;
          } else {
            isDataDriven = true;
            dataSource = `unresolved identifier: ${mapSource}`;
            confidence = 0.5;
          }
        } else {
          // Không tìm thấy `.map()` — đếm trực tiếp <SwiperSlide> con tĩnh (nếu có)
          const staticSlideCount = p.node.children.filter(
            (c: any) => c.type === 'JSXElement' && c.openingElement.name.type === 'JSXIdentifier' && c.openingElement.name.name === 'SwiperSlide'
          ).length;
          isDataDriven = false;
          slideCount = staticSlideCount;
          confidence = staticSlideCount > 0 ? 0.8 : 0.4;
        }

        const navigation = findNavigationAssets(content);
        const indicators = findIndicators(content);

        idx++;
        swipers.push({
          id: `swiper.${idx}`,
          type: 'swiper',
          source: `${relativePath}:${line}`,
          library,
          visualMode,
          effectType,
          slidesPerView,
          centeredSlides,
          spaceBetween,
          slideCount,
          navigation,
          indicators,
          config: { autoplay, loop, delay: autoplayDelay },
          isDataDriven,
          dataSource,
          hasEffect3D,
          uploadMode: 'simple',
          confidence,
          needsManualReview: confidence < 0.7,
        });
      },
    });
  }

  return {
    swipers,
    filesScanned: files.length,
    filesWithSwiper: filesWithSwiper.size,
  };
}

export function detectLibrary(content: string): SwiperLibrary {
  for (const [source, lib] of Object.entries(SWIPER_IMPORT_SOURCES)) {
    const re = new RegExp(`from\\s+['"]${source.replace(/[/\\]/g, '\\/')}['"]`);
    if (re.test(content)) return lib;
  }
  return 'unknown';
}

/** Tìm mọi `export const NAME = [ ... ]` (mảng literal top-level) trong 1 file,
 * đăng ký vào map toàn project để resolve nguồn slide xuyên file. */
function collectStaticArrayExports(
  content: string,
  file: string,
  out: Map<string, { file: string; length: number }>
) {
  let ast;
  try {
    ast = parse(content, { sourceType: 'module', plugins: ['jsx', 'typescript'], errorRecovery: true });
  } catch {
    return;
  }
  traverse(ast, {
    VariableDeclarator(p: any) {
      if (p.node.id.type !== 'Identifier') return;
      if (p.node.init?.type !== 'ArrayExpression') return;
      out.set(p.node.id.name, { file, length: p.node.init.elements.length });
    },
  });
}

/** X trong `X.map(...)` có phải 1 prop được destructure ở tham số component
 * không (vd. `({ slides = [] }: Props) =>`), hay 1 field trong `type Props = {...}`? */
export function isDestructuredProp(content: string, name: string): boolean {
  const destructurePattern = new RegExp(`\\(\\s*\\{[^}]*\\b${name}\\b[^}]*\\}[^)]*\\)\\s*(:|=>)`, 's');
  if (destructurePattern.test(content)) return true;
  const propsTypePattern = new RegExp(`\\b${name}\\s*\\??\\s*:`, '');
  return propsTypePattern.test(content) && /type\s+Props\s*=|interface\s+Props/.test(content);
}

export function findMapSourceIdentifier(children: any[]): string | null {
  for (const child of children) {
    if (child.type !== 'JSXExpressionContainer') continue;
    const expr = child.expression;
    if (
      expr?.type === 'CallExpression' &&
      expr.callee?.type === 'MemberExpression' &&
      expr.callee.property?.type === 'Identifier' &&
      expr.callee.property.name === 'map' &&
      expr.callee.object?.type === 'Identifier'
    ) {
      return expr.callee.object.name;
    }
  }
  return null;
}

export function findNavigationAssets(content: string): { prev: string; next: string } {
  const prevMatch = content.match(/["'`]([^"'`]*btn-prev[^"'`]*\.(png|jpg|jpeg|svg|webp))["'`]/i);
  const nextMatch = content.match(/["'`]([^"'`]*btn-next[^"'`]*\.(png|jpg|jpeg|svg|webp))["'`]/i);
  return { prev: prevMatch?.[1] || '', next: nextMatch?.[1] || '' };
}

export function findIndicators(content: string): string[] {
  if (/Go to slide/i.test(content)) {
    return ['custom dot indicators (JS-rendered buttons, not image assets)'];
  }
  return [];
}

function attrList(attrs: any[], name: string): any {
  return attrs.find((a: any) => a.type === 'JSXAttribute' && a.name.name === name);
}

export function attrBoolean(attrs: any[], name: string): boolean {
  const a = attrList(attrs, name);
  if (!a) return false;
  if (!a.value) return true; // shorthand: <Swiper loop />
  if (a.value.type === 'JSXExpressionContainer') {
    const expr = a.value.expression;
    if (expr.type === 'BooleanLiteral') return expr.value;
    return true; // vd. autoplay={{ delay: 3000 }} — object truthy
  }
  return true;
}

export function attrNumber(attrs: any[], name: string): number | undefined {
  const a = attrList(attrs, name);
  if (!a?.value || a.value.type !== 'JSXExpressionContainer') return undefined;
  const expr = a.value.expression;
  return expr.type === 'NumericLiteral' ? expr.value : undefined;
}

export function attrString(attrs: any[], name: string): string | undefined {
  const a = attrList(attrs, name);
  if (!a?.value) return undefined;
  if (a.value.type === 'StringLiteral') return a.value.value;
  if (a.value.type === 'JSXExpressionContainer' && a.value.expression.type === 'StringLiteral') {
    return a.value.expression.value;
  }
  return undefined;
}

export function attrSlidesPerView(attrs: any[]): number | 'auto' {
  const a = attrList(attrs, 'slidesPerView');
  if (!a?.value) return 1;
  // A bare JSX string attribute (slidesPerView="auto") parses as a direct
  // StringLiteral, NOT wrapped in a JSXExpressionContainer — only checking
  // the expression-container case (as this used to) silently misses the
  // more idiomatic bare-string form and would misclassify visualMode as
  // 'single' instead of 'multi-visible'.
  if (a.value.type === 'StringLiteral' && a.value.value === 'auto') return 'auto';
  if (a.value.type === 'JSXExpressionContainer') {
    const expr = a.value.expression;
    if (expr.type === 'NumericLiteral') return expr.value;
    if (expr.type === 'StringLiteral' && expr.value === 'auto') return 'auto';
  }
  return 1;
}

export function attrObjectNumber(attrs: any[], name: string, key: string): number | undefined {
  const a = attrList(attrs, name);
  if (!a?.value || a.value.type !== 'JSXExpressionContainer') return undefined;
  const expr = a.value.expression;
  if (expr.type !== 'ObjectExpression') return undefined;
  const prop = expr.properties.find(
    (pr: any) => pr.type === 'ObjectProperty' && pr.key.type === 'Identifier' && pr.key.name === key
  );
  return prop?.value?.type === 'NumericLiteral' ? prop.value.value : undefined;
}
