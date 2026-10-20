export function publicAuthConfig(url: string | undefined, key: string | undefined, allowLocal = false) {
  if (!url || !key || /\s/.test(key)) return null;
  try {
    const endpoint = new URL(url);
    const local = allowLocal && endpoint.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(endpoint.hostname);
    if ((endpoint.protocol !== 'https:' && !local) || endpoint.username || endpoint.password || endpoint.search || endpoint.hash || endpoint.pathname !== '/') return null;
    if (!/^sb_publishable_[A-Za-z0-9_-]+$/.test(key)) {
      const parts = key.split('.');
      if (parts.length !== 3 || parts.some(part => !part)) return null;
      const payload = JSON.parse(atob(parts[1].replace(/-/g, '+').replace(/_/g, '/')));
      if (payload.role !== 'anon') return null;
    }
    return { url: endpoint.origin, key };
  } catch { return null; }
}
