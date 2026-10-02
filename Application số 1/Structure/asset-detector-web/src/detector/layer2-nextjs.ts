import { AssetReference } from './types';
import { parse } from '@babel/parser';
import _traverse from '@babel/traverse';
import fg from 'fast-glob';
import { readFile } from 'fs/promises';
import path from 'path';

const traverse = (_traverse as any).default || _traverse;

const IGNORE_PATTERNS = [
  '**/node_modules/**',
  '**/.next/**',
  '**/*.min.js',
];

function isFooterFile(filePath: string): boolean {
  return /[/\\]footer[/\\]|[/\\]sdk[/\\]|Footer\.(tsx|jsx|ts|js)$|footer\.(tsx|jsx|ts|js)$/i.test(filePath);
}

export interface Layer2Result {
  references: AssetReference[];
  footerFilesSkipped: number;
  filesScanned: number;
}

/**
 * Next.js counterpart to layer2-vite.ts. Piloted on than-ma-ao-hoa
 * (t018-than-ma-website) — see MULTI-GAME-ROLLOUT-PLAN.md for why a single
 * scanner needs several detection strategies here rather than one dominant
 * pattern: a survey of the 4 Nhóm B repos found each uses a DIFFERENT way to
 * reference assets (static import + next/image, an env-driven const +
 * template literal, plain public/ string paths, or `process.env` read
 * inline at the call site) — unlike the Vite fleet, which shares one
 * fingerprint. This scanner therefore doesn't assume any one of those is
 * "the" pattern; it detects all of them generically and leaves branching
 * per game out of it entirely.
 */
export async function layer2ScanNextjs(repoPath: string): Promise<Layer2Result> {
  const codeFiles = await fg([
    '**/*.{ts,tsx,js,jsx}',
    '**/*.{css,scss}',
  ], {
    cwd: repoPath,
    ignore: IGNORE_PATTERNS,
    absolute: true,
  });

  const references: AssetReference[] = [];
  let footerFilesSkipped = 0;

  for (const file of codeFiles) {
    const relativePath = path.relative(repoPath, file).replace(/\\/g, '/');

    if (isFooterFile(relativePath)) {
      footerFilesSkipped++;
      continue;
    }

    const content = await readFile(file, 'utf-8');
    const ext = path.extname(file);

    if (['.ts', '.tsx', '.js', '.jsx'].includes(ext)) {
      references.push(...scanJsCode(relativePath, content));
    } else if (['.css', '.scss'].includes(ext)) {
      references.push(...scanCssCode(relativePath, content));
    }
  }

  return {
    references,
    footerFilesSkipped,
    filesScanned: codeFiles.length,
  };
}

function scanJsCode(file: string, content: string): AssetReference[] {
  const refs: AssetReference[] = [];

  let ast;
  try {
    ast = parse(content, {
      sourceType: 'module',
      plugins: ['jsx', 'typescript'],
      errorRecovery: true,
    });
  } catch {
    return refs;
  }

  traverse(ast, {
    // Covers both a plain `import x from './y.png'` and the static import
    // that feeds `next/image`'s `<Image src={x} />` (dau-than-tuyet-the's
    // dominant pattern) — the import source string is the same either way.
    ImportDeclaration(p: any) {
      const source = p.node.source.value;
      if (isAssetPath(source)) {
        refs.push({
          file,
          line: p.node.loc?.start.line || 0,
          type: 'import',
          assetPath: source,
          usage: 'static-import',
          confidence: 1.0,
        });
      }
    },

    // Covers <img src="/images/x.png">, <Image src={x} /> (x resolved via
    // ImportDeclaration above), plain public/ string paths
    // (phong-ma-daosi), and an env-prefixed template literal sitting
    // directly in the attribute (than-ma-ao-hoa: `src={`${process.env.X}/images/...`}`).
    JSXAttribute(p: any) {
      const name = p.node.name.name;
      if (!['src', 'href', 'poster', 'srcSet'].includes(name)) return;

      const value = extractJsxValue(p.node);
      if (value && isAssetPath(value)) {
        refs.push({
          file,
          line: p.node.loc?.start.line || 0,
          type: 'jsx-attr',
          attribute: name,
          assetPath: value,
          usage: 'jsx',
          confidence: 1.0,
        });
      }
    },

    // Object-literal asset descriptors, e.g. than-ma-ao-hoa's
    // `dataMainSlide` array: `{ btnFigure: \`${pathImage}/...\` }`. Unlike
    // the Vite scanner, this doesn't gate on a fixed key-name allowlist —
    // the 4 Nhóm B repos surveyed don't share a common key naming
    // convention the way the Vite fleet shares `handleConcatPathImage`'s
    // `path` key, so any object property whose literal VALUE looks like an
    // asset path counts (isAssetPath already requires a real media
    // extension or an assets/images/media-style path prefix, so this stays
    // narrow rather than matching arbitrary strings).
    ObjectProperty(p: any) {
      const key = p.node.key;
      const keyName = key.type === 'Identifier' ? key.name : key.type === 'StringLiteral' ? key.value : null;
      if (!keyName) return;

      const value = p.node.value;
      let literal: string | null = null;
      if (value.type === 'StringLiteral') literal = value.value;
      else if (value.type === 'TemplateLiteral') literal = value.quasis.map((q: any) => q.value.raw).join('${}');

      if (literal && isAssetPath(literal)) {
        refs.push({
          file,
          line: p.node.loc?.start.line || 0,
          type: value.type === 'TemplateLiteral' ? 'template-literal' : 'jsx-attr',
          attribute: keyName,
          assetPath: literal,
          usage: `{ ${keyName}: ... }`,
          confidence: value.type === 'TemplateLiteral' ? 0.7 : 0.9,
        });
      }
    },

    // Standalone template literals — an env-prefixed asset path built
    // outside a JSX attribute (e.g. in a services/constants file). Skips
    // ones already captured by JSXAttribute or ObjectProperty above (both
    // visit the very same TemplateLiteral node when it's their direct
    // child) to avoid recording the same usage twice.
    TemplateLiteral(p: any) {
      if (p.findParent((pp: any) => pp.isJSXAttribute())) return;
      if (p.parentPath?.isObjectProperty() && p.parentPath.node.value === p.node) return;
      const raw = p.node.quasis.map((q: any) => q.value.raw).join('${}');
      if (isAssetPath(raw)) {
        refs.push({
          file,
          line: p.node.loc?.start.line || 0,
          type: 'template-literal',
          assetPath: raw,
          usage: 'dynamic',
          confidence: 0.5,
        });
      }
    },
  });

  return refs;
}

function scanCssCode(file: string, content: string): AssetReference[] {
  const refs: AssetReference[] = [];

  const urlMatches = content.matchAll(/url\(['"]?([^'")]+)['"]?\)/g);
  for (const match of urlMatches) {
    const url = match[1];
    if (isAssetPath(url)) {
      refs.push({
        file,
        line: content.substring(0, match.index).split('\n').length,
        type: 'css-url',
        assetPath: url,
        usage: 'css',
        confidence: 1.0,
      });
    }
  }

  return refs;
}

// Walks StringLiteral / TemplateLiteral / LogicalExpression (`a || b`,
// `a ?? b`) / ConditionalExpression (`a ? b : c`) to pull a literal asset
// path out of a JSX attribute — needed because real usage is often
// `src={siteConfig?.logo_url || "/images/x.png"}`, not a bare string.
function extractJsxValue(attr: any): string | null {
  if (!attr.value) return null;
  if (attr.value.type === 'StringLiteral') return attr.value.value;
  if (attr.value.type === 'JSXExpressionContainer') {
    return extractExpressionValue(attr.value.expression);
  }
  return null;
}

function extractExpressionValue(expr: any): string | null {
  if (!expr) return null;
  if (expr.type === 'StringLiteral') return expr.value;
  if (expr.type === 'TemplateLiteral') {
    return expr.quasis.map((q: any) => q.value.raw).join('${}');
  }
  if (expr.type === 'LogicalExpression') {
    return extractExpressionValue(expr.right) ?? extractExpressionValue(expr.left);
  }
  if (expr.type === 'ConditionalExpression') {
    return extractExpressionValue(expr.consequent) ?? extractExpressionValue(expr.alternate);
  }
  return null;
}

function isAssetPath(str: string): boolean {
  if (!str) return false;
  return /\.(jpg|jpeg|png|gif|svg|webp|avif|ico|mp4|webm|mov|mp3|wav|woff2?|ttf|otf)(\?|$)/i.test(str)
    || /^[@~.]?\/?(assets|images|img|media|static|fonts|videos)\//i.test(str);
}
