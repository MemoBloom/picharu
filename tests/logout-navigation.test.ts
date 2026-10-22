// @vitest-environment jsdom
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LoginNavigation } from '../apps/web/src/components/login-navigation';
import { AccountPage } from '../apps/web/src/components/account-pages';
import { LogoutButton } from '../apps/web/src/components/logout-button';
import { SiteShell } from '../apps/web/src/components/site-shell';

const state = vi.hoisted(() => ({ user: { id: 'owner-a' } as { id: string } | null, path: '/ja/account', tab: '', signOut: vi.fn(), replace: vi.fn() }));
vi.mock('next/navigation', () => ({ usePathname: () => state.path, useSearchParams: () => new URLSearchParams(state.tab ? { tab: state.tab } : {}), useRouter: () => ({ replace: state.replace }) }));
vi.mock('next/link', () => ({ default: ({ children, ...props }: React.ComponentProps<'a'>) => React.createElement('a', props, children) }));
vi.mock('../apps/web/src/lib/auth', () => ({ useAuth: () => ({ user: state.user, ready: true, configured: true, signOut: state.signOut }) }));
vi.mock('../apps/web/src/lib/api', () => ({ api: vi.fn(async () => { throw new Error('Offline'); }), errorMessage: () => '読み込めませんでした', ApiError: class extends Error {} }));
vi.mock('../apps/web/src/components/personal-console', () => ({ PersonalOverview: () => null, PersonalWorks: () => null, PersonalLedger: () => null }));
vi.mock('../apps/web/src/components/brand', () => ({ Brand: () => React.createElement('span', null, 'picmoko') }));
vi.mock('../apps/web/src/components/analytics-consent', () => ({ AnalyticsConsent: () => null }));

let root: Root, host: HTMLDivElement;
async function flush(fn: () => void | Promise<void>) { await act(fn); }
async function render(node: React.ReactNode) { await flush(() => root.render(node)); }
const logout = () => Array.from(host.querySelectorAll('button')).find(el => el.textContent === 'ログアウト')!;
beforeEach(() => {
  vi.clearAllMocks(); state.user = { id: 'owner-a' }; state.path = '/ja/account'; state.tab = '';
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  host = document.createElement('div'); document.body.append(host); root = createRoot(host);
});
afterEach(async () => { await flush(() => root.unmount()); host.remove(); vi.unstubAllGlobals(); });

describe('visible sign-out entry points', () => {
  it.each(['', 'works', 'credits', 'orders', 'profile'])('keeps logout above every account tab, including failed API reads: %s', async tab => {
    state.tab = tab; await render(React.createElement(AccountPage));
    expect(host.querySelector('.account-page-heading')?.contains(logout())).toBe(true);
    expect(logout().disabled).toBe(false);
    const shortcuts = host.querySelector('nav[aria-label="マイページのショートカット"]')!;
    expect(shortcuts.querySelector('a[href="/ja/history"]')?.textContent).toContain('編集履歴');
    expect(shortcuts.querySelector('a[href="/ja/help"]')?.textContent).toContain('サポート');
  });
  it('opens the header disclosure, closes with Escape and restores focus', async () => {
    await render(React.createElement(LoginNavigation));
    const trigger = host.querySelector('button')!;
    expect(trigger.getAttribute('aria-expanded')).toBe('false');
    await flush(() => trigger.click());
    expect(trigger.getAttribute('aria-expanded')).toBe('true');
    expect(logout()).toBeDefined();
    expect(host.querySelector('a')?.getAttribute('href')).toBe('/ja/account');
    logout().focus();
    await flush(() => { document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' })); });
    expect(trigger.getAttribute('aria-expanded')).toBe('false');
    expect(document.activeElement).toBe(trigger);
  });
  it('closes the header disclosure on outside press and route change', async () => {
    await render(React.createElement(LoginNavigation)); const trigger = host.querySelector('button')!;
    await flush(() => trigger.click());
    await flush(() => { document.body.dispatchEvent(new Event('pointerdown', { bubbles: true })); });
    expect(trigger.getAttribute('aria-expanded')).toBe('false');
    await flush(() => trigger.click()); state.path = '/ja/edit'; await render(React.createElement(LoginNavigation));
    expect(trigger.getAttribute('aria-expanded')).toBe('false');
  });
  it('keeps the mobile bottom entry linked to the account page with its visible logout', async () => {
    await render(React.createElement(LoginNavigation, { mobile: true }));
    expect(host.querySelector('a')?.getAttribute('href')).toBe('/ja/account');
    expect(host.textContent).toBe('マイページ');
  });
  it.each(['/ja/history', '/ja/jobs/example'])('keeps My Page selected within personal editing records: %s', async path => {
    state.path = path; await render(React.createElement(LoginNavigation, { mobile: true }));
    expect(host.querySelector('a')?.getAttribute('aria-current')).toBe('page');
    expect(host.querySelector('a')?.getAttribute('href')).toBe('/ja/account');
  });
  it('keeps a failed menu logout visible for retry even when the disabled button loses focus', async () => {
    state.signOut.mockRejectedValueOnce(new Error('Offline'));
    await render(React.createElement(LoginNavigation)); const trigger = host.querySelector('button')!;
    await flush(() => trigger.click()); logout().focus();
    await flush(() => { logout().click(); logout().dispatchEvent(new FocusEvent('focusout', { bubbles: true, relatedTarget: null })); });
    expect(trigger.getAttribute('aria-expanded')).toBe('true');
    expect(host.querySelector('[role=alert]')).not.toBeNull(); expect(logout().disabled).toBe(false);
    const outside = document.createElement('button'); document.body.append(outside);
    await flush(() => outside.focus()); expect(trigger.getAttribute('aria-expanded')).toBe('false'); outside.remove();
  });
  it('returns to the login entry after identity changes', async () => {
    await render(React.createElement(LoginNavigation)); await flush(() => host.querySelector('button')!.click());
    state.user = null; await render(React.createElement(LoginNavigation));
    expect(host.querySelector('button')).toBeNull(); expect(host.querySelector('a')?.getAttribute('href')).toContain('/ja/login');
  });
  it('prevents repeat requests while pending and allows retry after a failed logout', async () => {
    let reject!: (value: Error) => void;
    state.signOut.mockReturnValueOnce(new Promise<void>((_, fail) => { reject = fail; })).mockRejectedValueOnce(new Error('Offline'));
    await render(React.createElement(LogoutButton)); const button = logout();
    await flush(() => { button.click(); button.click(); });
    expect(state.signOut).toHaveBeenCalledTimes(1); expect(button.disabled).toBe(true);
    expect(button.textContent).toContain('ログアウトしています');
    await flush(async () => { reject(new Error('Offline')); });
    expect(button.disabled).toBe(false); expect(host.querySelector('[role=alert]')?.textContent).toContain('もう一度');
    await flush(() => button.click()); expect(state.signOut).toHaveBeenCalledTimes(2);
  });
});

describe('public navigation and personal history', () => {
  it.each([true, false])('offers public support and keeps history inside the account menu (signed in: %s)', async signedIn => {
    if (!signedIn) state.user = null;
    state.path = '/ja/help'; await render(React.createElement(SiteShell, { children: 'Support content' }));
    for (const label of ['メインナビゲーション', 'モバイルナビゲーション']) {
      const nav = host.querySelector(`nav[aria-label="${label}"]`)!;
      expect(nav.querySelector('a[href="/ja/history"]')).toBeNull();
      expect(nav.querySelector('a[href="/ja/help"]')?.getAttribute('aria-current')).toBe('page');
    }
    const bottom = host.querySelector('nav[aria-label="モバイルナビゲーション"]')!;
    expect(bottom.querySelectorAll('a')).toHaveLength(4);
    expect(bottom.lastElementChild?.getAttribute('href')).toContain(signedIn ? '/ja/account' : '/ja/login');
    if (signedIn) {
      await flush(() => host.querySelector<HTMLButtonElement>('.header-account-menu > button')!.click());
      expect(host.querySelector('.account-menu-panel a[href="/ja/history"]')).not.toBeNull();
      expect(host.querySelector('.account-menu-panel a[href="/ja/help"]')).not.toBeNull();
      expect(logout()).toBeDefined();
    }
  });
  it('provides an accessible editor support shortcut without adding a second mobile action bar', async () => {
    state.path = '/ja/edit'; await render(React.createElement(SiteShell, { children: 'Editor content' }));
    const support = host.querySelector('.header-context-link')!;
    expect(support.getAttribute('href')).toBe('/ja/help');
    expect(support.getAttribute('aria-label')).toBe('サポート');
    expect(host.querySelector('nav[aria-label="モバイルナビゲーション"]')).toBeNull();
  });
});
