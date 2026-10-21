// @vitest-environment jsdom
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { EditRequest } from '@picjp/contracts';
import { EditorWorkspace } from '../apps/web/src/components/editor-workspace';
import { loadDraft, saveDraft, type EditorDraft } from '../apps/web/src/lib/drafts';

const state = vi.hoisted(() => ({ owner: 'owner-a', router: { push: vi.fn() } }));
vi.mock('next/navigation', () => ({ useRouter: () => state.router }));
vi.mock('next/link', () => ({ default: ({ children, ...props }: React.PropsWithChildren<{ href: string }>) => React.createElement('a', props, children) }));
vi.mock('../apps/web/src/lib/auth', () => ({ useAuth: () => ({ user: { id: state.owner }, ready: true, configured: true }) }));
vi.mock('../apps/web/src/components/analytics-provider', () => ({ ObservedToolButton: () => null, useToolObservation: () => ({ ref: undefined, onSelect: () => {} }) }));
vi.mock('../apps/web/src/lib/api', () => ({
  api: async (route: string) => route === '/api/tools' ? { tools: [{
    tool_id: 'ai_avatar', name_ja: 'アイコンをつくる', available: false,
    minimum_input_count: 1, maximum_input_count: 4, allowed_roles: ['primary'],
    parameter_fields: [{ name: 'style', type: 'enum', required: false, values: ['anime', 'chibi', 'watercolor'] }],
    output_options: { qualities: ['standard'], aspect_ratios: ['preserve'] }, credit_cost: { standard: 1 },
  }] } : { available: 0, status: 'active' },
  ApiError: class extends Error {}, UserFacingError: class extends Error {}, errorMessage: String,
}));
let root: Root;
let host: HTMLDivElement;
function draft(style: string, instruction: string): EditorDraft {
  return { toolId: 'ai_avatar', inputs: [], parameters: { style }, instruction, quality: 'standard', aspectRatio: 'preserve', pendingRequest: EditRequest.parse({
    tool_id: 'ai_avatar', inputs: [{ image_id: '00000000-0000-4000-8000-000000000001', role: 'primary' }],
    parameters: { style }, idempotency_key: 'fixture_pending_request',
  }) };
}
async function render(style = 'anime') { await act(async () => root.render(React.createElement(EditorWorkspace, { initialTool: 'ai_avatar', initialStyle: style }))); }
beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  state.owner = 'owner-a'; sessionStorage.clear();
  host = document.createElement('div'); document.body.append(host); root = createRoot(host);
});
afterEach(async () => { await act(async () => root.unmount()); host.remove(); sessionStorage.clear(); });
it('applies a new explicit style while invalidating the old pending request', async () => {
  expect(saveDraft('owner-a', draft('watercolor', 'owner A note'))).toBe(true);
  await render();
  expect(loadDraft('owner-a')?.parameters.style).toBe('anime');
  expect(loadDraft('owner-a')?.pendingRequest).toBeUndefined();
  expect(loadDraft('owner-a')?.instruction).toBe('owner A note');
  expect(host.querySelector<HTMLInputElement>('input[value=anime]')?.checked).toBe(true);
});
it('retains the idempotent pending request when the linked style is unchanged', async () => {
  saveDraft('owner-a', draft('anime', 'same request'));
  await render();
  expect(loadDraft('owner-a')?.pendingRequest?.idempotency_key).toBe('fixture_pending_request');
});
it('restores only the new owner draft when switching accounts with a style intent', async () => {
  saveDraft('owner-a', draft('watercolor', 'private A'));
  saveDraft('owner-b', draft('chibi', 'private B'));
  await render(); state.owner = 'owner-b'; await render();
  expect(loadDraft('owner-b')?.instruction).toBe('private B');
  expect(loadDraft('owner-b')?.parameters.style).toBe('anime');
  expect(loadDraft('owner-b')?.pendingRequest).toBeUndefined();
  expect(host.querySelector('textarea')?.value).toBe('private B');
  expect(host.textContent).not.toContain('private A');
});
