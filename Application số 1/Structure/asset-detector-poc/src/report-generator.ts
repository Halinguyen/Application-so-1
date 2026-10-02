import { DetectionResult } from './types.js';

export function generateReport(r: DetectionResult): string {
  const lines: string[] = [];
  lines.push(`# Detection Report: ${r.gameId}\n`);
  lines.push(`- **Framework:** ${r.framework.framework} ${r.framework.version}`);
  if (r.framework.router) lines.push(`- **Router:** ${r.framework.router}`);
  if (r.framework.packageManager) lines.push(`- **Package Manager:** ${r.framework.packageManager}`);
  if (r.framework.styling) lines.push(`- **Styling:** ${r.framework.styling}`);
  lines.push(`- **Detected at:** ${r.detectedAt}`);
  lines.push(`- **Duration:** ${r.durationMs}ms\n`);

  // Summary
  const autoManaged = r.assets.filter(a => a.isAutoManaged).length;
  const external = r.assets.filter(a => a.isExternal).length;

  lines.push(`## Summary\n`);
  lines.push(`- Total assets: ${r.summary.totalAssets}`);
  lines.push(`- Total references: ${r.summary.totalReferences}`);
  lines.push(`- Avg confidence: ${r.summary.avgConfidence.toFixed(2)}`);
  lines.push(`- Needs manual review: ${r.summary.needsReview}`);
  lines.push(`- Auto-managed (favicon): ${autoManaged}`);
  lines.push(`- External URLs: ${external}\n`);

  lines.push(`\n## Dynamic Blocks (${r.summary.totalDynamicBlocks})\n`);
  if (r.dynamicBlocks.length === 0) {
    lines.push('_(none detected)_');
  } else {
    for (const block of r.dynamicBlocks) {
      lines.push(`### ${block.label} (${block.type})`);
      lines.push(`- Source: \`${block.source}\``);
      lines.push(`- API: \`${block.apiEndpoint}\``);
      lines.push(`- Section: ${block.section}`);
      lines.push(`- Confidence: ${block.confidence.toFixed(2)}`);
      lines.push(`- Params:`);
      for (const p of block.params) {
        lines.push(`  - \`${p.name}\` (env: \`${p.envKey}\`, type: ${p.type}${p.required ? ', required' : ''})`);
      }
      if (block.tabs && block.tabs.length > 0) {
        lines.push(`- Tabs:`);
        for (const t of block.tabs) {
          lines.push(`  - "${t.label}" (mode: ${t.mode}, scope: ${t.scope})`);
        }
      }
      lines.push('');
    }
  }

  lines.push(`\n## Swipers (${r.summary.totalSwipers})\n`);
  if (r.swipers.length === 0) {
    lines.push('_(none detected)_');
  } else {
    for (const s of r.swipers) {
      lines.push(`### ${s.id} — ${s.visualMode}${s.effectType ? ` (${s.effectType})` : ''}`);
      lines.push(`- Source: \`${s.source}\``);
      lines.push(`- Library: ${s.library}`);
      lines.push(`- slidesPerView: ${s.slidesPerView}, centeredSlides: ${s.centeredSlides}, spaceBetween: ${s.spaceBetween}`);
      lines.push(`- Slide count: ${s.slideCount || '(unknown — resolved at runtime)'}`);
      lines.push(`- Data source: ${s.isDataDriven ? 'data-driven' : 'static'}${s.dataSource ? ` (${s.dataSource})` : ''}`);
      lines.push(`- Autoplay: ${s.config.autoplay}${s.config.delay ? ` (${s.config.delay}ms)` : ''}, Loop: ${s.config.loop}`);
      if (s.navigation.prev || s.navigation.next) {
        lines.push(`- Navigation: prev=\`${s.navigation.prev || '—'}\`, next=\`${s.navigation.next || '—'}\``);
      }
      if (s.indicators.length > 0) {
        lines.push(`- Indicators: ${s.indicators.join(', ')}`);
      }
      lines.push(`- Confidence: ${s.confidence.toFixed(2)}${s.needsManualReview ? ' ⚠️ needs review' : ''}`);
      lines.push('');
    }
  }

  const responsive = r.assets.filter(a => a.responsive === 'per-breakpoint');
  const shared = r.assets.filter(a => a.responsive === 'shared');

  lines.push(`\n## Responsive\n`);
  lines.push(`- Per-breakpoint groups: ${responsive.length}`);
  lines.push(`- Shared assets: ${shared.length}`);
  lines.push('');

  if (responsive.length > 0) {
    lines.push(`### Responsive Groups (${responsive.length})\n`);
    for (const a of responsive) {
      lines.push(`- \`${a.canonicalPath}\``);
      const variants = a.variants || {};
      for (const [bp, v] of Object.entries(variants)) {
        lines.push(`  - ${bp}: \`${v.path}\` (${(v.size / 1024).toFixed(1)} KB)`);
      }
      if (a.missingBreakpoints && a.missingBreakpoints.length > 0) {
        lines.push(`  - ⚠️ missing: ${a.missingBreakpoints.join(', ')}`);
      }
    }
  }

  // By Type
  lines.push(`## By Type\n`);
  for (const [type, count] of Object.entries(r.summary.byType)) {
    if (count > 0) lines.push(`- ${type}: ${count}`);
  }

  // By Section (sorted by count desc)
  lines.push(`\n## By Section\n`);
  const sections = Object.entries(r.summary.bySection)
    .sort(([, a], [, b]) => b - a);
  for (const [section, count] of sections) {
    lines.push(`- ${section}: ${count}`);
  }

  // Needs Review
  lines.push(`\n## Assets Needing Review\n`);
  const needsReview = r.assets.filter(a => a.needsManualReview);
  if (needsReview.length === 0) {
    lines.push('_(none)_');
  } else {
    for (const a of needsReview.slice(0, 30)) {
      lines.push(`- \`${a.canonicalPath}\` (confidence: ${a.confidence.toFixed(2)}, section: ${a.section})`);
    }
    if (needsReview.length > 30) {
      lines.push(`- _(+${needsReview.length - 30} more)_`);
    }
  }

  // Top assets by reference count
  lines.push(`\n## Top 20 Assets by Reference Count\n`);
  const top = [...r.assets].sort((a, b) => b.referenceCount - a.referenceCount).slice(0, 20);
  for (const a of top) {
    lines.push(`- \`${a.canonicalPath}\` — ${a.referenceCount} refs (confidence: ${a.confidence.toFixed(2)}, section: ${a.section})`);
  }

  lines.push(`\n## Constraints Summary\n`);
  const withDims = r.assets.filter(a => a.dimensions).length;
  const withConstraints = r.assets.filter(a => a.constraints).length;
  const withMeta = r.assets.filter(a => a.metadata).length;
  const operatorEditable = r.assets.filter(a => a.metadata?.operatorEditable).length;

  lines.push(`- With dimensions: ${withDims}`);
  lines.push(`- With constraints: ${withConstraints}`);
  lines.push(`- With metadata: ${withMeta}`);
  lines.push(`- Operator editable: ${operatorEditable}`);
  lines.push('');

  lines.push(`### Assets by Group\n`);
  const byGroup: Record<string, number> = {};
  for (const a of r.assets) {
    const g = a.metadata?.group || 'other';
    byGroup[g] = (byGroup[g] || 0) + 1;
  }
  for (const [group, count] of Object.entries(byGroup).sort(([, a], [, b]) => b - a)) {
    lines.push(`- ${group}: ${count}`);
  }

  return lines.join('\n');
}
