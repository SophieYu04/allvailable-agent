import { NextResponse } from 'next/server';
import { pagesCors } from './lib/server/pages-cors';
export function middleware(request: Request) {
  const result = pagesCors(request, process.env.PAGES_ORIGIN);
  if (result.status) return new NextResponse(null, { status: result.status, headers: result.headers });
  const response = NextResponse.next();
  result.headers.forEach((value, key) => response.headers.set(key, value));
  return response;
}
export const config = { matcher: '/api/:path*' };
