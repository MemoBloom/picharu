import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { publishedEffectDemos } from '../apps/web/src/lib/effect-demo-catalog';
import manifest from '../docs/design/EFFECT_DEMO_ASSETS.json';

describe('Synthetic demonstration assets', () => {
  it('ships each actual pair and both composite inputs at their recorded hashes', () => {
    expect(publishedEffectDemos).toHaveLength(23);
    expect(new Set(publishedEffectDemos.map(example => example.toolId)).size).toBe(18);
    expect(new Set(publishedEffectDemos.flatMap(example => [example.before, ...(example.additionalInputs || []).map(input => input.src)])).size).toBe(19);
    for (const example of publishedEffectDemos) for (const side of ['before', 'after'] as const) {
      const asset = manifest.assets.find(asset => asset.tool_id === example.toolId && asset.side === side && asset.url === example[side]);
      expect(asset?.url).toBe(example[side]);
      expect(asset?.product_model_evaluation).toBe(false);
    }
    expect(new Set(manifest.assets.map(asset => asset.url)).size).toBe(42);
    for (const asset of manifest.assets) {
      const bytes = readFileSync(path.join(process.cwd(), 'apps/web/public', asset.url));
      expect(createHash('sha256').update(bytes).digest('hex')).toBe(asset?.sha256);
      expect(bytes.subarray(8, 12).toString()).toBe('WEBP');
    }
    for (const example of publishedEffectDemos) {
      const binding = manifest.cases.find(item => item.tool_id === example.toolId && item.result === example.after);
      expect(binding?.inputs).toEqual([example.before, ...(example.additionalInputs || []).map(input => input.src)]);
    }
    expect(manifest.assets.reduce((sum, asset) => sum + asset.bytes, 0)).toBeLessThan(6_000_000);
  });
});
