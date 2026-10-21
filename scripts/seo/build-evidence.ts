import { readFile, readdir, lstat, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { join, resolve, dirname, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import type { EvidenceManifest } from '../../apps/web/src/server/seo/evidence';

export async function buildEvidenceManifest(publicDirectory: string): Promise<EvidenceManifest> {
  const manifest: EvidenceManifest = {};
  async function scan(path: string, relative: string) {
    let files: string[]; try { files = (await readdir(path)).sort(); } catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT' && relative === '') return; throw error; }
    for (const name of files) {
      const file = join(path, name), info = await lstat(file), rel = relative ? relative + '/' + name : name;
      if (info.isSymbolicLink()) throw new Error('SEO_EVIDENCE_SYMLINK_FORBIDDEN');
      if (info.isDirectory()) { await scan(file, rel); continue; }
      const match = /^[-a-zA-Z0-9_]+-([a-f0-9]{64})\.(png|jpg|webp)$/.exec(name);
      if (!info.isFile() || !match || !/^[-a-zA-Z0-9_/]+\.(png|jpg|webp)$/.test(rel) || info.size > 5242880) throw new Error('SEO_EVIDENCE_INVALID_FILE');
      const bytes = await readFile(file), digest = createHash('sha256').update(bytes).digest('hex');
      if (digest !== match[1]) throw new Error('SEO_EVIDENCE_HASH_MISMATCH');
      const meta = await sharp(bytes, { limitInputPixels: 24000000, animated: true }).metadata();
      if (!['png','jpeg','webp'].includes(meta.format || '') || !meta.width || !meta.height || (meta.pages || 1) > 1) throw new Error('SEO_EVIDENCE_INVALID_IMAGE');
      manifest['/seo-examples/' + rel] = { sha256: digest, width: meta.width, height: meta.height };
    }
  }
  await scan(join(publicDirectory, 'seo-examples'), ''); return manifest;
}
async function main() {
  const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
  const manifest = await buildEvidenceManifest(join(root, 'apps/web/public'));
  const output = JSON.stringify(manifest, null, 2) + '\n', target = join(root, 'apps/web/src/content/seo/evidence-manifest.json');
  if (process.argv.includes('--check')) { if (await readFile(target, 'utf8') !== output) throw new Error('SEO_EVIDENCE_MANIFEST_STALE'); }
  else await writeFile(target, output);
  console.log(JSON.stringify({ evidence_assets_verified: Object.keys(manifest).length }));
}
if (process.argv[1] && basename(process.argv[1]) === 'build-evidence.ts') main().catch(() => { console.error('SEO_EVIDENCE_BUILD_FAILED'); process.exitCode = 1; });
