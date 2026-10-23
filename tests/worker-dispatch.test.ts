import { afterEach, describe, expect, it, vi } from 'vitest';
import { dispatchConfig, enqueueWorkerJob } from '../apps/web/src/server/worker-dispatch';
const id='00000000-0000-4000-8000-000000000001';
const env={WORKER_DISPATCH_ENABLED:'true',VERCEL_ENV:'production',GCP_PROJECT_ID:'fixture-project',GCP_PROJECT_NUMBER:'12345',
 WORKER_TASKS_REGION:'asia-northeast1',WORKER_TASKS_QUEUE:'worker',GCP_WORKLOAD_IDENTITY_POOL_ID:'vercel',GCP_WORKLOAD_IDENTITY_POOL_PROVIDER_ID:'production',
 GCP_SERVICE_ACCOUNT_EMAIL:'web@fixture-project.iam.gserviceaccount.com',WORKER_TASKS_INVOKER_EMAIL:'invoke@fixture-project.iam.gserviceaccount.com',WORKER_SERVICE_URL:'https://fixture.asia-northeast1.run.app'};
afterEach(()=>{vi.restoreAllMocks();vi.useRealTimers();});
describe('durable Worker dispatch (offline)',()=>{
 it('defaults off and rejects preview, malformed and foreign project configuration',()=>{
  expect(dispatchConfig({})).toBeNull();
  for(const patch of [{VERCEL_ENV:'preview'},{WORKER_SERVICE_URL:'http://127.0.0.1'},{WORKER_SERVICE_URL:'https://fixture.run.app/path'},
    {WORKER_TASKS_INVOKER_EMAIL:'other@another-project.iam.gserviceaccount.com'},{WORKER_TASKS_QUEUE:'../../escape'}]) expect(()=>dispatchConfig({...env,...patch})).toThrow();
 });
 it('creates a deterministic OIDC task with only the fixed job ID and a bounded deadline',async()=>{
  const send=vi.fn(async()=>new Response('{}'));const token=vi.fn(async()=>'offline-only-token');
  const c=dispatchConfig(env)!;await enqueueWorkerJob(id,c,token,send);await enqueueWorkerJob(id,c,token,send);
  expect(send).toHaveBeenCalledTimes(2);
  const [url,options]=send.mock.calls[0] as unknown as [string,RequestInit];
  expect(url).toBe('https://cloudtasks.googleapis.com/v2/projects/fixture-project/locations/asia-northeast1/queues/worker/tasks');
  const task=JSON.parse(String(options.body)).task;
  expect(task.name).toBe(JSON.parse(String((send.mock.calls[1] as unknown as [string,RequestInit])[1].body)).task.name);
  expect(task.dispatchDeadline).toBe('300s');expect(task.httpRequest.url).toBe('https://fixture.asia-northeast1.run.app/internal/v1/run-job');
  expect(task.httpRequest.oidcToken).toEqual({serviceAccountEmail:env.WORKER_TASKS_INVOKER_EMAIL,audience:env.WORKER_SERVICE_URL});
  expect(JSON.parse(Buffer.from(task.httpRequest.body,'base64').toString())).toEqual({contract_version:'1.0.0',job_id:id});
  expect(String(options.body)).not.toMatch(/prompt|image|offline-only-token/);expect(options.redirect).toBe('error');
 });
 it('starts the task request deadline after credential acquisition, not before it',async()=>{
  vi.useFakeTimers();let release!:(token:string)=>void;
  const pendingToken=new Promise<string>(resolve=>{release=resolve;});
  const send=vi.fn(async(_url:URL | RequestInfo,init?:RequestInit)=>{expect(init?.signal?.aborted).toBe(false);return new Response('{}');});
  const pending=enqueueWorkerJob(id,dispatchConfig(env)!,()=>pendingToken,send);
  await vi.advanceTimersByTimeAsync(5000);expect(send).not.toHaveBeenCalled();release('fixture-token');await pending;expect(send).toHaveBeenCalledTimes(1);
 });
 it('accepts duplicate task conflict but fails on denied, unavailable or lost enqueue response',async()=>{
  const c=dispatchConfig(env)!;const token=async()=>'fixture-token';
  await expect(enqueueWorkerJob(id,c,token,async()=>new Response('',{status:409}))).resolves.toBeUndefined();
  for(const status of [400,401,403,500,503]) await expect(enqueueWorkerJob(id,c,token,async()=>new Response('',{status}))).rejects.toThrow('DISPATCH_UNAVAILABLE');
  await expect(enqueueWorkerJob(id,c,token,async()=>{throw Error('lost response');})).rejects.toThrow();
  const send=vi.fn();await expect(enqueueWorkerJob('bad-id',c,token,send)).rejects.toThrow();expect(send).not.toHaveBeenCalled();
 });
});
