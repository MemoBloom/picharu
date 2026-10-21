import { z } from 'zod';

// Additive HTTP schemas. Tool keys are stable identifiers, not a fixed chart count.
const Uuid = z.string().uuid();
const ToolKey = z.string().regex(/^[a-z][a-z0-9_]{0,99}$/);
export const ConsoleEnvironment = z.enum(['test', 'live', 'unclassified']);
export const ConsoleDevice = z.enum(['mobile', 'tablet', 'desktop', 'unknown']);
export const ConsoleRole = z.enum(['analyst', 'finance', 'administrator']);
export const ConsoleSession = z.object({
  user_id: Uuid, roles: z.array(ConsoleRole),
  permissions: z.array(z.enum(['analytics:read', 'finance:read'])),
  environment: ConsoleEnvironment, collection_enabled: z.boolean(),
}).strict();

const observation = {
  event_id: Uuid, occurred_at: z.string().datetime({ offset: true }),
  device: ConsoleDevice, page_view_id: Uuid,
};
export const ConsoleBrowserEvent = z.discriminatedUnion('name', [
  z.object({ ...observation, name: z.literal('tool_exposed'), tool_id: ToolKey,
    exposure_id: Uuid, visible_ms: z.number().int().min(1000).max(600000),
    visible_ratio: z.number().min(0.5).max(1),
  }).strict(),
  z.object({ ...observation, name: z.literal('tool_selected'), tool_id: ToolKey, exposure_id: Uuid }).strict(),
  z.object({ ...observation, name: z.literal('result_viewed'), job_id: Uuid }).strict(),
  z.object({ ...observation, name: z.literal('feedback_submitted'), job_id: Uuid,
    rating: z.enum(['positive', 'negative']),
  }).strict(),
]);
export type ConsoleBrowserEvent = z.infer<typeof ConsoleBrowserEvent>;
export const ConsoleEventReceipt = z.object({
  event_id: Uuid, recording: z.enum(['recorded', 'duplicate', 'disabled']),
}).strict();
export const ConsoleDownloadRequest = z.object({ action_id: Uuid, device: ConsoleDevice }).strict();
export const ConsoleDownloadResponse = z.object({
  download_url: z.string().url(), expires_at: z.string().datetime(),
  action_id: Uuid, recording: z.enum(['recorded', 'duplicate', 'disabled', 'unavailable']),
}).strict();

export type ConsoleEventReceipt=z.infer<typeof ConsoleEventReceipt>;
