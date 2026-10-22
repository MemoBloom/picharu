import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';

// Executed from apps/web after the real production build, with local samples present.
const directory = path.join(process.cwd(), '.next', 'server');
let checked = 0;
async function check(folder) {
  for (const entry of await readdir(folder, { withFileTypes: true })) {
    const filename = path.join(folder, entry.name);
    if (entry.isDirectory()) { await check(filename); continue; }
    if (entry.name.endsWith('.nft.json')) {
      checked++;
      const trace = JSON.parse(await readFile(filename, 'utf8'));
      if (trace.files.some(file => file.replaceAll('\\', '/').includes('/.local/'))) {
        throw new Error(`Private local files found in deployment trace: ${path.relative(directory, filename)}`);
      }
    }
    if (entry.name.endsWith('.html') && (await readFile(filename, 'utf8')).includes('/api/local-effect-samples/')) {
      throw new Error(`Local-only sample URL found in production HTML: ${path.relative(directory, filename)}`);
    }
  }
}
await check(directory);
if (!checked) throw new Error('No production file traces found; private sample check did not run.');
console.log(`Effect sample privacy: ${checked} production traces checked; no private local files or sample URLs shipped.`);
