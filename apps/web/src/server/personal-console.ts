import { z } from 'zod';
import {
  PersonalSummary, PersonalLedgerQuery, PersonalLedgerPage,
  PersonalJobsQuery, PersonalJobsPage, PersonalWorksQuery, PersonalWorksPage,
} from '@picjp/contracts';
import { ApiError, response } from './errors';
import type { Dependencies } from './ports';

export async function personalConsoleRoute(deps: Dependencies, request: Request, userId: string, requestId: string): Promise<Response | null> {
  if (request.method !== 'GET') return null;
  const url = new URL(request.url);
  const path = url.pathname.replace(/\/$/, '');
  if (!['/api/dashboard', '/api/credits/ledger', '/api/account/jobs', '/api/account/works'].includes(path)) return null;
  if ([...url.searchParams.keys()].length !== new Set(url.searchParams.keys()).size) throw new ApiError('INVALID_REQUEST');
  const query = Object.fromEntries(url.searchParams);
  function output(schema: z.ZodTypeAny, data: unknown) {
    const parsed = schema.safeParse(data);
    if (!parsed.success) throw new ApiError('SERVICE_UNAVAILABLE', 503, true);
    return response(parsed.data, requestId);
  }
  if (path === '/api/dashboard') {
    z.object({}).strict().parse(query);
    return output(PersonalSummary, await deps.db.rpc('app_personal_summary', { p_user_id: userId }));
  }
  if (path === '/api/credits/ledger') {
    const parsed = PersonalLedgerQuery.parse(query);
    return output(PersonalLedgerPage, await deps.db.rpc('app_personal_ledger', { p_user_id: userId, p_query: parsed }));
  }
  const works = path === '/api/account/works';
  const parsed = (works ? PersonalWorksQuery : PersonalJobsQuery).parse(query);
  return output(works ? PersonalWorksPage : PersonalJobsPage, await deps.db.rpc('app_personal_jobs', { p_user_id: userId, p_query: parsed, p_works: works }));
}
