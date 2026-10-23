import { createHash } from 'node:crypto';
import { z } from 'zod';
import { IdentityPoolClient } from 'google-auth-library';
import { getVercelOidcToken } from '@vercel/oidc';

const name = z.string().regex(/^[a-z][a-z0-9-]{0,62}$/);
const configSchema = z.object({
  project: z.string().regex(/^[a-z][a-z0-9-]{4,28}[a-z0-9]$/),
  number: z.string().regex(/^\d+$/), region: name, queue: name, pool: name, provider: name,
  enqueuer: z.string().email(), invoker: z.string().email(),
  worker: z.string().url().refine(value => {
    const u = new URL(value);
    return u.protocol === 'https:' && u.hostname.endsWith('.run.app') && !u.username && !u.password && !u.port && u.pathname === '/' && !u.search && !u.hash;
  }),
});
export type DispatchConfig = z.infer<typeof configSchema>;
export function dispatchConfig(env: Record<string,string|undefined> = process.env): DispatchConfig | null {
  if (env.WORKER_DISPATCH_ENABLED !== 'true') return null;
  // Preview/local tokens must never enqueue production generation.
  if (env.VERCEL_ENV !== 'production') throw new Error('DISPATCH_CONFIGURATION');
  const c = configSchema.parse({project:env.GCP_PROJECT_ID,number:env.GCP_PROJECT_NUMBER,
    region:env.WORKER_TASKS_REGION,queue:env.WORKER_TASKS_QUEUE,pool:env.GCP_WORKLOAD_IDENTITY_POOL_ID,
    provider:env.GCP_WORKLOAD_IDENTITY_POOL_PROVIDER_ID,enqueuer:env.GCP_SERVICE_ACCOUNT_EMAIL,
    invoker:env.WORKER_TASKS_INVOKER_EMAIL,worker:env.WORKER_SERVICE_URL});
  if (![c.enqueuer,c.invoker].every(email=>email.endsWith(`@${c.project}.iam.gserviceaccount.com`))) throw new Error('DISPATCH_CONFIGURATION');
  return c;
}
export async function workloadToken(c: DispatchConfig): Promise<string> {
  const auth = new IdentityPoolClient({
    type:'external_account',
    audience:`//iam.googleapis.com/projects/${c.number}/locations/global/workloadIdentityPools/${c.pool}/providers/${c.provider}`,
    subject_token_type:'urn:ietf:params:oauth:token-type:jwt', token_url:'https://sts.googleapis.com/v1/token',
    service_account_impersonation_url:`https://iamcredentials.googleapis.com/v1/projects/-/serviceAccounts/${c.enqueuer}:generateAccessToken`,
    subject_token_supplier:{getSubjectToken:()=>getVercelOidcToken()},
    scopes:['https://www.googleapis.com/auth/cloud-platform'],
    transporterOptions:{timeout:2500,retry:false},
  });
  const result = await auth.getAccessToken();
  if (!result.token) throw new Error('DISPATCH_AUTH');
  return result.token;
}
export async function enqueueWorkerJob(jobId:string,c:DispatchConfig,token:()=>Promise<string>,send:typeof fetch=fetch) {
  z.string().uuid().parse(jobId);
  const parent=`projects/${c.project}/locations/${c.region}/queues/${c.queue}`;
  const taskId=createHash('sha256').update(`worker-v1:${jobId.toLowerCase()}`).digest('hex');
  const accessToken=await token();
  const response=await send(`https://cloudtasks.googleapis.com/v2/${parent}/tasks`,{
    method:'POST',signal:AbortSignal.timeout(3000),redirect:'error',
    headers:{Authorization:`Bearer ${accessToken}`,'Content-Type':'application/json'},
    body:JSON.stringify({task:{name:`${parent}/tasks/${taskId}`,dispatchDeadline:'300s',httpRequest:{
      url:`${new URL(c.worker).origin}/internal/v1/run-job`,httpMethod:'POST',headers:{'Content-Type':'application/json'},
      body:Buffer.from(JSON.stringify({contract_version:'1.0.0',job_id:jobId})).toString('base64'),
      oidcToken:{serviceAccountEmail:c.invoker,audience:new URL(c.worker).origin},
    }}}),
  });
  // An identical deterministic task may already exist after a lost create response.
  await response.body?.cancel();
  if (!response.ok && response.status!==409) throw new Error('DISPATCH_UNAVAILABLE');
}
export async function wakeWorkerJob(jobId:string) {
  const c=dispatchConfig();if(!c)return 'disabled' as const;
  await enqueueWorkerJob(jobId,c,()=>workloadToken(c));
  return 'enqueued' as const;
}
