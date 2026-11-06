import { FrameworkInfo } from './types.js';
import { existsSync } from 'fs';
import { readFile } from 'fs/promises';
import path from 'path';
import fg from 'fast-glob';

export async function detectFramework(repoPath: string): Promise<FrameworkInfo> {
  // Check .NET first
  const csprojFiles = await fg('**/*.csproj', {
    cwd: repoPath,
    absolute: true,
    ignore: ['**/bin/**', '**/obj/**'],
  });
  if (csprojFiles.length > 0) {
    return detectDotNet(csprojFiles[0]);
  }

  // Check Next.js
  const pkgPath = path.join(repoPath, 'package.json');
  if (existsSync(pkgPath)) {
    const pkg = JSON.parse(await readFile(pkgPath, 'utf-8'));
    if (pkg.dependencies?.next) {
      return detectNextJs(repoPath, pkg);
    }

    // Check Vite SPA
    const deps = { ...pkg.dependencies, ...pkg.devDependencies };
    if (deps.vite) {
      return detectVite(repoPath, pkg);
    }
  }

  throw new Error('Unsupported framework: not Next.js, Vite, or .NET');
}

async function detectDotNet(csprojPath: string): Promise<FrameworkInfo> {
  const content = await readFile(csprojPath, 'utf-8');
  const tfm = content.match(/<TargetFramework>([^<]+)<\/TargetFramework>/)?.[1] || 'net8.0';
  return {
    framework: 'dotnet-mvc',
    version: tfm,
    confidence: 1.0,
  };
}

async function detectVite(repoPath: string, pkg: any): Promise<FrameworkInfo> {
  const deps = { ...pkg.dependencies, ...pkg.devDependencies };

  const packageManager: 'npm' | 'yarn' | 'pnpm' =
    existsSync(path.join(repoPath, 'pnpm-lock.yaml')) ? 'pnpm'
    : existsSync(path.join(repoPath, 'yarn.lock')) ? 'yarn'
    : 'npm';

  const styling = deps.tailwindcss ? 'tailwind' : 'unknown';

  return {
    framework: 'vite-spa',
    version: deps.vite,
    router: 'spa',
    packageManager,
    styling,
    nodeVersion: pkg.engines?.node,
    confidence: 0.9,
  };
}

async function detectNextJs(repoPath: string, pkg: any): Promise<FrameworkInfo> {
  const router: 'app' | 'pages' =
    existsSync(path.join(repoPath, 'src/app')) || existsSync(path.join(repoPath, 'app'))
      ? 'app' : 'pages';

  const packageManager: 'npm' | 'yarn' | 'pnpm' =
    existsSync(path.join(repoPath, 'pnpm-lock.yaml')) ? 'pnpm'
    : existsSync(path.join(repoPath, 'yarn.lock')) ? 'yarn'
    : 'npm';

  const deps = { ...pkg.dependencies, ...pkg.devDependencies };
  const styling = deps.tailwindcss ? 'tailwind' : 'unknown';

  return {
    framework: 'nextjs',
    version: pkg.dependencies.next,
    router,
    packageManager,
    styling,
    nodeVersion: pkg.engines?.node || '20',
    confidence: 1.0,
  };
}
