import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'node:path';

export default defineConfig(({ mode }) => {
  const env = { ...loadEnv(mode, process.cwd(), 'NEXT_PUBLIC_'), ...process.env };
  const base = '/allvailable-agent/';
  const publicValues: Record<string, string> = {
    NEXT_PUBLIC_PAGES_CLIENT: 'true', NEXT_PUBLIC_BASE_PATH: base,
    NEXT_PUBLIC_API_ORIGIN: env.NEXT_PUBLIC_API_ORIGIN || '',
    NEXT_PUBLIC_SUPABASE_URL: env.NEXT_PUBLIC_SUPABASE_URL || '',
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || '',
  };
  return {
    root: resolve('pages-client'), base, publicDir: resolve('public'),
    plugins: [react()],
    resolve: { alias: [
      { find: '@/lib/supabase-browser', replacement: resolve('pages-client/supabase.ts') },
      { find: 'next/link', replacement: resolve('pages-client/navigation.tsx') },
      { find: 'next/navigation', replacement: resolve('pages-client/navigation.tsx') },
      { find: '@', replacement: resolve('.') },
    ] },
    define: Object.fromEntries(Object.entries(publicValues).map(([key, value]) => [`process.env.${key}`, JSON.stringify(value)])),
    build: { outDir: resolve('dist-pages'), emptyOutDir: true },
  };
});
