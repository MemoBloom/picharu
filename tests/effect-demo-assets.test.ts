import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { publishedEffectDemos } from '../apps/web/src/lib/effect-demo-catalog';
import manifest from '../docs/design/EFFECT_DEMO_ASSETS.json';

describe('Approved synthetic demonstration assets', () => {
  it('ships each actual paired file at its recorded hash and keeps the six inputs distinct', () => {
    expect(publishedEffectDemos).toHaveLength(6);
    expect(new Set(publishedEffectDemos.map(example => example.toolId)).size).toBe(6);
    expect(new Set(publishedEffectDemos.map(example => example.before)).size).toBe(6);
    for (const example of publishedEffectDemos) for (const side of ['before', 'after'] as const) {
      const asset = manifest.assets.find(asset => asset.tool_id === example.toolId && asset.side === side);
      expect(asset?.url).toBe(example[side]);
      expect(asset?.product_model_evaluation).toBe(false);
      const bytes = readFileSync(path.join(process.cwd(), 'apps/web/public', example[side]));
      expect(createHash('sha256').update(bytes).digest('hex')).toBe(asset?.sha256);
      expect(bytes.subarray(8, 12).toString()).toBe('WEBP');
    }
    expect(manifest.assets.reduce((sum, asset) => sum + asset.bytes, 0)).toBeLessThan(1_500_000);
  });
});
