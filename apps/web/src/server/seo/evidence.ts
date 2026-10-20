import type { SeoContent } from '@picjp/contracts';
import manifest from '../../content/seo/evidence-manifest.json';
import { SeoError } from './repository';

export type EvidenceManifest = Record<string, { sha256: string; width: number; height: number }>;
export function evidenceAsset(path:string,assets:EvidenceManifest=manifest){
  const expected=/-([a-f0-9]{64})\.(png|jpg|webp)$/.exec(path)?.[1],asset=assets[path];
  if(!expected||asset?.sha256!==expected||!Number.isSafeInteger(asset.width)||!Number.isSafeInteger(asset.height)||asset.width<1||asset.height<1)throw new SeoError('SEO_EVIDENCE_REQUIRED',400);
  return asset;
}
/** Build-time verified hashes are bundled as data; public photos need no server filesystem access. */
export async function verifyEvidenceAssets(content: SeoContent, assets: EvidenceManifest = manifest, now = Date.now()) {
  for (const example of content.examples) {
    if (Date.parse(example.evaluated_at) > now + 300000) throw new SeoError('SEO_INVALID_CONTENT', 400);
    for (const path of [example.before, example.after]) {
      evidenceAsset(path,assets);
    }
  }
}
