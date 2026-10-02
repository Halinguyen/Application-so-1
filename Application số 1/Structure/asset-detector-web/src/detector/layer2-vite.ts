import { AssetReference } from './types';
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

// Vite/SPA repos put footer under src/layout/ or src/components/, not a
// dedicated app-router segment — same naming convention as Next.js repos,
// so the same patterns apply here.
function isFooterFile(filePath: string): boolean {
  return /[/\\]footer[/\\]|[/\\]sdk[/\\]|Footer\.(tsx|jsx|ts|js)$|footer\.(tsx|jsx|ts|js)$/i.test(filePath);
}

// Object-literal keys commonly used to pass an asset path into a CDN/base-path
// helper, e.g. `handleConcatPathImage({ path: "/assets/x.png" })` or
// `{ image: "/assets/btn.png" }` — a pattern that's rare in Next.js (which
// mostly uses `next/image` with a direct `src`) but idiomatic in Vite repos
// that prefix every asset with an env-driven CDN base URL.
const ASSET_OBJECT_KEYS = new Set(['path', 'src', 'image', 'icon', 'background', 'poster', 'thumbnail', 'url', 'imageArt']);

export interface Layer2Result {
  references: AssetReference[];
  footerFilesSkipped: number;
  filesScanned: number;
}

export async function layer2ScanVite(repoPath: string): Promise<Layer2Result> {
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

    // Vite-idiomatic: new URL('./logo.png', import.meta.url).href
    NewExpression(p: any) {
      const callee = p.node.callee;
      if (callee.type !== 'Identifier' || callee.name !== 'URL') return;
      const [arg0, arg1] = p.node.arguments;
      const isImportMetaUrl =
        arg1?.type === 'MemberExpression' &&
        arg1.object?.type === 'MetaProperty' &&
        arg1.property?.name === 'url';
      if (!isImportMetaUrl || arg0?.type !== 'StringLiteral') return;
      if (isAssetPath(arg0.value)) {
        refs.push({
          file,
          line: p.node.loc?.start.line || 0,
          type: 'dynamic-import',
          assetPath: arg0.value,
          usage: 'new URL(..., import.meta.url)',
          confidence: 1.0,
        });
      }
    },

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

    // { path: "/assets/x.png" } passed into a CDN-prefix helper, or a plain
    // asset descriptor object — the dominant pattern in this repo family
    // (handleConcatPathImage({ path: "..." }), button/tab/slide descriptor
    // arrays), which the Next.js scanner's JSXAttribute/import checks miss
    // because the literal never sits directly in a `src=`.
    ObjectProperty(p: any) {
      const key = p.node.key;
      const keyName = key.type === 'Identifier' ? key.name : key.type === 'StringLiteral' ? key.value : null;
      if (!keyName || !ASSET_OBJECT_KEYS.has(keyName)) return;

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

    TemplateLiteral(p: any) {
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
// path out of a JSX attribute — needed because this repo's real usage is
// `src={siteConfig?.site_logo_url || "/assets/x.png"}`, not a bare string.
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
  // Note: CallExpression args like handleConcatPathImage({ path: "..." })
  // are deliberately NOT resolved here — the standalone ObjectProperty
  // visitor below already captures that literal once, generically, in any
  // context (JSX attribute or not). Resolving it here too would record the
  // same reference twice for every JSX usage.
  return null;
}

function isAssetPath(str: string): boolean {
  if (!str) return false;
  return /\.(jpg|jpeg|png|gif|svg|webp|avif|ico|mp4|webm|mov|mp3|wav|woff2?|ttf|otf)(\?|$)/i.test(str)
    || /^[@~.]?\/?(assets|images|img|media|static|fonts|videos)\//i.test(str);
}
