import { afterEach,beforeEach,describe,expect,it,vi } from 'vitest';
import { R2Storage } from '../apps/web/src/server/storage';

// Exercise the installed AWS signer, not the in-memory storage port. No R2 calls
// or real credentials are needed to produce and inspect a presigned request.
describe('R2 upload signatures',()=>{
 beforeEach(()=>{
  vi.stubEnv('R2_ACCOUNT_ID','signing-fixture');
  vi.stubEnv('R2_ACCESS_KEY_ID','fixture-access-key');
  vi.stubEnv('R2_SECRET_ACCESS_KEY','fixture-secret-key');
  vi.stubEnv('R2_BUCKET','fixture-bucket');
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-10-19T00:00:00.000Z'));
 });
 afterEach(()=>{vi.useRealTimers();vi.unstubAllEnvs();});

 it('signs the declared MIME type and exact upload length without an empty-body checksum',async()=>{
  const url=new URL(await new R2Storage().signPut('staging/owner/image','image/png',1024));
  expect(url.hostname).toBe('fixture-bucket.signing-fixture.r2.cloudflarestorage.com');
  expect(url.pathname).toBe('/staging/owner/image');
  expect(url.searchParams.get('X-Amz-SignedHeaders')?.split(';')).toEqual(['content-length','content-type','host']);
  expect(url.searchParams.get('X-Amz-Expires')).toBe('300');
  expect(url.searchParams.get('X-Amz-Content-Sha256')).toBe('UNSIGNED-PAYLOAD');
  expect([...url.searchParams.keys()].some(key=>key.toLowerCase().startsWith('x-amz-checksum-'))).toBe(false);
  expect(url.searchParams.has('x-amz-sdk-checksum-algorithm')).toBe(false);
 });

 it('produces a different signature when the signed MIME type or length changes',async()=>{
  const storage=new R2Storage();
  const png=new URL(await storage.signPut('staging/owner/image','image/png',1024));
  const otherLength=new URL(await storage.signPut('staging/owner/image','image/png',2048));
  const otherType=new URL(await storage.signPut('staging/owner/image','image/jpeg',1024));
  expect(png.searchParams.get('X-Amz-Date')).toBe(otherLength.searchParams.get('X-Amz-Date'));
  expect(png.searchParams.get('X-Amz-Date')).toBe(otherType.searchParams.get('X-Amz-Date'));
  const signatures=[png,otherLength,otherType].map(url=>url.searchParams.get('X-Amz-Signature'));
  expect(signatures.every(signature=>/^[a-f0-9]{64}$/.test(signature??''))).toBe(true);
  expect(new Set(signatures).size).toBe(3);
 });
});
