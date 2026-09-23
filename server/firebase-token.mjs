import { verify } from 'node:crypto';
// Firebase's documented signing-key endpoint; no URL is accepted from JWT headers.
const CERT_URL = 'https://www.googleapis.com/robot/v1/metadata/x509/securetoken@system.gserviceaccount.com';
let cached = null;
let expiresAt = 0;
export async function verifyFirebaseToken(token, { projectId, fetchFn = fetch, now = Date.now(), keys } = {}) {
  if (!projectId || typeof token !== 'string' || token.length > 20000) throw new Error('Invalid token');
  const parts = token.split('.');
  if (parts.length !== 3 || parts.some(p => !/^[A-Za-z0-9_-]+$/.test(p))) throw new Error('Invalid token');
  const header = JSON.parse(Buffer.from(parts[0], 'base64url'));
  const claims = JSON.parse(Buffer.from(parts[1], 'base64url'));
  const seconds = Math.floor(now / 1000);
  if (header.alg !== 'RS256' || typeof header.kid !== 'string' || !/^[A-Za-z0-9_-]{1,200}$/.test(header.kid)) throw new Error('Invalid signing key');
  if (claims.aud !== projectId || claims.iss !== `https://securetoken.google.com/${projectId}` ||
      typeof claims.sub !== 'string' || !claims.sub.length || claims.sub.length > 128 ||
      !Number.isFinite(claims.exp) || claims.exp <= seconds ||
      !Number.isFinite(claims.iat) || claims.iat > seconds ||
      !Number.isFinite(claims.auth_time) || claims.auth_time > seconds ||
      claims.email_verified !== true || typeof claims.email !== 'string' || !claims.email.includes('@')) throw new Error('Invalid token claims');
  if (!keys) {
    if (!cached || now >= expiresAt || !Object.hasOwn(cached, header.kid)) {
      const response = await fetchFn(CERT_URL, { signal: AbortSignal.timeout(10000) });
      if (!response.ok) throw new Error('Signing keys unavailable');
      const fetched = await response.json();
      if (!fetched || typeof fetched !== 'object' || Array.isArray(fetched)) throw new Error('Invalid signing keys');
      cached = fetched;
      const age = Number((response.headers.get('cache-control') || '').match(/max-age=(\d+)/)?.[1] || 300);
      expiresAt = now + Math.min(age, 86400) * 1000;
    }
    keys = cached;
  }
  if (!Object.hasOwn(keys, header.kid) || typeof keys[header.kid] !== 'string' ||
      !verify('RSA-SHA256', Buffer.from(parts[0] + '.' + parts[1]), keys[header.kid], Buffer.from(parts[2], 'base64url'))) throw new Error('Invalid signature');
  return claims;
}
