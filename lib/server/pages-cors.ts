/** Exact-origin CORS; cross-origin requests use bearer tokens, never ambient cookies. */
export function pagesCors(request: Request, configuredOrigin: string | undefined) {
  const origin = request.headers.get('Origin');
  if (!origin || origin === new URL(request.url).origin) return { headers: new Headers() };
  if (!configuredOrigin || origin !== configuredOrigin) return { status: 403, headers: new Headers() };
  const headers = new Headers({
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'GET, POST, PATCH, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Authorization, Content-Type',
    'Access-Control-Max-Age': '600',
    'Vary': 'Origin',
  });
  if (request.method === 'OPTIONS') return { status: 204, headers };
  if (!/^Bearer\s+\S+$/i.test(request.headers.get('Authorization') || '')) return { status: 401, headers };
  return { headers };
}
