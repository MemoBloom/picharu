import {
  ConsoleBrowserEvent, ConsoleDownloadRequest, ConsoleDownloadResponse,
  ConsoleEventReceipt, ConsoleSession, Id,
} from '@picjp/contracts';
import type { Dependencies, Row } from './ports';
import { ApiError, json, response } from './errors';

/** Invoked only after the common verified Supabase bearer and rate checks. */
export async function consoleRoute(
  deps: Dependencies, request: Request, userId: string, requestId: string,
  enabledTools: () => Set<string>,
): Promise<Response | null> {
  const path = new URL(request.url).pathname.replace(/\/$/, '');
  if (path === '/api/admin/session' && request.method === 'GET') {
    const data = await deps.db.rpc('app_console_authorize', {
      p_user_id: userId, p_permission: 'analytics:read', p_request_id: requestId, p_action: 'session',
    });
    return response(ConsoleSession.parse(data), requestId);
  }
  if (path === '/api/analytics/events' && request.method === 'POST') {
    const event = await json(request, ConsoleBrowserEvent);
    // This is still a browser observation, never proof of actual screen visibility.
    if ('tool_id' in event && !enabledTools().has(event.tool_id)) throw new ApiError('UNSUPPORTED_CAPABILITY', 409);
    const receipt = await deps.db.rpc('app_console_record_event', { p_user_id: userId, p_event: event });
    return response(ConsoleEventReceipt.parse(receipt), requestId);
  }
  const match = path.match(/^\/api\/images\/([^/]+)\/download$/);
  if (match && request.method === 'POST') {
    const imageId = Id.parse(match[1]);
    const body = await json(request, ConsoleDownloadRequest);
    const action = await deps.db.rpc<Row>('app_console_begin_download', {
      p_user_id: userId, p_image_id: imageId, p_action_id: body.action_id, p_device: body.device,
    });
    let downloadUrl: string;
    try {
      downloadUrl = await deps.storage.signGet(action.storage_key, true);
    } catch {
      if (action.capture) {
        try { await deps.db.rpc('app_console_finish_download', { p_user_id: userId, p_action_id: body.action_id, p_signed: false }); }
        catch { /* The durable pending intent exposes the unresolved write. */ }
      }
      throw new ApiError('SERVICE_UNAVAILABLE', 503, true);
    }
    let recording: 'recorded' | 'duplicate' | 'disabled' | 'unavailable' = 'disabled';
    if (action.capture) {
      try {
        const receipt = await deps.db.rpc<{ recording: 'recorded' | 'duplicate' | 'disabled' }>('app_console_finish_download', {
          p_user_id: userId, p_action_id: body.action_id, p_signed: true,
        });
        recording = receipt.recording;
      } catch (error) {
        // Ownership/deletion/idempotency errors must not be hidden. A telemetry
        // outage after signing keeps the download usable with an explicit gap.
        if (error instanceof ApiError && error.status < 500) throw error;
        recording = 'unavailable';
        console.error(JSON.stringify({ request_id: requestId, error_code: 'CONSOLE_DOWNLOAD_RECORDING_PENDING' }));
      }
    }
    return response(ConsoleDownloadResponse.parse({
      download_url: downloadUrl, expires_at: new Date(deps.now().getTime() + 300000).toISOString(),
      action_id: body.action_id, recording,
    }), requestId);
  }
  return null;
}
