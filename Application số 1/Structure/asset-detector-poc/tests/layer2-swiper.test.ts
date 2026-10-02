import { describe, it, expect } from 'vitest';
import { parse } from '@babel/parser';
import {
  attrBoolean,
  attrNumber,
  attrString,
  attrSlidesPerView,
  attrObjectNumber,
  isDestructuredProp,
  findMapSourceIdentifier,
  findNavigationAssets,
  findIndicators,
  detectLibrary,
} from '../src/layer2-swiper.js';

/** Parse a single JSX element expression and return its opening-element attrs + children. */
function parseJsxElement(jsx: string): { attrs: any[]; children: any[] } {
  const ast = parse(`const __x = (\n${jsx}\n);`, { sourceType: 'module', plugins: ['jsx', 'typescript'] });
  const decl = (ast.program.body[0] as any).declarations[0];
  const jsxEl = decl.init;
  return { attrs: jsxEl.openingElement.attributes, children: jsxEl.children };
}

describe('JSX attribute helpers', () => {
  it('attrBoolean: shorthand attribute (no value) is true', () => {
    const { attrs } = parseJsxElement('<Swiper loop />');
    expect(attrBoolean(attrs, 'loop')).toBe(true);
  });

  it('attrBoolean: missing attribute is false', () => {
    const { attrs } = parseJsxElement('<Swiper />');
    expect(attrBoolean(attrs, 'loop')).toBe(false);
  });

  it('attrBoolean: explicit BooleanLiteral is honored both ways', () => {
    const t = parseJsxElement('<Swiper loop={true} />');
    const f = parseJsxElement('<Swiper loop={false} />');
    expect(attrBoolean(t.attrs, 'loop')).toBe(true);
    expect(attrBoolean(f.attrs, 'loop')).toBe(false);
  });

  it('attrBoolean: an object-literal value (e.g. autoplay={{ delay: 3000 }}) counts as present/true', () => {
    const { attrs } = parseJsxElement('<Swiper autoplay={{ delay: 3000 }} />');
    expect(attrBoolean(attrs, 'autoplay')).toBe(true);
  });

  it('attrNumber: reads a numeric literal, undefined when absent', () => {
    const { attrs } = parseJsxElement('<Swiper spaceBetween={10} />');
    expect(attrNumber(attrs, 'spaceBetween')).toBe(10);
    expect(attrNumber(attrs, 'missing')).toBeUndefined();
  });

  it('attrString: reads a plain string attribute and an expression-container string', () => {
    const plain = parseJsxElement('<Swiper effect="coverflow" />');
    const wrapped = parseJsxElement('<Swiper effect={"coverflow"} />');
    expect(attrString(plain.attrs, 'effect')).toBe('coverflow');
    expect(attrString(wrapped.attrs, 'effect')).toBe('coverflow');
  });

  it('attrSlidesPerView: numeric, "auto", and default-to-1 when absent', () => {
    expect(attrSlidesPerView(parseJsxElement('<Swiper slidesPerView={1.3} />').attrs)).toBe(1.3);
    expect(attrSlidesPerView(parseJsxElement('<Swiper slidesPerView="auto" />').attrs)).toBe('auto');
    expect(attrSlidesPerView(parseJsxElement('<Swiper />').attrs)).toBe(1);
  });

  it('attrObjectNumber: extracts a nested numeric field from an object-literal prop', () => {
    const { attrs } = parseJsxElement('<Swiper autoplay={{ delay: 10000 }} />');
    expect(attrObjectNumber(attrs, 'autoplay', 'delay')).toBe(10000);
    expect(attrObjectNumber(attrs, 'autoplay', 'missingKey')).toBeUndefined();
  });
});

describe('isDestructuredProp', () => {
  it('recognizes a prop destructured in the component parameter list', () => {
    const content = `const NewsMainSlider = ({ slides = [], imageClassName }: Props) => { return null; };`;
    expect(isDestructuredProp(content, 'slides')).toBe(true);
  });

  it('recognizes a field declared in a Props type even without seeing the destructure', () => {
    const content = `type Props = { slides?: SlideNewsItem[]; };\nconst X = (p: Props) => null;`;
    expect(isDestructuredProp(content, 'slides')).toBe(true);
  });

  it('returns false for an identifier that is not a prop at all (e.g. an imported constant)', () => {
    const content = `import { SlideHome } from "../../utils/constant";\nconst X = () => SlideHome.map(() => null);`;
    expect(isDestructuredProp(content, 'SlideHome')).toBe(false);
  });
});

describe('findMapSourceIdentifier', () => {
  it('finds the array identifier in `X.map(...)` among JSX children', () => {
    const { children } = parseJsxElement('<Swiper>{SlideHome.map((s) => <SwiperSlide />)}</Swiper>');
    expect(findMapSourceIdentifier(children)).toBe('SlideHome');
  });

  it('returns null when there is no .map() call among the children', () => {
    const { children } = parseJsxElement('<Swiper><SwiperSlide /><SwiperSlide /></Swiper>');
    expect(findMapSourceIdentifier(children)).toBeNull();
  });
});

describe('findNavigationAssets', () => {
  it('detects prev/next button asset paths from surrounding file content', () => {
    const content = `src={handleConcatPathImage({ path: "/assets/home/news/1920/btn-prev.png" })}\nsrc={handleConcatPathImage({ path: "/assets/home/news/1920/btn-next.png" })}`;
    const nav = findNavigationAssets(content);
    expect(nav.prev).toBe('/assets/home/news/1920/btn-prev.png');
    expect(nav.next).toBe('/assets/home/news/1920/btn-next.png');
  });

  it('returns empty strings when no navigation buttons exist', () => {
    const nav = findNavigationAssets('nothing relevant here');
    expect(nav).toEqual({ prev: '', next: '' });
  });
});

describe('findIndicators', () => {
  it('detects the custom dot-indicator pattern', () => {
    expect(findIndicators('aria-label={`Go to slide ${i + 1}`}')).toHaveLength(1);
  });

  it('returns an empty array when no indicator pattern is present', () => {
    expect(findIndicators('nothing relevant')).toEqual([]);
  });
});

describe('detectLibrary', () => {
  it('identifies the swiper library from its import source', () => {
    expect(detectLibrary(`import { Swiper } from 'swiper/react';`)).toBe('swiper');
  });

  it('falls back to "unknown" when no recognized import is present', () => {
    expect(detectLibrary(`import { Swiper } from 'some-other-lib';`)).toBe('unknown');
  });
});
