import { afterEach, describe, expect, it, vi } from 'vitest';
import { getEffectExamples, getLocalEffectExamples, localExampleAsset } from '../apps/web/src/server/effect-examples';
import { GET } from '../apps/web/src/app/api/local-effect-samples/[asset]/route';

const fs = vi.hoisted(() => ({ access: vi.fn(), readFile: vi.fn() }));
vi.mock('node:fs/promises', () => fs);
afterEach(() => { vi.unstubAllEnvs(); vi.clearAllMocks(); });
describe('Private UI effect samples', () => {
  it('never reads or lists private images in a production build, even when files exist', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    const demos = await getEffectExamples();
    expect(demos).toHaveLength(6);
    expect(demos.every(example => example.scope === 'published' && example.provenance === 'imagegen')).toBe(true);
    expect(demos.some(example => example.before.includes('/api/local-effect-samples/'))).toBe(false);
    expect(await getLocalEffectExamples()).toEqual([]);
    expect(await localExampleAsset('original.webp')).toBeNull();
    const response = await GET(new Request('http://localhost/api/local-effect-samples/original.webp'), { params: Promise.resolve({ asset: 'original.webp' }) });
    expect(response.status).toBe(404);
    expect(fs.access).not.toHaveBeenCalled();
    expect(fs.readFile).not.toHaveBeenCalled();
  });
  it('rejects unknown names, traversal and remote host requests without reading files', async () => {
    vi.stubEnv('NODE_ENV', 'development');
    expect(await localExampleAsset('../original.webp')).toBeNull();
    expect(await localExampleAsset('experiment.json')).toBeNull();
    const response = await GET(new Request('https://picmoko.com/api/local-effect-samples/original.webp'), { params: Promise.resolve({ asset: 'original.webp' }) });
    expect(response.status).toBe(404);
    expect(fs.readFile).not.toHaveBeenCalled();
  });
  it('serves only local development images without shared caching or indexing', async () => {
    vi.stubEnv('NODE_ENV', 'development');
    fs.readFile.mockResolvedValue(Buffer.from('image'));
    const response = await GET(new Request('http://127.0.0.1/api/local-effect-samples/original.webp'), { params: Promise.resolve({ asset: 'original.webp' }) });
    expect(response.status).toBe(200);
    expect(response.headers.get('Cache-Control')).toBe('private, no-store');
    expect(response.headers.get('X-Robots-Tag')).toContain('noarchive');
    expect(response.headers.get('Content-Type')).toBe('image/webp');
  });
  it('fails closed if the local set is incomplete and preserves experimental provenance', async () => {
    vi.stubEnv('NODE_ENV', 'development');
    fs.access.mockRejectedValueOnce(new Error('missing image'));
    expect(await getLocalEffectExamples()).toEqual([]);
    fs.access.mockResolvedValue(undefined);
    const examples = await getLocalEffectExamples();
    expect(examples).toHaveLength(6);
    expect(new Set(examples.map(example => example.before)).size).toBe(1);
    expect(examples.filter(example => example.experimental).map(example => example.id)).toEqual(['clay-felt', 'paper-cut']);
    expect(examples.every(example => example.scope === 'local-preview')).toBe(true);
  });
  it('uses the approved six-function set in development without opening private experiments', async () => {
    vi.stubEnv('NODE_ENV', 'development');
    const demos = await getEffectExamples();
    expect(new Set(demos.map(example => example.before)).size).toBe(6);
    expect(demos.every(example => example.provenance === 'imagegen')).toBe(true);
    expect(fs.access).not.toHaveBeenCalled();
    expect(fs.readFile).not.toHaveBeenCalled();
  });
});
