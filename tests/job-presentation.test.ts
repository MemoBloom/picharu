// @vitest-environment jsdom
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { JobDetail } from '../apps/web/src/components/job-detail';
import { PhotoPreview } from '../apps/web/src/components/photo-preview';
import { formatElapsed, jobElapsedSeconds, jobStep } from '../apps/web/src/lib/job-state';

const state = vi.hoisted(() => ({ api: vi.fn(), owner: 'owner-a', visibility: 'visible' }));
vi.mock('next/navigation', () => ({ usePathname: () => '/ja/jobs/job-a', useRouter: () => ({ replace: vi.fn() }), useSearchParams: () => new URLSearchParams() }));
vi.mock('next/link', () => ({ default: ({ children, ...props }: React.ComponentProps<'a'>) => React.createElement('a', props, children) }));
vi.mock('../apps/web/src/lib/auth', () => ({ useAuth: () => ({ user: { id: state.owner }, ready: true, configured: true }) }));
vi.mock('../apps/web/src/components/analytics-provider', () => ({ useResultObservation: () => ({ current: null }), ResultFeedback: () => null }));
vi.mock('../apps/web/src/lib/api', () => ({ api: (...args: unknown[]) => state.api(...args), errorMessage: () => '接続を確認してください。', ApiError: class extends Error { constructor(public status: number, public code: string, public retryable = false, public requestId?: string, public retryAfter = 0) { super('offline'); } } }));
import { ApiError } from '../apps/web/src/lib/api';
const created = '2026-10-23T10:00:00.000Z';
const job = (status = 'queued', stage = status) => ({ job_id: 'job-a', tool_id: 'illustration_photo', status, stage, created_at: created, completed_at: status === 'completed' ? '2026-10-23T10:01:25.000Z' : null, inputs: [{ image_id: 'original-a', role: 'primary' }], result_image_id: status === 'completed' ? 'result-a' : null, credits_reserved: 1 });
const asset = (name: string) => ({ preview_url: `https://fixture.invalid/${name}.png`, image_id: name });
let root: Root, host: HTMLDivElement;
const render = async (node: React.ReactNode = React.createElement(JobDetail, { jobId: 'job-a' })) => act(async () => root.render(node));
const advance = async (ms: number) => act(async () => { await vi.advanceTimersByTimeAsync(ms); });
beforeEach(() => {
  vi.useFakeTimers(); vi.setSystemTime(new Date('2026-10-23T10:01:00.000Z'));
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true); vi.clearAllMocks(); state.owner = 'owner-a'; state.visibility = 'visible';
  vi.spyOn(document, 'visibilityState', 'get').mockImplementation(() => state.visibility as DocumentVisibilityState);
  state.api.mockImplementation(async (path: string) => path.startsWith('/api/jobs/') ? job() : asset(path.split('/').at(-1)!));
  host = document.createElement('div'); document.body.append(host); root = createRoot(host);
});
afterEach(async () => { await act(async () => root.unmount()); host.remove(); vi.useRealTimers(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe('honest job progress', () => {
  it('shows time since acceptance on first view and continues through polling without creating jobs', async () => {
    await render(); expect(host.querySelector('time')?.textContent).toBe('1分00秒');
    expect(host.querySelector('[aria-current=step]')?.textContent).toContain('受付');
    await advance(5000); expect(host.querySelector('time')?.textContent).toBe('1分05秒');
    expect(state.api.mock.calls.filter(([p]) => p === '/api/jobs/job-a')).toHaveLength(2);
    expect(state.api.mock.calls.every(([, options]) => options?.method !== 'POST')).toBe(true);
    expect(host.querySelector('[role=progressbar]')).toBeNull();
  });
  it('moves from provider processing to saving and completion only on server responses, then freezes time', async () => {
    let current = job('processing', 'submitting');
    state.api.mockImplementation(async (path: string) => path.startsWith('/api/jobs/') ? current : asset(path.split('/').at(-1)!));
    await render(); expect(host.querySelector('[aria-current=step]')?.textContent).toContain('AI');
    current = job('processing', 'storing'); await advance(4000);
    expect(host.querySelector('[aria-current=step]')?.textContent).toContain('保存');
    current = job('completed', 'done'); await advance(4000);
    expect(host.querySelector('time')?.textContent).toBe('1分25秒');
    expect(host.querySelector('[aria-current=step]')).toBeNull();
    const calls = state.api.mock.calls.length; await advance(60000);
    expect(state.api.mock.calls).toHaveLength(calls); expect(host.querySelector('time')?.textContent).toBe('1分25秒');
  });
  it('keeps unknown and reconciliation stages readable without inventing completion', async () => {
    expect(jobStep({ status: 'processing', stage: 'future-stage' })).toBe(1);
    state.api.mockImplementation(async (path: string) => path.startsWith('/api/jobs/') ? job('processing', 'needs_reconciliation') : asset('original'));
    await render(); expect(host.textContent).toContain('新しく依頼し直さず');
    expect(host.querySelectorAll('li[data-state=done]')).toHaveLength(1);
  });
  it('honors Retry-After and disables manual refresh during the cooldown, including visibility changes', async () => {
    await render(); const count = () => state.api.mock.calls.filter(([p]) => p === '/api/jobs/job-a').length;
    state.api.mockImplementation(async (path: string) => { if (path.startsWith('/api/jobs/')) throw new ApiError(429, 'RATE_LIMITED', true, undefined, 30); return asset('original'); });
    await advance(4000); expect(host.textContent).toContain('接続を再確認しています');
    const button = Array.from(host.querySelectorAll('button')).find(b => b.textContent === '状態を更新')!;
    expect(button.disabled).toBe(true);
    await act(async () => document.dispatchEvent(new Event('visibilitychange'))); await advance(29000);
    expect(count()).toBe(2); await advance(1000); expect(count()).toBe(3);
  });
  it('marks automatic updates stopped after repeated errors and permits an explicit read-only retry', async () => {
    await render(); state.api.mockRejectedValue(new Error('offline'));
    for (const ms of [4000, 8000, 16000, 32000, 60000]) await advance(ms);
    expect(host.textContent).toContain('自動更新が止まっています');
    const count = state.api.mock.calls.length; await advance(120000); expect(state.api.mock.calls).toHaveLength(count);
    state.api.mockResolvedValue(job('processing', 'waiting_provider'));
    await act(async () => Array.from(host.querySelectorAll('button')).find(b => b.textContent === '状態を更新')!.click());
    expect(host.textContent).toContain('状態は自動で更新されます');
  });
  it('discards prior-owner pending assets after an account change', async () => {
    let finish!: (value: unknown) => void;
    state.api.mockImplementation(async (path: string) => path.startsWith('/api/jobs/') ? job() : new Promise(resolve => { finish = resolve; }));
    await render(); state.owner = 'owner-b'; state.api.mockResolvedValue(job('processing', 'submitting')); await render();
    await act(async () => finish(asset('private-owner-a')));
    expect(host.querySelector('img[src*="private-owner-a"]')).toBeNull();
  });
});

describe('image loading and preview states', () => {
  it('keeps a completed result in loading state until its asset arrives, independently of the original', async () => {
    let resolveResult!: (value: unknown) => void;
    state.api.mockImplementation(async (path: string) => path.startsWith('/api/jobs/') ? job('completed', 'done') : path.endsWith('result-a') ? new Promise(resolve => { resolveResult = resolve; }) : asset('original-a'));
    await render(); expect(host.textContent).toContain('画像を読み込んでいます');
    expect(host.textContent).not.toContain('プレビューを表示できません');
    await act(async () => resolveResult(asset('result-a')));
    expect(host.querySelector('img[src*="result-a"]')).not.toBeNull();
    await act(async () => host.querySelector('img[src*="result-a"]')!.dispatchEvent(new Event('load')));
    expect(host.textContent).not.toContain('画像を読み込んでいます');
    await act(async () => Array.from(host.querySelectorAll('button')).find(b => b.textContent === '元の写真')!.click());
    expect(host.querySelector('img[src*="original-a"]')).not.toBeNull();
  });
  it('offers image retry after a decoding/network failure and reloads when the source changes', async () => {
    const retry = vi.fn();
    await render(React.createElement(PhotoPreview, { src: '/portrait.png', alt: '縦長', caption: '元の写真', onRetry: retry }));
    await act(async () => host.querySelector('img')!.dispatchEvent(new Event('error')));
    expect(host.textContent).toContain('画像を表示できませんでした');
    await act(async () => host.querySelector('button')!.click()); expect(retry).toHaveBeenCalledOnce();
    await act(async () => host.querySelector('img')!.dispatchEvent(new Event('load')));
    expect(host.querySelector('img')?.getAttribute('data-loaded')).toBe('true');
    await render(React.createElement(PhotoPreview, { src: '/landscape.png', alt: '横長', caption: '仕上がり' }));
    expect(host.querySelector('img')?.getAttribute('data-loaded')).toBe('false');
  });
  it('uses the completion time and tolerates malformed or future timestamps', () => {
    expect(jobElapsedSeconds(job('completed'), Date.now() + 999000, Date.now())).toBe(85);
    expect(jobElapsedSeconds({ ...job(), created_at: 'bad' }, Date.now(), Date.now())).toBe(0);
    expect(jobElapsedSeconds({ ...job(), created_at: '2099-01-01' }, Date.now(), Date.now())).toBe(0);
    expect(formatElapsed(3661)).toBe('1時間1分01秒');
    expect(jobStep({ status: 'failed', stage: 'done' })).toBeNull();
  });
});
