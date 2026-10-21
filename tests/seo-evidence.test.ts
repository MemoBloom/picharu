import { describe, expect, it } from 'vitest';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import sharp from 'sharp';
import { SeoContent } from '@picjp/contracts';
import { evidenceAsset, verifyEvidenceAssets } from '../apps/web/src/server/seo/evidence';
import { buildEvidenceManifest } from '../scripts/seo/build-evidence';
import { baselineContent } from '../apps/web/src/server/seo/content';

describe('evaluated public sample asset integrity', () => {
  it('preserves non-square dimensions and rejects invalid intrinsic image sizes', () => {
    const sha256 = 'a'.repeat(64), path = `/seo-examples/fixture-${sha256}.png`;
    expect(evidenceAsset(path, { [path]: { sha256, width: 300, height: 450 } })).toMatchObject({ width: 300, height: 450 });
    for (const size of [0, -1, 1.5, Infinity, Number.MAX_SAFE_INTEGER + 1]) {
      expect(() => evidenceAsset(path, { [path]: { sha256, width: size, height: 450 } })).toThrow('SEO_EVIDENCE_REQUIRED');
      expect(() => evidenceAsset(path, { [path]: { sha256, width: 300, height: size } })).toThrow('SEO_EVIDENCE_REQUIRED');
    }
  });
  it('requires real image bytes matching immutable content hashes, and rejects missing or changed evidence', async () => {
    // Synthetic pixel tests only prove file verification. They are never published as model examples.
    const root = await mkdtemp(join(tmpdir(), 'picmoko-seo-evidence-'));
    try {
      await mkdir(join(root, 'seo-examples'));
      const bytes = await sharp({ create: { width: 1, height: 1, channels: 3, background: '#ffffff' } }).png().toBuffer();
      const digest = createHash('sha256').update(bytes).digest('hex'), path = `/seo-examples/fixture-${digest}.png`;
      const content = SeoContent.parse({ ...baselineContent('/ja/tools/change_background')!.content, indexable: true, examples: [{ before: path, after: path, model_profile_version: 'fixture-only', rights_review: 'isolated-synthetic-test', evaluated_at: new Date().toISOString(), evaluation_reference: 'test-not-real-model-evaluation' }] });
      await expect(verifyEvidenceAssets(content, await buildEvidenceManifest(root))).rejects.toThrow('SEO_EVIDENCE_REQUIRED');
      await writeFile(root + path, bytes); await expect(verifyEvidenceAssets(content, await buildEvidenceManifest(root))).resolves.toBeUndefined();
      await writeFile(root + path, 'not an image'); await expect(buildEvidenceManifest(root)).rejects.toThrow('SEO_EVIDENCE_HASH_MISMATCH');
      expect(SeoContent.safeParse({ ...content, examples: [{ ...content.examples[0], before: '/seo-examples/../../private.png' }] }).success).toBe(false);
      await expect(verifyEvidenceAssets({ ...content, examples: [{ ...content.examples[0], evaluated_at: '2099-01-01T00:00:00Z' }] }, {})).rejects.toThrow('SEO_INVALID_CONTENT');
    } finally { await rm(root, { recursive: true, force: true }); }
  });
});
