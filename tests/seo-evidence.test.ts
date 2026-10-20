import { describe, expect, it } from 'vitest';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import sharp from 'sharp';
import { SeoContent } from '@picjp/contracts';
import { verifyEvidenceAssets } from '../apps/web/src/server/seo/evidence';
import { buildEvidenceManifest } from '../scripts/seo/build-evidence';
import { baselineContent } from '../apps/web/src/server/seo/content';

describe('evaluated public sample asset integrity', () => {
  it('requires real image bytes matching immutable content hashes, and rejects missing or changed evidence', async () => {
    // Synthetic pixel tests only prove file verification. They are never published as model examples.
    const root = await mkdtemp(join(tmpdir(), 'picmoko-seo-evidence-'));
    try {
      await mkdir(join(root, 'seo-examples'));
      const bytes = await sharp({ create: { width: 1, height: 1, channels: 3, background: '#ffffff' } }).png().toBuffer();
      const digest = createHash('sha256').update(bytes).digest('hex'), path = `/seo-examples/fixture-${digest}.png`;
      const content = SeoContent.parse({ ...baselineContent('/ja/tools/remove_person')!.content, indexable: true, examples: [{ before: path, after: path, model_profile_version: 'fixture-only', rights_review: 'isolated-synthetic-test', evaluated_at: new Date().toISOString(), evaluation_reference: 'test-not-real-model-evaluation' }] });
      await expect(verifyEvidenceAssets(content, await buildEvidenceManifest(root))).rejects.toThrow('SEO_EVIDENCE_REQUIRED');
      await writeFile(root + path, bytes); await expect(verifyEvidenceAssets(content, await buildEvidenceManifest(root))).resolves.toBeUndefined();
      await writeFile(root + path, 'not an image'); await expect(buildEvidenceManifest(root)).rejects.toThrow('SEO_EVIDENCE_HASH_MISMATCH');
      expect(SeoContent.safeParse({ ...content, examples: [{ ...content.examples[0], before: '/seo-examples/../../private.png' }] }).success).toBe(false);
      await expect(verifyEvidenceAssets({ ...content, examples: [{ ...content.examples[0], evaluated_at: '2099-01-01T00:00:00Z' }] }, {})).rejects.toThrow('SEO_INVALID_CONTENT');
    } finally { await rm(root, { recursive: true, force: true }); }
  });
});
