import type { SeoContent } from '@picjp/contracts';
import manifest from '../../content/seo/evidence-manifest.json';
import { SeoError } from './repository';

export type EvidenceManifest = Record<string, { sha256: string; width: number; height: number }>;
/** Build-time verified hashes are bundled as data; public photos need no server filesystem access. */
export async function verifyEvidenceAssets(content: SeoContent, assets: EvidenceManifest = manifest, now = Date.now()) {
  for (const example of content.examples) {
    if (Date.parse(example.evaluated_at) > now + 300000) throw new SeoError('SEO_INVALID_CONTENT', 400);
    for (const path of [example.before, example.after]) {
      const expected = /-([a-f0-9]{64})\.(png|jpg|webp)$/.exec(path)?.[1];
      if (!expected || assets[path]?.sha256 !== expected || !assets[path]?.width || !assets[path]?.height) throw new SeoError('SEO_EVIDENCE_REQUIRED', 400);
    }
  }
}
