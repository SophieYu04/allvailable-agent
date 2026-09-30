import { describe, expect, it } from 'vitest';
import { buildEnvironment, deploymentEnvironment } from '../../scripts/deployment-env.mjs';

describe('Wrangler deployment environment', () => {
  it('keeps CLI settings but strips application and provider credentials', () => {
    const input = {
      PATH: '/usr/bin',
      APP_ORIGIN: 'https://demo.example',
      CLOUDFLARE_ACCOUNT_ID: 'account-id',
      NEXT_PUBLIC_SUPABASE_URL: 'https://project.supabase.co',
      NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: 'publishable-key',
      SUPABASE_SERVICE_ROLE_KEY: 'service-role-key',
      CALENDAR_TOKEN_ENCRYPTION_KEY: 'calendar-encryption-key',
      GOOGLE_CALENDAR_CLIENT_SECRET: 'google-secret',
      NEBIUS_API_KEY: 'nebius-key',
      GITHUB_TOKEN: 'github-token',
      CLOUDFLARE_API_TOKEN: 'cloudflare-token',
    };

    expect(deploymentEnvironment(input)).toEqual({
      PATH: input.PATH,
      APP_ORIGIN: input.APP_ORIGIN,
      CLOUDFLARE_ACCOUNT_ID: input.CLOUDFLARE_ACCOUNT_ID,
      NEXT_PUBLIC_SUPABASE_URL: input.NEXT_PUBLIC_SUPABASE_URL,
    });
  });

  it('lets the production build see public Supabase config without server secrets', () => {
    const input = {
      PATH: '/usr/bin',
      NEXT_PUBLIC_SUPABASE_URL: 'https://project.supabase.co',
      NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: 'public-key',
      SUPABASE_SERVICE_ROLE_KEY: 'service-role-key',
      NEBIUS_API_KEY: 'nebius-key',
      GOOGLE_CALENDAR_CLIENT_SECRET: 'google-secret',
      CLOUDFLARE_API_TOKEN: 'cloudflare-token',
    };

    expect(buildEnvironment(input)).toEqual({
      PATH: input.PATH,
      NEXT_PUBLIC_SUPABASE_URL: input.NEXT_PUBLIC_SUPABASE_URL,
      NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: input.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    });
  });
});
