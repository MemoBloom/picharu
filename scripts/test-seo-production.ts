import { spawn } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';

async function main() {
  const port = 3167, base = `http://127.0.0.1:${port}`;
  // Do not accidentally inspect an unrelated process already listening on the test port.
  try { await fetch(base, { signal: AbortSignal.timeout(300) }); throw new Error('SEO_TEST_PORT_IN_USE'); } catch (error) { if ((error as Error).message === 'SEO_TEST_PORT_IN_USE') throw error; }
  const server = spawn(process.execPath, ['../../node_modules/next/dist/bin/next', 'start', '--hostname', '127.0.0.1', '--port', String(port)], { cwd: 'apps/web', stdio: ['ignore', 'pipe', 'pipe'], env: process.env });
  let exited = false, log = '';
  server.stdout.on('data', chunk => { log = (log + chunk).slice(-4000); }); server.stderr.on('data', chunk => { log = (log + chunk).slice(-4000); });
  server.on('exit', () => { exited = true; });
  try {
    let ready = false;
    for (let i = 0; i < 100; i++) { if (exited) throw new Error('SEO_TEST_SERVER_EXITED: ' + log); try { const r = await fetch(base + '/api/health', { signal: AbortSignal.timeout(500) }); if (r.ok) { ready = true; break; } } catch {} await delay(100); }
    if (!ready) throw new Error('SEO_TEST_SERVER_NOT_READY');
    const child = spawn(process.execPath, ['--import', 'tsx', 'scripts/test-seo-http.ts'], { stdio: 'inherit', env: { ...process.env, SEO_TEST_BASE: base, SEO_TEST_INDEXING: process.env.SEO_INDEXING_ENABLED === 'true' && process.env.VERCEL_ENV !== 'preview' ? 'true' : 'false' } });
    const code = await new Promise<number | null>((resolve, reject) => { child.on('exit', resolve); child.on('error', reject); });
    if (code !== 0) throw new Error('SEO_PRODUCTION_HTTP_FAILED');
  } finally { if (!exited) { server.kill('SIGTERM'); for (let i = 0; i < 30 && !exited; i++) await delay(100); if (!exited) server.kill('SIGKILL'); } }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
