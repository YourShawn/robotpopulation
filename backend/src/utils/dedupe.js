import crypto from 'node:crypto';

export function normalizeUrl(url = '') {
  try {
    const u = new URL(url);
    const paramsToDrop = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content', 'gclid', 'fbclid'];
    paramsToDrop.forEach((k) => u.searchParams.delete(k));
    u.hash = '';
    const normalized = `${u.protocol}//${u.hostname}${u.pathname}${u.search}`;
    return normalized.replace(/\/+$/, '');
  } catch {
    return url.trim();
  }
}

export function hashContent({ title = '', snippet = '' }) {
  const clean = `${title}`.trim().toLowerCase() + '||' + `${snippet}`.trim().toLowerCase();
  return crypto.createHash('sha256').update(clean).digest('hex');
}
