import { wakeWorkerJob } from './worker-dispatch';
import { createRouter } from './router';
import { SupabaseDatabase } from './supabase';
import { R2Storage } from './storage';
import { StripePayments } from './payments';
export const handle=createRouter({wakeJob:wakeWorkerJob,db:new SupabaseDatabase(),storage:new R2Storage(),payments:new StripePayments(),fetch:(...args)=>globalThis.fetch(...args),now:()=>new Date()});
