import { AssetReference } from './types.js';
import { parse } from '@babel/parser';
import _traverse from '@babel/traverse';
import fg from 'fast-glob';
import { readFile } from 'fs/promises';
import path from 'path';

const traverse = (_traverse as any).default || _traverse;

const IGNORE_PATTERNS = [
  '**/node_modules/**',
  '**/.next/**',
  '**/dist/**',
  '**/*.min.js',
];

function isFooterFile(filePath: string): boolean {
  return /[/\\]footer[/\\]|[/\\]sdk[/\\]|Footer\.(tsx|jsx)$|footer\.(tsx|jsx)$/i.test(filePath);
}

export interface Layer2Result {
  references: AssetReference[];
  footerFilesSkipped: number;
  filesScanned: number;
}

export async function layer2ScanNextJs(repoPath: string): Promise<Layer2Result> {
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

function extractJsxValue(attr: any): string | null {
  if (!attr.value) return null;
  if (attr.value.type === 'StringLiteral') return attr.value.value;
  if (attr.value.type === 'JSXExpressionContainer') {
    const expr = attr.value.expression;
    if (expr.type === 'StringLiteral') return expr.value;
    if (expr.type === 'TemplateLiteral') {
      return expr.quasis.map((q: any) => q.value.raw).join('${}');
    }
  }
  return null;
}

function isAssetPath(str: string): boolean {
  if (!str) return false;
  return /\.(jpg|jpeg|png|gif|svg|webp|avif|ico|mp4|webm|mov|mp3|wav|woff2?|ttf|otf)(\?|$)/i.test(str)
    || /^[@~.]?\/?(assets|images|img|media|static|fonts|videos)\//i.test(str);
}
