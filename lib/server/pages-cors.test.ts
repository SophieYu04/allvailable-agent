import { describe, expect, it } from 'vitest';
import { pagesCors } from './pages-cors';
const origin = 'https://sophieyu04.github.io';
const url = 'https://allvailable.example/api/v1/coordination';
describe('Pages API isolation', () => {
  it('allows a Pages preflight without cookies', () => {
    const result = pagesCors(new Request(url, { method: 'OPTIONS', headers: { Origin: origin } }), origin);
    expect(result.status).toBe(204);
    expect(result.headers.get('Access-Control-Allow-Origin')).toBe(origin);
    expect(result.headers.has('Access-Control-Allow-Credentials')).toBe(false);
  });
  it('rejects untrusted origins even with a token', () => {
    const result = pagesCors(new Request(url, { headers: { Origin: 'https://evil.example', Authorization: 'Bearer example' } }), origin);
    expect(result.status).toBe(403);
    expect(result.headers.has('Access-Control-Allow-Origin')).toBe(false);
  });
  it('requires a bearer token for cross-origin requests', () => {
    expect(pagesCors(new Request(url, { headers: { Origin: origin, Cookie: 'session=example' } }), origin).status).toBe(401);
    expect(pagesCors(new Request(url, { headers: { Origin: origin, Authorization: 'Bearer example' } }), origin).status).toBeUndefined();
  });
  it('preserves same-origin and native clients', () => {
    expect(pagesCors(new Request(url), origin).status).toBeUndefined();
    expect(pagesCors(new Request(url, { headers: { Origin: new URL(url).origin } }), origin).status).toBeUndefined();
  });
});
