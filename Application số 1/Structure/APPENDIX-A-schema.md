# APPENDIX A — Full Type Schema

## Core Types

### FrameworkInfo
```typescript
export type Framework = 'nextjs' | 'dotnet-mvc';

export interface FrameworkInfo {
  framework: Framework;
  version: string;
  router?: 'app' | 'pages';
  packageManager?: 'npm' | 'yarn' | 'pnpm';
  nodeVersion?: string;
  targetFramework?: string;
  appDllName?: string;
  styling: 'tailwind' | 'bootstrap' | 'scss' | 'css-modules' | 'unknown';
  confidence: number;
}